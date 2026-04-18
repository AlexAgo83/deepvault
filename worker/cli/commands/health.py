from __future__ import annotations

from worker.app.services.system_service import SystemService


def run(system_service: SystemService) -> dict[str, object]:
    return system_service.health().model_dump()
