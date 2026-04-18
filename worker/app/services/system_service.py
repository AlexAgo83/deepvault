from __future__ import annotations

from typing import Optional

from worker.app.auth.token_validation import AuthContext
from worker.app.auth.operator_gate import is_operator
from worker.app.config import Settings, get_worker_version
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.infra.time import utc_now_iso
from worker.app.models import ConfigModeResponse, HealthResponse, WorkerAuthConfigResponse, WorkerFeatures


class SystemService:
    def __init__(self, settings: Settings, runtime_store: RuntimeStore, auth_context: Optional[AuthContext] = None) -> None:
        self._settings = settings
        self._runtime_store = runtime_store
        self._auth_context = auth_context

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
            isOperator=is_operator(self._auth_context, self._settings.operator_allowlist),
            features=WorkerFeatures(authEnabled=self._settings.worker_auth_enabled),
            auth=WorkerAuthConfigResponse(
                enabled=self._settings.worker_auth_enabled,
                tenantId=self._settings.entra_tenant_id.strip() or None,
                clientId=self._settings.entra_client_id.strip() or None,
                scope=self._settings.entra_scope or None,
            ),
            timestamp=utc_now_iso(),
        )
