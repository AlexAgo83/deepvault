from __future__ import annotations

from fastapi import Depends

from worker.app.config import Settings, get_settings
from worker.app.infra.runtime_store import RuntimeStore, get_runtime_store
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.jobs_service import JobsService
from worker.app.services.system_service import SystemService


def get_system_service(
    settings: Settings = Depends(get_settings),
    runtime_store: RuntimeStore = Depends(get_runtime_store),
) -> SystemService:
    return SystemService(settings=settings, runtime_store=runtime_store)


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
    )
