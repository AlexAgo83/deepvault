from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from worker.app.auth.token_validation import AuthContext
from worker.app.dependencies import get_auth_context, get_system_service
from worker.app.models import ConfigModeResponse
from worker.app.services.system_service import SystemService


router = APIRouter(tags=["config"])


@router.get("/api/config/mode", response_model=ConfigModeResponse)
def get_config_mode(
    system_service: SystemService = Depends(get_system_service),
    auth_context: Optional[AuthContext] = Depends(get_auth_context),
) -> ConfigModeResponse:
    _ = auth_context
    return system_service.config_mode()
