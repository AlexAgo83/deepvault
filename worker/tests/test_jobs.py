from __future__ import annotations

import time

from fastapi.testclient import TestClient

from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.jobs_service import JobsService
from worker.main import app


def build_jobs_service(tmp_path) -> JobsService:
    settings = Settings(
        WORKER_MODE="local",
        WORKER_RUNTIME_DATA_DIR=tmp_path,
    )
    runtime_store = RuntimeStore(settings.runtime_data_dir)
    corpus_service = CorpusService(settings=settings)
    bishop_service = BishopService(settings=settings, corpus_service=corpus_service)
    return JobsService(
        settings=settings,
        runtime_store=runtime_store,
        corpus_service=corpus_service,
        bishop_service=bishop_service,
    )


def wait_for_terminal_status(service: JobsService, job_id: str, timeout: float = 5.0) -> dict:
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


def test_jobs_service_marks_unimplemented_job_types_failed(tmp_path) -> None:
    service = build_jobs_service(tmp_path)

    started = service.start_job(job_type="ingest", options={})
    completed = wait_for_terminal_status(service, started["jobId"])

    assert completed["status"] == "failed"
    assert "not implemented" in completed["error"].lower()


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
