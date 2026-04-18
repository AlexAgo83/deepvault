from __future__ import annotations

from pathlib import Path

from worker.app.auth.token_validation import AuthContext
from worker.app.config import Settings
from worker.app.infra.runtime_store import RuntimeStore
from worker.app.services.system_service import SystemService


def test_health_uses_worker_version_and_mode(tmp_path: Path) -> None:
    service = SystemService(
        settings=Settings(),
        runtime_store=RuntimeStore(tmp_path),
    )

    payload = service.health()

    assert payload.status == "ok"
    assert payload.mode == "local"
    assert payload.workerVersion
    assert payload.timestamp.endswith("Z")


def test_config_mode_reports_runtime_flags(tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir()
    (runtime_dir / "corpus-published.json").write_text("{}", encoding="utf-8")

    service = SystemService(
        settings=Settings(WORKER_MODE="hosted", WORKER_AUTH_ENABLED=True, WORKER_RUNTIME_DATA_DIR=runtime_dir),
        runtime_store=RuntimeStore(runtime_dir),
    )

    payload = service.config_mode()

    assert payload.mode == "hosted"
    assert payload.features.authEnabled is True
    assert payload.auth.enabled is True
    assert payload.auth.tenantId is None
    assert payload.auth.clientId is None
    assert payload.corpusVersion is not None
    assert payload.isOperator is False


def test_config_mode_marks_authenticated_operator_from_allowlist(tmp_path: Path) -> None:
    runtime_dir = tmp_path / "runtime"
    runtime_dir.mkdir()

    service = SystemService(
        settings=Settings(
            WORKER_MODE="hosted",
            WORKER_AUTH_ENABLED=True,
            OPERATOR_ALLOWLIST="operator-object-id",
            WORKER_RUNTIME_DATA_DIR=runtime_dir,
        ),
        runtime_store=RuntimeStore(runtime_dir),
        auth_context=AuthContext(oid="operator-object-id", tid="tenant-id", claims={}),
    )

    payload = service.config_mode()

    assert payload.isOperator is True
