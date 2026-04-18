from __future__ import annotations

from worker.app.auth.operator_gate import is_operator
from worker.app.config import Settings, get_worker_version
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.infra.time import utc_now_iso
from worker.app.models import ConfigModeResponse, HealthResponse, WorkerFeatures


class SystemService:
    def __init__(self, settings: Settings, runtime_store: RuntimeStore) -> None:
        self._settings = settings
        self._runtime_store = runtime_store

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok",
            workerVersion=get_worker_version(),
            mode=self._settings.worker_mode,
            timestamp=utc_now_iso(),
        )

    def config_mode(self) -> ConfigModeResponse:
        return ConfigModeResponse(
            mode=self._settings.worker_mode,
            workerVersion=get_worker_version(),
            corpusVersion=self._runtime_store.corpus_version(),
            isOperator=is_operator(),
            features=WorkerFeatures(authEnabled=self._settings.worker_auth_enabled),
            timestamp=utc_now_iso(),
        )
