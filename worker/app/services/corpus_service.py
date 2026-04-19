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
            live_path = self._settings.runtime_data_dir.parent.parent / "public" / "live-corpus.json"
            if live_path.exists():
                return live_path
            return self._settings.mock_corpus_path
        return self._settings.runtime_data_dir / "corpus-published.json"

    def resolve_job_corpus_path(
        self,
        *,
        mode: Optional[str] = None,
        input_path: Optional[str] = None,
    ) -> Path:
        if input_path:
            return Path(input_path).expanduser().resolve()
        if mode == "live":
            return (self._settings.runtime_data_dir.parent.parent / "public" / "live-corpus.json").resolve()
        return self._settings.mock_corpus_path

    def load_corpus_bytes(self) -> bytes:
        corpus_path = self.resolve_corpus_path()
        return corpus_path.read_bytes()

    def load_corpus_payload(self) -> Dict[str, Any]:
        return json.loads(self.load_corpus_bytes().decode("utf-8"))

    def load_job_corpus_payload(
        self,
        *,
        mode: Optional[str] = None,
        input_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        corpus_path = self.resolve_job_corpus_path(mode=mode, input_path=input_path)
        if not corpus_path.exists():
            if mode == "live":
                raise FileNotFoundError(
                    f"Live corpus not found at {corpus_path}. Provide DEEPVAULT_CORPUS_PATH or run export-live first."
                )
            raise FileNotFoundError(f"Corpus not found at {corpus_path}.")
        return json.loads(corpus_path.read_text(encoding="utf-8"))

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
