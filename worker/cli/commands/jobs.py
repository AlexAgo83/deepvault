from __future__ import annotations

from typing import Any, Dict

from worker.app.services.jobs_service import JobsService


def run(
    jobs_service: JobsService,
    *,
    job_type: str,
) -> Dict[str, Any]:
    return jobs_service.run_job(job_type=job_type, options={}, launched_by="worker-cli", client="worker-cli")


def status(
    jobs_service: JobsService,
    *,
    job_id: str,
) -> Dict[str, Any]:
    return jobs_service.get_job(job_id)
