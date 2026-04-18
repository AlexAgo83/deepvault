from __future__ import annotations

from pathlib import Path
from typing import Optional

from worker.app.config import get_settings


class RuntimeStore:
    def __init__(self, runtime_dir: Path) -> None:
        self.runtime_dir = runtime_dir

    def corpus_version(self) -> Optional[str]:
        corpus_path = self.runtime_dir / "corpus-published.json"
        if not corpus_path.exists():
            return None
        return f"file:{corpus_path.stat().st_mtime_ns}"


def get_runtime_store() -> RuntimeStore:
    settings = get_settings()
    return RuntimeStore(settings.runtime_data_dir)
