from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, Dict, List, Optional
from uuid import uuid4

from worker.app.config import Settings
from worker.app.errors import http_error
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.infra.time import utc_now_iso
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService


SUPPORTED_JOB_TYPES = {"evaluate"}
ALL_JOB_TYPES = {"ingest", "analyze", "evaluate", "export-live"}
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


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
    ) -> None:
        self._settings = settings
        self._runtime_store = runtime_store
        self._corpus_service = corpus_service
        self._bishop_service = bishop_service
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
        try:
            if job_type not in SUPPORTED_JOB_TYPES:
                raise NotImplementedError(f"Job type '{job_type}' is not implemented on the Python worker yet.")

            if job_type == "evaluate":
                result = self._run_evaluate_job(job_id)
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

    def _update_job(self, job_id: str, patch: Dict[str, Any]) -> None:
        job = self._runtime_store.read_job_metadata(job_id)
        if job is None:
            return
        job.update(patch)
        self._runtime_store.write_job_metadata(job_id, job)

    def _append_event(self, job_id: str, event: str, data: Dict[str, Any]) -> None:
        self._runtime_store.append_job_event(
            job_id,
            {
                "ts": utc_now_iso(),
                "event": event,
                "data": data,
            },
        )
