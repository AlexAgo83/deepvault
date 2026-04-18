from __future__ import annotations

from fastapi import APIRouter, Depends

from worker.app.dependencies import get_system_service
from worker.app.models import HealthResponse
from worker.app.services.system_service import SystemService


router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
def get_health(system_service: SystemService = Depends(get_system_service)) -> HealthResponse:
    return system_service.health()
