from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header
from sse_starlette.sse import EventSourceResponse

from worker.app.dependencies import get_jobs_service, require_operator
from worker.app.models import JobStartRequest, JobStartResponse, JobSummaryResponse
from worker.app.services.jobs_service import JobsService


router = APIRouter(tags=["jobs"])


@router.post("/api/jobs", response_model=JobStartResponse)
def post_job(
    payload: JobStartRequest,
    _: None = Depends(require_operator),
    jobs_service: JobsService = Depends(get_jobs_service),
    launched_by: Optional[str] = Header(default=None, alias="X-DeepVault-Launched-By"),
    client: Optional[str] = Header(default=None, alias="X-DeepVault-Client"),
    effective_config: Optional[str] = Header(default=None, alias="X-DeepVault-Effective-Config"),
) -> JobStartResponse:
    result = jobs_service.start_job(
        job_type=payload.type,
        options=payload.options,
        launched_by=launched_by,
        client=client,
        effective_config={"raw": effective_config} if effective_config else None,
    )
    return JobStartResponse(**result)


@router.get("/api/jobs/{job_id}", response_model=JobSummaryResponse)
def get_job(job_id: str, jobs_service: JobsService = Depends(get_jobs_service)) -> JobSummaryResponse:
    return JobSummaryResponse(**jobs_service.get_job(job_id))


@router.post("/api/jobs/{job_id}/cancel", response_model=JobSummaryResponse)
def cancel_job(
    job_id: str,
    _: None = Depends(require_operator),
    jobs_service: JobsService = Depends(get_jobs_service),
) -> JobSummaryResponse:
    return JobSummaryResponse(**jobs_service.cancel_job(job_id))


@router.get("/api/jobs/{job_id}/events")
async def get_job_events(job_id: str, jobs_service: JobsService = Depends(get_jobs_service)) -> EventSourceResponse:
    return EventSourceResponse(jobs_service.stream_job_events(job_id))
