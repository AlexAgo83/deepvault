from __future__ import annotations

from typing import Optional

from fastapi import Depends, Request

from worker.app.auth.token_validation import AuthContext, TokenValidator
from worker.app.config import Settings, get_settings
from worker.app.errors import http_error
from worker.app.infra.runtime_store import RuntimeStore, get_runtime_store
from worker.app.auth.operator_gate import is_operator
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.jobs_service import JobsService
from worker.app.services.live_export_service import LiveExportService
from worker.app.services.system_service import SystemService


def get_auth_validator(request: Request) -> TokenValidator:
    return request.app.state.auth_validator


def get_auth_context(request: Request) -> Optional[AuthContext]:
    return getattr(request.state, "auth_context", None)


def require_operator(
    settings: Settings = Depends(get_settings),
    auth_context: Optional[AuthContext] = Depends(get_auth_context),
) -> None:
    if not settings.worker_auth_enabled:
        return
    if is_operator(auth_context, settings.operator_allowlist):
        return
    raise http_error(code="forbidden", message="Operator access required.", status_code=403)


def get_system_service(
    settings: Settings = Depends(get_settings),
    runtime_store: RuntimeStore = Depends(get_runtime_store),
    auth_context: Optional[AuthContext] = Depends(get_auth_context),
) -> SystemService:
    return SystemService(settings=settings, runtime_store=runtime_store, auth_context=auth_context)


def get_corpus_service(settings: Settings = Depends(get_settings)) -> CorpusService:
    return CorpusService(settings=settings)


def get_bishop_service(
    settings: Settings = Depends(get_settings),
    corpus_service: CorpusService = Depends(get_corpus_service),
) -> BishopService:
    return BishopService(settings=settings, corpus_service=corpus_service)


def get_jobs_service(
    settings: Settings = Depends(get_settings),
    runtime_store: RuntimeStore = Depends(get_runtime_store),
    corpus_service: CorpusService = Depends(get_corpus_service),
    bishop_service: BishopService = Depends(get_bishop_service),
) -> JobsService:
    return JobsService(
        settings=settings,
        runtime_store=runtime_store,
        corpus_service=corpus_service,
        bishop_service=bishop_service,
        live_export_service=LiveExportService(
            settings=settings,
            runtime_store=runtime_store,
            corpus_service=corpus_service,
        ),
    )
