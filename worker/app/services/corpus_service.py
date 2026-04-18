from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

from worker.app.config import Settings


class CorpusService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def resolve_corpus_path(self) -> Path:
        if self._settings.worker_mode == "local":
            return self._settings.mock_corpus_path
        return self._settings.runtime_data_dir / "corpus-published.json"

    def load_corpus_bytes(self) -> bytes:
        corpus_path = self.resolve_corpus_path()
        return corpus_path.read_bytes()

    def load_corpus_payload(self) -> Dict[str, Any]:
        return json.loads(self.load_corpus_bytes().decode("utf-8"))

    def build_etag(self, payload_bytes: Optional[bytes] = None) -> str:
        source = payload_bytes if payload_bytes is not None else self.load_corpus_bytes()
        return hashlib.sha256(source).hexdigest()[:16]

    def validate_corpus_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        required_top_level = ("schemaVersion", "defaultUserRole", "providers", "sites", "syncRuns", "documents")
        missing = [field for field in required_top_level if field not in payload]
        valid = not missing and isinstance(payload.get("documents"), list)
        return {
            "valid": valid,
            "missingFields": missing,
            "documentCount": len(payload.get("documents", [])) if isinstance(payload.get("documents"), list) else 0,
            "siteCount": len(payload.get("sites", [])) if isinstance(payload.get("sites"), list) else 0,
            "schemaVersion": payload.get("schemaVersion"),
            "path": str(self.resolve_corpus_path()),
        }
