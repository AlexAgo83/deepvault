from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.jobs_service import JobsService
from worker.app.services.live_export_service import LiveExportService
from worker.main import app


def build_jobs_service(tmp_path) -> JobsService:
    settings = Settings(
        WORKER_MODE="local",
        WORKER_RUNTIME_DATA_DIR=tmp_path,
    )
    runtime_store = RuntimeStore(settings.runtime_data_dir)
    corpus_service = CorpusService(settings=settings)
    bishop_service = BishopService(settings=settings, corpus_service=corpus_service)
    live_export_service = LiveExportService(settings=settings, runtime_store=runtime_store, corpus_service=corpus_service)
    return JobsService(
        settings=settings,
        runtime_store=runtime_store,
        corpus_service=corpus_service,
        bishop_service=bishop_service,
        live_export_service=live_export_service,
    )


def wait_for_terminal_status(service: JobsService, job_id: str, timeout: float = 10.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        payload = service.get_job(job_id)
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish in time")


def test_jobs_service_runs_evaluate_and_persists_files(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="evaluate", options={}, launched_by="test", client="pytest")

    assert started["status"] == "running"
    assert started["jobId"]

    completed = wait_for_terminal_status(service, started["jobId"])
    assert completed["status"] == "succeeded"
    assert completed["result"]["passCount"] >= 1
    assert (tmp_path / "jobs" / f"{started['jobId']}.json").exists()
    assert (tmp_path / "jobs" / f"{started['jobId']}.events.jsonl").exists()


def test_jobs_service_runs_ingest_and_writes_sync_state(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="ingest", options={"env": {"DEEPVAULT_DATA_MODE": "mock"}})
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["mode"] == "mock"
    assert (tmp_path / "sync-state.json").exists()


def test_jobs_service_runs_ingest_in_live_mode_when_corpus_path_is_provided(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    live_corpus_path = tmp_path / "live-corpus.json"
    live_corpus_path.write_text(service._corpus_service.load_corpus_bytes().decode("utf-8"), encoding="utf-8")

    started = service.start_job(
        job_type="ingest",
        options={"env": {"DEEPVAULT_DATA_MODE": "live", "DEEPVAULT_CORPUS_PATH": str(live_corpus_path)}},
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["mode"] == "live"
    assert (tmp_path / "sync-state.live.json").exists()


def test_jobs_service_runs_analyze_and_writes_analysis_artifacts(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(
        job_type="analyze",
        options={"env": {"DEEPVAULT_DATA_MODE": "mock", "DEEPVAULT_ANALYZE_LIMIT": "5"}},
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["analyzed"] == 5
    assert (tmp_path / "analyzed-corpus.json").exists()
    assert (tmp_path / "analyze-report.json").exists()


def test_jobs_service_analyze_uses_extract_backed_text(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    corpus = json.loads(service._corpus_service.load_corpus_bytes().decode("utf-8"))
    extract_path = "extracts/site-test/doc-extract.json"
    (tmp_path / extract_path).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / extract_path).write_text(
        json.dumps({"text": "Real extracted body text. It contains actual policy obligations and review owners."}),
        encoding="utf-8",
    )
    corpus["documents"] = [
        {
            **corpus["documents"][0],
            "id": "extract-backed-doc",
            "path": "/Policies/policy.docx",
            "fileType": "document",
            "content": "Source: policy.docx. Path: /Policies/policy.docx.",
            "extractionStatus": "full_text",
            "extractPath": extract_path,
        }
    ]
    live_corpus_path = tmp_path / "live-corpus.json"
    live_corpus_path.write_text(json.dumps(corpus), encoding="utf-8")

    started = service.start_job(
        job_type="analyze",
        options={
            "env": {
                "DEEPVAULT_DATA_MODE": "live",
                "DEEPVAULT_CORPUS_PATH": str(live_corpus_path),
                "DEEPVAULT_ANALYZE_LIMIT": "1",
            }
        },
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    analyzed_corpus = json.loads((tmp_path / "analyzed-corpus.json").read_text(encoding="utf-8"))
    section = analyzed_corpus["documents"][0]["analysis"]["sections"][0]["content"]
    assert "Real extracted body text" in section
    assert not section.startswith("Source:")
    report = json.loads((tmp_path / "analyze-report.json").read_text(encoding="utf-8"))
    assert report["extractionQuality"]["full_text"] == 1


def test_jobs_service_analyze_excludes_metadata_only_placeholder(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    corpus = json.loads(service._corpus_service.load_corpus_bytes().decode("utf-8"))
    corpus["documents"] = [
        {
            **corpus["documents"][0],
            "id": "metadata-only-doc",
            "path": "/Decks/deck.pptx",
            "fileType": "presentation",
            "content": "Source: deck.pptx. Path: /Decks/deck.pptx.",
            "extractionStatus": "metadata_only",
            "extractionReason": "unsupported_file_type",
            "extractPath": "extracts/site-test/metadata-only-doc.json",
        }
    ]
    live_corpus_path = tmp_path / "live-corpus.json"
    live_corpus_path.write_text(json.dumps(corpus), encoding="utf-8")

    started = service.start_job(
        job_type="analyze",
        options={
            "env": {
                "DEEPVAULT_DATA_MODE": "live",
                "DEEPVAULT_CORPUS_PATH": str(live_corpus_path),
                "DEEPVAULT_ANALYZE_LIMIT": "1",
            }
        },
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    analyzed_corpus = json.loads((tmp_path / "analyzed-corpus.json").read_text(encoding="utf-8"))
    assert analyzed_corpus["documents"][0]["analysis"]["status"] == "excluded"
    assert analyzed_corpus["documents"][0]["analysis"]["excludedReason"] == "metadata_only_extract"
    report = json.loads((tmp_path / "analyze-report.json").read_text(encoding="utf-8"))
    assert report["extractionQuality"]["metadata_only"] == 1


def test_jobs_service_analyze_falls_back_to_local_when_provider_requested(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    service._settings.openai_api_key = ""

    started = service.start_job(
        job_type="analyze",
        options={"env": {"DEEPVAULT_DATA_MODE": "mock", "DEEPVAULT_ANALYZE_PROVIDER": "openai", "DEEPVAULT_ANALYZE_LIMIT": "1"}},
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["provider"] == "openai"
    analyzed_corpus = (tmp_path / "analyzed-corpus.json").read_text(encoding="utf-8")
    assert '"providerStatus": "fallback"' in analyzed_corpus


def test_jobs_service_analyze_uses_provider_when_key_is_configured(tmp_path, monkeypatch) -> None:
    service = build_jobs_service(tmp_path)

    class FakeResponse:
        status_code = 200
        is_success = True

        def json(self) -> dict:
            return {
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "summary": "Provider summary.",
                                        "keywords": ["budget", "q3"],
                                        "sections": [{"heading": "Overview", "content": "Provider-generated overview."}],
                                        "documentType": "report",
                                        "confidence": 87,
                                    }
                                ),
                            }
                        ]
                    }
                ],
                "usage": {
                    "input_tokens": 120,
                    "output_tokens": 45,
                },
            }

    monkeypatch.setattr("worker.app.services.jobs_service.httpx.post", lambda *args, **kwargs: FakeResponse())

    started = service.start_job(
        job_type="analyze",
        options={
            "env": {
                "DEEPVAULT_DATA_MODE": "mock",
                "DEEPVAULT_ANALYZE_PROVIDER": "openai",
                "OPENAI_API_KEY": "test-openai-key",
                "DEEPVAULT_ANALYZE_LIMIT": "1",
            }
        },
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["provider"] == "openai"
    assert completed["result"]["actualInputTokens"] == 120
    assert completed["result"]["actualOutputTokens"] == 45
    assert completed["result"]["tokenCountMode"] == "actual"
    assert completed["result"]["providerSuccesses"] == 1
    assert completed["result"]["providerFallbacks"] == 0

    analyzed_corpus = json.loads((tmp_path / "analyzed-corpus.json").read_text(encoding="utf-8"))
    first_analysis = analyzed_corpus["documents"][0]["analysis"]
    assert first_analysis["provider"] == "openai"
    assert first_analysis["providerStatus"] == "provider"
    assert first_analysis["summary"] == "Provider summary."

    report = json.loads((tmp_path / "analyze-report.json").read_text(encoding="utf-8"))
    assert report["actualInputTokens"] == 120
    assert report["actualOutputTokens"] == 45
    assert report["tokenCountMode"] == "actual"
    assert report["providerSuccesses"] == 1
    assert report["providerFallbacks"] == 0

    events = service._runtime_store.read_job_events(started["jobId"])
    lines = [event["data"]["message"] for event in events if event.get("event") == "progress" and isinstance(event.get("data"), dict)]
    assert "Provider: openai" in lines
    assert "Model: gpt-5.4-mini" in lines
    assert "Actual input tokens: 120" in lines
    assert "Actual output tokens: 45" in lines


def test_jobs_service_runs_export_live_and_writes_live_artifacts(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="export-live", options={})
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["sourceKind"] == "mock-baseline"
    assert (tmp_path.parent.parent / "public" / "live-corpus.json").exists()
    assert (tmp_path / "live-export-checkpoint.json").exists()
    assert (tmp_path / "sync-state.live.json").exists()


def test_jobs_service_export_live_accepts_explicit_input_override(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    explicit_corpus_path = tmp_path / "explicit-live-corpus.json"
    explicit_corpus = service._corpus_service.load_corpus_payload()
    explicit_corpus["documents"][0]["analysis"] = {
        "status": "analyzed",
        "summary": "Worker-generated analysis.",
    }
    explicit_corpus_path.write_text(json.dumps(explicit_corpus), encoding="utf-8")

    started = service.start_job(
        job_type="export-live",
        options={"env": {"DEEPVAULT_DATA_MODE": "live", "DEEPVAULT_CORPUS_PATH": str(explicit_corpus_path)}},
    )
    completed = wait_for_terminal_status(service, started["jobId"])

    published_corpus = (tmp_path.parent.parent / "public" / "live-corpus.json").read_text(encoding="utf-8")
    checkpoint = (tmp_path / "live-export-checkpoint.json").read_text(encoding="utf-8")

    assert completed["status"] == "succeeded"
    assert completed["result"]["sourceKind"] == "explicit-input"
    assert '"status": "analyzed"' in published_corpus
    assert '"syncedAt":' in checkpoint


def test_jobs_service_runs_publish_analysis_after_analyze(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    analyze = service.start_job(
        job_type="analyze",
        options={"env": {"DEEPVAULT_DATA_MODE": "mock", "DEEPVAULT_ANALYZE_LIMIT": "3"}},
    )
    wait_for_terminal_status(service, analyze["jobId"])
    assert (tmp_path / "analyzed-corpus.json").exists()

    publish = service.start_job(job_type="publish-analysis", options={"env": {"DEEPVAULT_DATA_MODE": "mock"}})
    completed = wait_for_terminal_status(service, publish["jobId"])

    assert completed["status"] == "succeeded"
    assert completed["result"]["analyzedCount"] >= 1
    published_path = tmp_path.parent.parent / "public" / "live-corpus.json"
    assert published_path.exists()
    published = json.loads(published_path.read_text(encoding="utf-8"))
    analyzed_docs = [doc for doc in published["documents"] if isinstance(doc.get("analysis"), dict) and doc["analysis"].get("status") == "analyzed"]
    assert len(analyzed_docs) >= 1


def test_jobs_service_publish_analysis_fails_without_analyzed_corpus(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="publish-analysis", options={})
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "failed"
    assert "Analyzed corpus not found" in completed["error"]


def test_jobs_service_run_job_blocks_until_terminal_status(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    completed = service.run_job(job_type="evaluate", options={}, launched_by="worker-cli", client="worker-cli")

    assert completed["status"] == "succeeded"
    assert completed["launchedBy"] == "worker-cli"
    assert completed["client"] == "worker-cli"
    assert (tmp_path / "jobs" / f"{completed['jobId']}.json").exists()


def test_jobs_service_can_cancel_running_job(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="evaluate", options={}, launched_by="test", client="pytest")
    cancelled = service.cancel_job(started["jobId"])

    assert cancelled["status"] == "cancelled"
    assert cancelled["summary"] == "evaluate cancelled."

    completed = wait_for_terminal_status(service, started["jobId"])
    assert completed["status"] == "cancelled"


def test_jobs_route_starts_and_reads_evaluate_jobs(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    from worker.app.dependencies import get_jobs_service

    app.dependency_overrides[get_jobs_service] = lambda: service
    client = TestClient(app)

    response = client.post("/api/jobs", json={"type": "evaluate", "options": {}})
    assert response.status_code == 200
    job_id = response.json()["jobId"]

    completed = wait_for_terminal_status(service, job_id)
    response = client.get(f"/api/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == completed["status"]

    app.dependency_overrides.clear()


def test_jobs_route_cancels_running_job(tmp_path) -> None:
    service = build_jobs_service(tmp_path)
    from worker.app.dependencies import get_jobs_service

    app.dependency_overrides[get_jobs_service] = lambda: service
    client = TestClient(app)

    response = client.post("/api/jobs", json={"type": "evaluate", "options": {}})
    assert response.status_code == 200
    job_id = response.json()["jobId"]

    cancel_response = client.post(f"/api/jobs/{job_id}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    app.dependency_overrides.clear()
