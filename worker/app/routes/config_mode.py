from __future__ import annotations

from fastapi import APIRouter, Depends

from worker.app.dependencies import get_system_service
from worker.app.models import ConfigModeResponse
from worker.app.services.system_service import SystemService


router = APIRouter(tags=["config"])


@router.get("/api/config/mode", response_model=ConfigModeResponse)
def get_config_mode(system_service: SystemService = Depends(get_system_service)) -> ConfigModeResponse:
    return system_service.config_mode()
