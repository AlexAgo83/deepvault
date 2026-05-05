from __future__ import annotations

import asyncio
import hashlib
import json
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import httpx

from worker.app.config import Settings
from worker.app.errors import http_error
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.infra.time import utc_now_iso
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.live_export_service import LiveExportService


SUPPORTED_JOB_TYPES = {"ingest", "analyze", "publish-analysis", "evaluate", "export-live"}
ALL_JOB_TYPES = {"ingest", "analyze", "publish-analysis", "evaluate", "export-live"}
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
ANALYSIS_VERSION = "1.0"
DEFAULT_ANALYZE_LIMIT = 12
DEFAULT_PROVIDER_MODELS = {
    "local": "heuristic-v1",
    "openai": "gpt-5.4-mini",
    "gemini": "gemini-2.0-flash",
    "anthropic": "claude-3-5-sonnet-latest",
}
ANALYSIS_PROMPT_CONTENT_LIMIT = 600
ANALYSIS_MAX_OUTPUT_TOKENS = 350
PROVIDER_COST_PER_1K_TOKENS: Dict[str, Dict[str, float]] = {
    "openai":    {"input": 0.005,  "output": 0.015},
    "anthropic": {"input": 0.004,  "output": 0.012},
    "gemini":    {"input": 0.0025, "output": 0.0075},
    "local":     {"input": 0.0,    "output": 0.0},
}
PROVIDER_CALL_TIMEOUT = 30.0


def build_evaluation_rows() -> List[Dict[str, Any]]:
    return [
        {"id": "Q01", "query": "What is the budget for Q3 2025?", "expectedSourceId": "q3-budget", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q02", "query": "Who is the project lead for Project Alpha?", "expectedSourceId": "project-alpha-lead", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q03", "query": "What were the decisions made in the last board meeting?", "expectedSourceId": "board-meeting-notes", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q04", "query": "What are the IT security requirements for remote access?", "expectedSourceId": "remote-access-policy", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q05", "query": "Summarize the Q4 2024 product roadmap.", "expectedSourceId": "product-roadmap-q4-2024", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q06", "query": "What is the onboarding process for new employees?", "expectedSourceId": "onboarding-process", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q07", "query": "What are the current open risks on the Alpha project?", "expectedSourceId": "alpha-risk-register", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q08", "query": "Who approved the infrastructure spend for FY2025?", "expectedSourceId": "infra-spend-approval", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q09", "query": "What is the escalation path for a P1 incident?", "expectedSourceId": "p1-escalation", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q10", "query": "Explain the data classification policy.", "expectedSourceId": "data-classification-policy", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q11", "query": "What tools are approved for use by the engineering team?", "expectedSourceId": "approved-tools-policy", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q12", "query": "What is the deadline for the Q1 2026 compliance audit?", "expectedSourceId": "compliance-audit-deadline", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q13", "query": "Give me a summary of the Alpha project status as of last month.", "expectedSourceId": "alpha-status-report", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q14", "query": "What SharePoint sites are available for the Finance team?", "expectedSourceId": None, "role": "analyst", "expectedStatus": "no_answer"},
        {"id": "Q15", "query": "What are the quarterly OKRs for the product team?", "expectedSourceId": "quarterly-okrs", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q16", "query": "Who should I contact for budget approval?", "expectedSourceId": "budget-approval-contact", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q17", "query": "What is the vendor onboarding checklist?", "expectedSourceId": "vendor-onboarding-checklist", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q18", "query": "What are the known issues with the current SSO implementation?", "expectedSourceId": "sso-issues", "role": "analyst", "expectedStatus": "answered"},
        {"id": "Q19", "query": "What are the restricted launch notes for the stealth lab?", "expectedSourceId": "secret-launch-notes", "role": "guest", "expectedStatus": "no_permitted_sources"},
        {"id": "Q20", "query": "What is the cobalt orchard relocation timeline?", "expectedSourceId": None, "role": "analyst", "expectedStatus": "no_answer"},
    ]


class JobCancelledError(Exception):
    pass


class JobsService:
    def __init__(
        self,
        *,
        settings: Settings,
        runtime_store: RuntimeStore,
        corpus_service: CorpusService,
        bishop_service: BishopService,
        live_export_service: LiveExportService,
    ) -> None:
        self._settings = settings
        self._runtime_store = runtime_store
        self._corpus_service = corpus_service
        self._bishop_service = bishop_service
        self._live_export_service = live_export_service
        self._lock = threading.Lock()
        self._threads: Dict[str, threading.Thread] = {}

    def start_job(
        self,
        *,
        job_type: str,
        options: Optional[Dict[str, Any]] = None,
        launched_by: Optional[str] = None,
        client: Optional[str] = None,
        effective_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        job = self._create_job(
            job_type=job_type,
            options=options,
            launched_by=launched_by,
            client=client,
            effective_config=effective_config,
        )
        job_id = str(job["jobId"])
        thread = threading.Thread(target=self._run_job, args=(job_id,), daemon=True)
        with self._lock:
            self._threads[job_id] = thread
        thread.start()
        return {"jobId": job_id, "status": "running"}

    def run_job(
        self,
        *,
        job_type: str,
        options: Optional[Dict[str, Any]] = None,
        launched_by: Optional[str] = None,
        client: Optional[str] = None,
        effective_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        job = self._create_job(
            job_type=job_type,
            options=options,
            launched_by=launched_by,
            client=client,
            effective_config=effective_config,
        )
        job_id = str(job["jobId"])
        self._run_job(job_id)
        return self.get_job(job_id)

    def _create_job(
        self,
        *,
        job_type: str,
        options: Optional[Dict[str, Any]] = None,
        launched_by: Optional[str] = None,
        client: Optional[str] = None,
        effective_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if job_type not in ALL_JOB_TYPES:
            raise http_error(code="invalid_request", message=f"Unsupported job type: {job_type}", status_code=400)

        job_id = str(uuid4())
        started_at = utc_now_iso()
        job = {
            "jobId": job_id,
            "type": job_type,
            "status": "queued",
            "startedAt": started_at,
            "finishedAt": None,
            "summary": None,
            "result": None,
            "error": None,
            "launchedBy": launched_by,
            "client": client,
            "effectiveConfig": effective_config,
            "options": options or {},
        }
        self._runtime_store.write_job_metadata(job_id, job)
        self._append_event(job_id, "status", {"status": "queued", "message": f"{job_type} queued"})
        self._update_job(job_id, {"status": "running"})
        self._append_event(job_id, "status", {"status": "running", "message": f"{job_type} started"})
        return job

    def get_job(self, job_id: str) -> Dict[str, Any]:
        job = self._runtime_store.read_job_metadata(job_id)
        if job is None:
            raise http_error(code="not_found", message=f"Unknown job: {job_id}", status_code=404)
        return job

    def cancel_job(self, job_id: str) -> Dict[str, Any]:
        job = self.get_job(job_id)
        if job["status"] in TERMINAL_STATUSES:
            return job

        cancelled_at = utc_now_iso()
        summary = f"{job['type']} cancelled."
        self._update_job(
            job_id,
            {
                "status": "cancelled",
                "finishedAt": cancelled_at,
                "summary": summary,
                "error": None,
                "cancelRequested": True,
            },
        )
        self._append_event(job_id, "status", {"status": "cancelled", "message": summary})
        return self.get_job(job_id)

    async def stream_job_events(self, job_id: str):
        if self._runtime_store.read_job_metadata(job_id) is None:
            raise http_error(code="not_found", message=f"Unknown job: {job_id}", status_code=404)

        cursor = 0
        while True:
            events = self._runtime_store.read_job_events(job_id)
            while cursor < len(events):
                record = events[cursor]
                cursor += 1
                yield {"data": json.dumps(self._normalize_stream_event(record))}

            job = self._runtime_store.read_job_metadata(job_id)
            if job and job.get("status") in TERMINAL_STATUSES:
                return
            await asyncio.sleep(0.1)

    def _normalize_stream_event(self, record: Dict[str, Any]) -> Dict[str, Any]:
        event_name = str(record.get("event", "message"))
        data = record.get("data", {})
        if not isinstance(data, dict):
            return {"type": "line", "text": str(data)}

        if event_name == "progress":
            return {
                "type": "progress",
                "step": data.get("step"),
                "pct": data.get("pct"),
                "text": data.get("message"),
            }

        if event_name == "status":
            status = str(data.get("status", ""))
            message = data.get("message")
            if status == "succeeded":
                return {"type": "done", "exitCode": 0, "text": message}
            if status == "failed":
                return {"type": "done", "exitCode": 1, "text": message, "isError": True}
            if status == "cancelled":
                return {"type": "done", "exitCode": 130, "text": message, "isError": True}
            return {"type": "line", "text": message}

        return {"type": "line", "text": data.get("message") or json.dumps(data)}

    def _run_job(self, job_id: str) -> None:
        job = self._runtime_store.read_job_metadata(job_id)
        if job is None:
            return

        job_type = job["type"]
        options = job.get("options") if isinstance(job.get("options"), dict) else {}
        try:
            if job_type not in SUPPORTED_JOB_TYPES:
                raise NotImplementedError(f"Job type '{job_type}' is not implemented on the Python worker yet.")

            if job_type == "ingest":
                result = self._run_ingest_job(job_id, options)
            elif job_type == "analyze":
                result = self._run_analyze_job(job_id, options)
            elif job_type == "publish-analysis":
                result = self._run_publish_analysis_job(job_id, options)
            elif job_type == "evaluate":
                result = self._run_evaluate_job(job_id)
            elif job_type == "export-live":
                result = self._run_export_live_job(job_id, options)
            else:
                raise NotImplementedError(f"Job type '{job_type}' is not implemented on the Python worker yet.")

            final_state = self._runtime_store.read_job_metadata(job_id) or {}
            if final_state.get("status") == "cancelled":
                return

            self._update_job(
                job_id,
                {
                    "status": "succeeded",
                    "finishedAt": utc_now_iso(),
                    "summary": result["summary"],
                    "result": result,
                    "error": None,
                },
            )
            self._append_event(job_id, "status", {"status": "succeeded", "message": result["summary"]})
        except JobCancelledError:
            final_state = self._runtime_store.read_job_metadata(job_id) or {}
            if final_state.get("status") != "cancelled":
                self._update_job(
                    job_id,
                    {
                        "status": "cancelled",
                        "finishedAt": utc_now_iso(),
                        "summary": f"{job_type} cancelled.",
                        "error": None,
                    },
                )
                self._append_event(job_id, "status", {"status": "cancelled", "message": f"{job_type} cancelled."})
        except Exception as exc:
            self._update_job(
                job_id,
                {
                    "status": "failed",
                    "finishedAt": utc_now_iso(),
                    "summary": str(exc),
                    "error": str(exc),
                },
            )
            self._append_event(job_id, "status", {"status": "failed", "message": str(exc)})

    def _run_evaluate_job(self, job_id: str) -> Dict[str, Any]:
        rows = build_evaluation_rows()
        results: List[Dict[str, Any]] = []

        for index, row in enumerate(rows):
            current_job = self._runtime_store.read_job_metadata(job_id) or {}
            if current_job.get("status") == "cancelled" or current_job.get("cancelRequested") is True:
                raise JobCancelledError()

            payload = self._bishop_service.query(
                query=row["query"],
                role=row["role"],
                provider="openai",
                history=[],
            )
            source_ids = [source["id"] for source in payload.get("sources", [])]
            denied_source_ids = [source["id"] for source in payload.get("deniedSources", [])]
            passed = payload["status"] == row["expectedStatus"]
            if row["expectedStatus"] == "answered" and row["expectedSourceId"]:
                passed = passed and row["expectedSourceId"] in source_ids
            if row["expectedStatus"] == "no_permitted_sources" and row["expectedSourceId"]:
                passed = passed and row["expectedSourceId"] in denied_source_ids

            results.append(
                {
                    "queryId": row["id"],
                    "status": payload["status"],
                    "expectedStatus": row["expectedStatus"],
                    "sourceIds": source_ids,
                    "deniedSourceIds": denied_source_ids,
                    "passed": passed,
                }
            )
            pct = round(((index + 1) / len(rows)) * 100)
            self._append_event(
                job_id,
                "progress",
                {
                    "step": row["id"],
                    "pct": pct,
                    "message": f"Evaluated {row['id']} ({index + 1}/{len(rows)})",
                },
            )

        pass_count = sum(1 for result in results if result["passed"])
        total_count = len(results)
        pass_rate = round(pass_count / total_count, 2) if total_count else 0

        return {
            "summary": f"Evaluation completed: {pass_count}/{total_count} queries passed.",
            "passCount": pass_count,
            "totalCount": total_count,
            "passRate": pass_rate,
            "results": results,
        }

    def _run_ingest_job(self, job_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        env = options.get("env", {}) if isinstance(options, dict) else {}
        mode = "live" if env.get("DEEPVAULT_DATA_MODE") == "live" else "mock"
        input_path = env.get("DEEPVAULT_CORPUS_PATH")

        self._append_event(
            job_id,
            "progress",
            {
                "step": "load-corpus",
                "pct": 20,
                "message": f"Loading {mode} corpus snapshot...",
            },
        )
        corpus_path = self._corpus_service.resolve_job_corpus_path(mode=mode, input_path=input_path)
        corpus = self._corpus_service.load_job_corpus_payload(mode=mode, input_path=input_path)

        role = str(corpus.get("defaultUserRole") or "analyst")
        permitted_documents = [
            document
            for document in corpus.get("documents", [])
            if role in document.get("access", []) or "all" in document.get("access", [])
        ]
        last_run = None
        sync_runs = corpus.get("syncRuns", [])
        if isinstance(sync_runs, list) and sync_runs:
            last_run = max(sync_runs, key=lambda run: str(run.get("finishedAt", "")))

        site_summaries = []
        for site in corpus.get("sites", []):
            site_documents = [document for document in corpus.get("documents", []) if document.get("siteId") == site.get("id")]
            permitted_site_documents = [
                document
                for document in site_documents
                if role in document.get("access", []) or "all" in document.get("access", [])
            ]
            latest_sync = None
            if isinstance(sync_runs, list) and sync_runs:
                matching_runs = [run for run in sync_runs if site.get("id") in run.get("siteIds", [])]
                if matching_runs:
                    latest_sync = max(matching_runs, key=lambda run: str(run.get("finishedAt", "")))

            site_summaries.append(
                {
                    **site,
                    "documentCount": len(site_documents),
                    "permittedDocumentCount": len(permitted_site_documents),
                    "chunkCount": len(permitted_site_documents) * 6,
                    "lastRefresh": latest_sync.get("finishedAt") if latest_sync else None,
                    "lastRefreshStatus": latest_sync.get("status") if latest_sync else "pending",
                }
            )

        sync_overview = {
            "siteSummaries": site_summaries,
            "documentCount": len(permitted_documents),
            "chunkCount": len(permitted_documents) * 6,
            "syncedSites": len([site for site in site_summaries if site.get("status") == "synced"]),
            "restrictedSites": len([site for site in site_summaries if site.get("status") == "restricted"]),
            "providerReadiness": corpus.get("providers", []),
            "lastRun": last_run,
            "refreshPolicy": "Incremental daily refresh with manual refresh on demand",
        }
        summary = {
            **sync_overview,
            "sourcesIndexed": len(corpus.get("documents", [])),
            "visibleSources": len(permitted_documents),
            "deniedSources": len(corpus.get("documents", [])) - len(permitted_documents),
        }

        self._append_event(
            job_id,
            "progress",
            {
                "step": "write-sync-state",
                "pct": 75,
                "message": "Writing worker sync snapshot...",
            },
        )
        payload = {
            "generatedAt": utc_now_iso(),
            "mode": mode,
            "corpusPath": str(corpus_path),
            "summary": summary,
            "syncOverview": sync_overview,
            "sites": site_summaries,
        }
        output_path = self._runtime_store.write_sync_state(payload, mode=mode)
        return {
            "summary": f"Ingest completed: wrote {output_path.name} for {summary['visibleSources']} visible documents.",
            "mode": mode,
            "corpusPath": str(corpus_path),
            "outputPath": str(output_path),
            "visibleSources": summary["visibleSources"],
            "sourcesIndexed": summary["sourcesIndexed"],
            "siteCount": len(site_summaries),
        }

    def _run_analyze_job(self, job_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        env = options.get("env", {}) if isinstance(options, dict) else {}
        mode = "live" if env.get("DEEPVAULT_DATA_MODE") == "live" else "mock"
        input_path = env.get("DEEPVAULT_CORPUS_PATH")
        provider = str(env.get("DEEPVAULT_ANALYZE_PROVIDER") or "local")
        limit = max(1, int(env.get("DEEPVAULT_ANALYZE_LIMIT") or DEFAULT_ANALYZE_LIMIT))
        model = DEFAULT_PROVIDER_MODELS.get(provider, DEFAULT_PROVIDER_MODELS["local"])

        # Resolve API key for the requested provider
        api_key = ""
        if provider == "anthropic":
            api_key = str(env.get("ANTHROPIC_API_KEY") or self._settings.anthropic_api_key).strip()
        elif provider == "openai":
            api_key = str(env.get("OPENAI_API_KEY") or self._settings.openai_api_key).strip()
        elif provider == "gemini":
            api_key = str(env.get("GEMINI_API_KEY") or self._settings.gemini_api_key).strip()
        use_provider = provider != "local" and bool(api_key)

        self._append_event(
            job_id,
            "progress",
            {
                "step": "load-corpus",
                "pct": 10,
                "message": f"Loading {mode} corpus for analysis ({provider}{'' if use_provider else ' — no API key, using local heuristic'})...",
            },
        )
        corpus_path = self._corpus_service.resolve_job_corpus_path(mode=mode, input_path=input_path)
        corpus = self._corpus_service.load_job_corpus_payload(mode=mode, input_path=input_path)
        documents = corpus.get("documents", [])
        total_documents = len(documents)

        analyzed = 0
        failed = 0
        excluded = 0
        reused = 0
        stale = 0
        actual_input_tokens = 0
        actual_output_tokens = 0
        provider_attempts = 0
        provider_successes = 0
        provider_fallbacks = 0
        provider_failure_reasons: Dict[str, int] = {}
        selection_reasons: Dict[str, int] = {}
        exclusion_reasons: Dict[str, int] = {}
        extraction_quality: Dict[str, int] = {
            "full_text": 0,
            "partial_text": 0,
            "metadata_only": 0,
            "unreadable": 0,
            "unknown": 0,
        }
        analyzed_documents: List[Dict[str, Any]] = []
        job_started_at = time.monotonic()

        for index, document in enumerate(documents):
            current_job = self._runtime_store.read_job_metadata(job_id) or {}
            if current_job.get("status") == "cancelled" or current_job.get("cancelRequested") is True:
                raise JobCancelledError()

            analysis_input = self._resolve_analysis_input(document)
            extraction_status = str(analysis_input.get("extractionStatus") or "unknown")
            extraction_quality[extraction_status] = extraction_quality.get(extraction_status, 0) + 1
            content_hash = self._build_content_hash(document, str(analysis_input.get("text") or ""))
            existing_analysis = document.get("analysis")
            if self._should_reuse_existing_analysis(existing_analysis, content_hash):
                reused += 1
                analyzed_documents.append(document)
                continue

            exclusion_reason = self._get_analysis_exclusion_reason(document, analysis_input)
            if exclusion_reason:
                excluded += 1
                exclusion_reasons[exclusion_reason] = exclusion_reasons.get(exclusion_reason, 0) + 1
                analyzed_documents.append(
                    {
                        **document,
                        "analysis": {
                            "status": "excluded",
                            "version": ANALYSIS_VERSION,
                            "contentHash": content_hash,
                            "excludedReason": exclusion_reason,
                        },
                    }
                )
                continue

            if analyzed >= limit:
                stale += 1
                analyzed_documents.append(
                    {
                        **document,
                        "analysis": {
                            "status": "stale",
                            "version": ANALYSIS_VERSION,
                            "contentHash": content_hash,
                            "failureReason": "run_budget_reached",
                        },
                    }
                )
                continue

            try:
                analyzed += 1
                selection_reason = self._select_analysis_candidate_reason(document, analysis_input)
                selection_reasons[selection_reason] = selection_reasons.get(selection_reason, 0) + 1

                if use_provider:
                    provider_attempts += 1
                    provider_result, in_tok, out_tok, failure_reason = self._run_provider_analysis(
                        document, analysis_input, provider, model, api_key, content_hash
                    )
                    actual_input_tokens += in_tok
                    actual_output_tokens += out_tok
                    if provider_result is not None:
                        analysis = provider_result
                        provider_successes += 1
                    else:
                        fallback_reason = failure_reason or "provider_analysis_unavailable"
                        provider_failure_reasons[fallback_reason] = provider_failure_reasons.get(fallback_reason, 0) + 1
                        provider_fallbacks += 1
                        heuristic = self._build_local_analysis(
                            document,
                            analysis_input=analysis_input,
                            provider=provider,
                            model=model,
                            content_hash=content_hash,
                        )
                        analysis = {
                            **heuristic,
                            "provider": "local",
                            "model": DEFAULT_PROVIDER_MODELS["local"],
                            "requestedProvider": provider,
                            "requestedModel": model,
                            "providerStatus": "fallback",
                            "fallbackReason": fallback_reason,
                        }
                else:
                    analysis = self._build_local_analysis(
                        document,
                        analysis_input=analysis_input,
                        provider=provider,
                        model=model,
                        content_hash=content_hash,
                    )

                analyzed_documents.append({**document, "analysis": analysis})
            except Exception as exc:
                failed += 1
                analyzed -= 1
                analyzed_documents.append(
                    {
                        **document,
                        "analysis": {
                            "status": "failed",
                            "version": ANALYSIS_VERSION,
                            "contentHash": content_hash,
                            "failureReason": str(exc),
                        },
                    }
                )

            pct = 10 + round(((index + 1) / max(total_documents, 1)) * 75)
            if analyzed > 0 and (analyzed == limit or analyzed % 5 == 0):
                progress_msg = f"Analyzed {analyzed}/{limit} documents."
                if use_provider:
                    progress_msg += f" (provider: {provider_successes} ok, {provider_fallbacks} fallback)"
                self._append_event(
                    job_id,
                    "progress",
                    {
                        "step": "analyze-documents",
                        "pct": min(pct, 90),
                        "message": progress_msg,
                    },
                )

        self._append_event(
            job_id,
            "progress",
            {
                "step": "write-analysis-artifacts",
                "pct": 95,
                "message": "Writing derived analysis artifacts...",
            },
        )

        analyzed_corpus = {**corpus, "documents": analyzed_documents}
        analyzed_corpus_path = self._runtime_store.write_json_artifact(
            self._runtime_store.analyzed_corpus_path(),
            analyzed_corpus,
        )
        elapsed_ms = round((time.monotonic() - job_started_at) * 1000)
        estimated_input_tokens = analyzed * 900
        estimated_output_tokens = analyzed * 220
        has_actual_tokens = actual_input_tokens > 0 or actual_output_tokens > 0
        token_count_mode = "actual" if has_actual_tokens else "estimated"
        pricing = PROVIDER_COST_PER_1K_TOKENS.get(provider if use_provider else "local", PROVIDER_COST_PER_1K_TOKENS["local"])
        in_tok = actual_input_tokens if has_actual_tokens else estimated_input_tokens
        out_tok = actual_output_tokens if has_actual_tokens else estimated_output_tokens
        estimated_cost_usd = round((in_tok / 1000) * pricing["input"] + (out_tok / 1000) * pricing["output"], 6)
        report = {
            "schemaVersion": "1.0",
            "analysisVersion": ANALYSIS_VERSION,
            "generatedAt": utc_now_iso(),
            "provider": provider,
            "model": model,
            "inputPath": str(corpus_path),
            "outputPath": str(analyzed_corpus_path),
            "corpusMode": mode,
            "selectionMode": "necessary",
            "limit": limit,
            "scanned": total_documents,
            "selected": analyzed + failed + stale,
            "analyzed": analyzed,
            "failed": failed,
            "excluded": excluded,
            "reused": reused,
            "stale": stale,
            "exclusionReasons": exclusion_reasons,
            "selectionReasons": selection_reasons,
            "estimatedInputTokens": estimated_input_tokens,
            "estimatedOutputTokens": estimated_output_tokens,
            "estimatedCostUsd": estimated_cost_usd,
            "actualInputTokens": actual_input_tokens,
            "actualOutputTokens": actual_output_tokens,
            "tokenCountMode": token_count_mode,
            "providerAttempts": provider_attempts,
            "providerSuccesses": provider_successes,
            "providerFallbacks": provider_fallbacks,
            "providerFailureReasons": provider_failure_reasons,
            "extractionQuality": extraction_quality,
            "elapsedMs": elapsed_ms,
            "averageDocumentMs": round(elapsed_ms / analyzed) if analyzed > 0 else 0,
        }
        report_path = self._runtime_store.write_json_artifact(self._runtime_store.analyze_report_path(), report)
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Provider: {provider}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Model: {model}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Token count mode: {token_count_mode}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Actual input tokens: {actual_input_tokens}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Actual output tokens: {actual_output_tokens}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Provider successes: {provider_successes}",
            },
        )
        self._append_event(
            job_id,
            "progress",
            {
                "step": "analysis-summary",
                "pct": 98,
                "message": f"Provider fallbacks: {provider_fallbacks}",
            },
        )
        return {
            "summary": f"Analyze completed: wrote {analyzed_corpus_path.name} and {report_path.name}.",
            "mode": mode,
            "provider": provider,
            "model": model,
            "inputPath": str(corpus_path),
            "outputPath": str(analyzed_corpus_path),
            "reportPath": str(report_path),
            "analyzed": analyzed,
            "excluded": excluded,
            "reused": reused,
            "stale": stale,
            "failed": failed,
            "actualInputTokens": actual_input_tokens,
            "actualOutputTokens": actual_output_tokens,
            "tokenCountMode": token_count_mode,
            "providerAttempts": provider_attempts,
            "providerSuccesses": provider_successes,
            "providerFallbacks": provider_fallbacks,
            "extractionQuality": extraction_quality,
        }

    def _run_publish_analysis_job(self, job_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        env = options.get("env", {}) if isinstance(options, dict) else {}
        mode = "live" if env.get("DEEPVAULT_DATA_MODE") == "live" else "mock"

        analyzed_path = self._runtime_store.analyzed_corpus_path()
        if not analyzed_path.exists():
            raise FileNotFoundError(
                f"Analyzed corpus not found at {analyzed_path}. Run Analyze first."
            )

        self._append_event(job_id, "progress", {"step": "load-analyzed", "pct": 20, "message": "Loading analyzed corpus..."})
        corpus = json.loads(analyzed_path.read_text(encoding="utf-8"))

        self._append_event(job_id, "progress", {"step": "publish-live-corpus", "pct": 55, "message": "Publishing analyzed corpus to live-corpus.json..."})
        live_corpus_path = self._runtime_store.live_corpus_path()
        self._runtime_store.write_json_artifact(live_corpus_path, corpus)

        self._append_event(job_id, "progress", {"step": "write-sync-state", "pct": 85, "message": "Refreshing sync snapshot..."})
        from worker.app.services.live_export_service import LiveExportService
        sync_payload = LiveExportService(
            settings=self._settings,
            runtime_store=self._runtime_store,
            corpus_service=self._corpus_service,
        )._build_sync_state_payload(corpus=corpus, mode=mode, corpus_path=live_corpus_path)
        self._runtime_store.write_sync_state(sync_payload, mode=mode)

        documents = corpus.get("documents", []) if isinstance(corpus.get("documents"), list) else []
        analyzed_count = sum(
            1 for doc in documents
            if isinstance(doc, dict) and isinstance(doc.get("analysis"), dict) and doc["analysis"].get("status") == "analyzed"
        )
        return {
            "summary": f"Publish-analysis completed: {analyzed_count}/{len(documents)} documents analyzed in {live_corpus_path.name}.",
            "mode": mode,
            "inputPath": str(analyzed_path),
            "outputPath": str(live_corpus_path),
            "documentCount": len(documents),
            "analyzedCount": analyzed_count,
        }

    def _run_export_live_job(self, job_id: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        env = options.get("env", {}) if isinstance(options, dict) else {}
        return self._live_export_service.run_export(
            env=env,
            report_progress=lambda step, pct, message: self._append_event(
                job_id,
                "progress",
                {"step": step, "pct": pct, "message": message},
            ),
            check_cancelled=lambda: self._raise_if_cancelled(job_id),
        )

    def _build_content_hash(self, document: Dict[str, Any], input_text: Optional[str] = None) -> str:
        payload = "\n".join(
            [
                str(document.get("updatedAt", "")),
                str(document.get("summary", "")),
                str(input_text if input_text is not None else document.get("content", "")),
                str(document.get("directAnswer", "")),
                str(document.get("extractionStatus", "")),
                str(document.get("extractionReason", "")),
                str(document.get("extractPath", "")),
            ]
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _resolve_analysis_input(self, document: Dict[str, Any]) -> Dict[str, Any]:
        extract_path = str(document.get("extractPath") or "").strip()
        if extract_path:
            try:
                path = self._runtime_store.runtime_dir / extract_path
                payload = json.loads(path.read_text(encoding="utf-8"))
                text = str(payload.get("text") or "").strip() if isinstance(payload, dict) else ""
                if text:
                    return {
                        "text": text,
                        "source": "extract",
                        "extractionStatus": document.get("extractionStatus") or "full_text",
                        "extractionReason": document.get("extractionReason") or "",
                    }
            except Exception:
                pass

        content = str(document.get("content") or "")
        if document.get("extractionStatus") in {"metadata_only", "unreadable"} or self._is_metadata_only_content(content):
            return {
                "text": "",
                "source": "metadata_only",
                "extractionStatus": document.get("extractionStatus") or "metadata_only",
                "extractionReason": document.get("extractionReason") or "",
            }

        return {
            "text": content.strip(),
            "source": "corpus",
            "extractionStatus": document.get("extractionStatus") or "unknown",
            "extractionReason": document.get("extractionReason") or "",
        }

    def _is_metadata_only_content(self, value: str) -> bool:
        return bool(re.match(r"^Source:\s", value.strip(), flags=re.IGNORECASE) and re.search(r"\bPath:\s", value))

    def _infer_document_type(self, document: Dict[str, Any]) -> str:
        return str(document.get("fileType") or document.get("kind") or str(document.get("path", "")).split(".")[-1] or "document")

    def _build_analysis_sections(self, document: Dict[str, Any], analysis_input: Dict[str, Any]) -> List[Dict[str, str]]:
        sections = document.get("sections")
        if not str(analysis_input.get("text") or "").strip() and isinstance(sections, list) and sections:
            return [section for section in sections[:4] if isinstance(section, dict)]

        sentences = [
            sentence.strip()
            for sentence in str(analysis_input.get("text") or "").replace("\n", " ").split(".")
            if sentence.strip()
        ][:3]
        return [
            {
                "heading": "Overview" if index == 0 else f"Section {index + 1}",
                "content": f"{sentence}.",
            }
            for index, sentence in enumerate(sentences)
        ]

    def _build_keywords(self, document: Dict[str, Any]) -> List[str]:
        raw = " ".join(
            [str(document.get("title", "")), str(document.get("summary", ""))]
            + [str(tag) for tag in document.get("tags", []) if isinstance(tag, str)]
        ).lower()
        tokens = [
            token
            for token in "".join(char if char.isalnum() or char.isspace() else " " for char in raw).split()
            if len(token) > 3
        ]
        deduped: List[str] = []
        for token in tokens:
            if token not in deduped:
                deduped.append(token)
        return deduped[:8]

    def _build_local_analysis(
        self,
        document: Dict[str, Any],
        *,
        analysis_input: Dict[str, Any],
        provider: str,
        model: str,
        content_hash: str,
    ) -> Dict[str, Any]:
        sections = self._build_analysis_sections(document, analysis_input)
        summary = str(document.get("summary") or (sections[0].get("content") if sections else "") or document.get("title") or "").strip()
        confidence = max(55, min(92, 58 + (len(sections) * 8) + (6 if document.get("tags") else 0)))
        effective_provider = "local"
        effective_model = DEFAULT_PROVIDER_MODELS["local"]
        analysis: Dict[str, Any] = {
            "status": "analyzed",
            "version": ANALYSIS_VERSION,
            "provider": effective_provider,
            "requestedProvider": provider,
            "model": effective_model,
            "requestedModel": model,
            "analyzedAt": utc_now_iso(),
            "contentHash": content_hash,
            "summary": summary,
            "keywords": self._build_keywords(document),
            "sections": sections,
            "documentType": self._infer_document_type(document),
            "confidence": confidence,
            "providerStatus": "local" if provider == "local" else "fallback",
        }
        if provider != "local":
            analysis["fallbackReason"] = "provider_not_wired_on_worker_yet"
        return analysis

    # ------------------------------------------------------------------
    # Provider-backed analysis
    # ------------------------------------------------------------------

    def _build_provider_prompt(self, document: Dict[str, Any], analysis_input: Dict[str, Any]) -> str:
        content_snippet = str(analysis_input.get("text") or "")[:ANALYSIS_PROMPT_CONTENT_LIMIT].strip()
        tags = document.get("tags", [])
        tags_str = ", ".join(str(t) for t in tags) if isinstance(tags, list) and tags else "none"
        return "\n".join([
            "Analyze the document below and return a JSON object with these exact fields:",
            '- "summary": 1-2 sentence summary (string)',
            '- "keywords": up to 8 relevant keywords (array of strings)',
            '- "sections": up to 4 sections each with "heading" (string) and "content" (string) (array)',
            '- "documentType": document type such as report, policy, spreadsheet, presentation (string)',
            '- "confidence": confidence score 55-95 (number)',
            "Return only the JSON object, no other text.",
            "",
            f"Title: {document.get('title', '')}",
            f"Tags: {tags_str}",
            f"Extraction status: {analysis_input.get('extractionStatus') or 'unknown'}",
            f"Content snippet:\n{content_snippet}",
        ])

    def _parse_provider_response(
        self,
        raw_text: str,
        document: Dict[str, Any],
        content_hash: str,
        provider: str,
        model: str,
    ) -> Optional[Dict[str, Any]]:
        match = re.search(r"\{[\s\S]*\}", raw_text)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except (json.JSONDecodeError, ValueError):
            return None
        summary = str(parsed.get("summary", "")).strip()
        if not summary:
            return None
        raw_keywords = parsed.get("keywords", [])
        keywords = [k for k in raw_keywords if isinstance(k, str)][:8] or self._build_keywords(document)
        raw_sections = parsed.get("sections", [])
        analysis_input = {"text": str(document.get("content") or "")}
        sections = [
            s for s in raw_sections
            if isinstance(s, dict) and isinstance(s.get("heading"), str) and isinstance(s.get("content"), str)
        ][:4] or self._build_analysis_sections(document, analysis_input)
        document_type = str(parsed.get("documentType") or self._infer_document_type(document))
        try:
            confidence = max(55, min(95, int(parsed["confidence"])))
        except (KeyError, TypeError, ValueError):
            confidence = 75
        return {
            "status": "analyzed",
            "version": ANALYSIS_VERSION,
            "provider": provider,
            "requestedProvider": provider,
            "model": model,
            "requestedModel": model,
            "analyzedAt": utc_now_iso(),
            "contentHash": content_hash,
            "summary": summary,
            "keywords": keywords,
            "sections": sections,
            "documentType": document_type,
            "confidence": confidence,
            "providerStatus": "provider",
        }

    def _call_anthropic(
        self, prompt: str, model: str, api_key: str
    ) -> Tuple[Optional[str], int, int, Optional[str]]:
        try:
            response = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": ANALYSIS_MAX_OUTPUT_TOKENS,
                    "temperature": 0,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=PROVIDER_CALL_TIMEOUT,
            )
            if not response.is_success:
                return None, 0, 0, f"http_{response.status_code}"
            data = response.json()
            text = " ".join(
                block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
            ).strip()
            usage = data.get("usage", {})
            return text or None, usage.get("input_tokens", 0), usage.get("output_tokens", 0), None
        except Exception as exc:
            return None, 0, 0, str(exc)

    def _call_openai(
        self, prompt: str, model: str, api_key: str
    ) -> Tuple[Optional[str], int, int, Optional[str]]:
        try:
            response = httpx.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
                json={
                    "model": model,
                    "reasoning": {"effort": "low"},
                    "max_output_tokens": ANALYSIS_MAX_OUTPUT_TOKENS,
                    "input": [{"role": "user", "content": prompt}],
                },
                timeout=PROVIDER_CALL_TIMEOUT,
            )
            if not response.is_success:
                return None, 0, 0, f"http_{response.status_code}"
            data = response.json()
            text: Optional[str] = None
            for item in data.get("output", []):
                for part in item.get("content", []):
                    if part.get("type") == "output_text" and part.get("text"):
                        text = str(part["text"]).strip()
                        break
            if not text:
                text = str(data.get("output_text", "")).strip() or None
            usage = data.get("usage", {})
            return text, usage.get("input_tokens", 0), usage.get("output_tokens", 0), None if text else "empty_response"
        except Exception as exc:
            return None, 0, 0, str(exc)

    def _call_gemini(
        self, prompt: str, model: str, api_key: str
    ) -> Tuple[Optional[str], int, int, Optional[str]]:
        try:
            response = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"content-type": "application/json", "x-goog-api-key": api_key},
                json={
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0, "maxOutputTokens": ANALYSIS_MAX_OUTPUT_TOKENS},
                },
                timeout=PROVIDER_CALL_TIMEOUT,
            )
            if not response.is_success:
                return None, 0, 0, f"http_{response.status_code}"
            data = response.json()
            candidates = data.get("candidates", [])
            text: Optional[str] = None
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text = " ".join(p.get("text", "") for p in parts).strip() or None
            metadata = data.get("usageMetadata", {})
            failure = None if text else "empty_response"
            return text, metadata.get("promptTokenCount", 0), metadata.get("candidatesTokenCount", 0), failure
        except Exception as exc:
            return None, 0, 0, str(exc)

    def _run_provider_analysis(
        self,
        document: Dict[str, Any],
        analysis_input: Dict[str, Any],
        provider: str,
        model: str,
        api_key: str,
        content_hash: str,
    ) -> Tuple[Optional[Dict[str, Any]], int, int, Optional[str]]:
        """Call the requested AI provider and return (analysis, input_tokens, output_tokens, failure_reason)."""
        prompt = self._build_provider_prompt(document, analysis_input)
        if provider == "anthropic":
            text, input_tok, output_tok, err = self._call_anthropic(prompt, model, api_key)
        elif provider == "openai":
            text, input_tok, output_tok, err = self._call_openai(prompt, model, api_key)
        elif provider == "gemini":
            text, input_tok, output_tok, err = self._call_gemini(prompt, model, api_key)
        else:
            return None, 0, 0, "unsupported_provider"

        if err or not text:
            return None, input_tok, output_tok, err or "empty_response"

        analysis = self._parse_provider_response(text, document, content_hash, provider, model)
        if analysis is None:
            return None, input_tok, output_tok, "invalid_json_response"
        return analysis, input_tok, output_tok, None

    def _should_reuse_existing_analysis(self, analysis: Any, content_hash: str) -> bool:
        if not isinstance(analysis, dict):
            return False
        return analysis.get("status") == "analyzed" and analysis.get("version") == ANALYSIS_VERSION and analysis.get("contentHash") == content_hash

    def _select_analysis_candidate_reason(self, document: Dict[str, Any], analysis_input: Dict[str, Any]) -> str:
        file_type = str(document.get("fileType") or "")
        if file_type in {"pdf", "document", "presentation"}:
            return "priority_file_type"
        content = str(analysis_input.get("text") or "").strip()
        summary = str(document.get("summary", "")).strip()
        if not summary or len(content) < 280:
            return "weak_local_extraction"
        sections = document.get("sections")
        if not isinstance(sections, list) or len(sections) == 0:
            return "missing_structure"
        return "all_documents"

    def _get_analysis_exclusion_reason(self, document: Dict[str, Any], analysis_input: Dict[str, Any]) -> Optional[str]:
        path = str(document.get("path", "")).lower()
        if any(path.endswith(ext) for ext in (".zip", ".exe", ".dmg", ".mp4", ".mov", ".png", ".jpg", ".jpeg")):
            return "unsupported_file_type"
        if analysis_input.get("source") == "metadata_only":
            return "unreadable_extract" if analysis_input.get("extractionStatus") == "unreadable" else "metadata_only_extract"
        if not str(analysis_input.get("text") or "").strip() and not str(document.get("summary", "")).strip():
            return "unreadable_content"
        if len(str(analysis_input.get("text") or "")) > 18000:
            return "file_too_large"
        return None

    def _update_job(self, job_id: str, patch: Dict[str, Any]) -> None:
        job = self._runtime_store.read_job_metadata(job_id)
        if job is None:
            return
        job.update(patch)
        self._runtime_store.write_job_metadata(job_id, job)

    def _raise_if_cancelled(self, job_id: str) -> None:
        current_job = self._runtime_store.read_job_metadata(job_id) or {}
        if current_job.get("status") == "cancelled" or current_job.get("cancelRequested") is True:
            raise JobCancelledError()

    def _append_event(self, job_id: str, event: str, data: Dict[str, Any]) -> None:
        self._runtime_store.append_job_event(
            job_id,
            {
                "ts": utc_now_iso(),
                "event": event,
                "data": data,
            },
        )
