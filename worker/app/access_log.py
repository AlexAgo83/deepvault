from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Optional


class AccessLogger:
    def __init__(self, logs_dir: Path, retention_days: int = 30) -> None:
        self._logs_dir = logs_dir
        self._retention_days = retention_days
        self._lock = Lock()

    def log(self, *, oid: str, endpoint: str, status: int, ts: Optional[str] = None) -> None:
        timestamp = ts or datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        current_date = date.fromisoformat(timestamp[:10])
        payload = {
            "ts": timestamp,
            "oid": oid,
            "endpoint": endpoint,
            "status": status,
        }
        self._logs_dir.mkdir(parents=True, exist_ok=True)

        with self._lock:
            self._cleanup_old_logs(current_date)
            path = self._logs_dir / f"access-{current_date.isoformat()}.json"
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, separators=(",", ":")))
                handle.write("\n")

    def _cleanup_old_logs(self, current_date: date) -> None:
        cutoff = current_date - timedelta(days=self._retention_days)
        for path in self._logs_dir.glob("access-*.json"):
            stamp = _date_from_path(path)
            if stamp is None:
                continue
            if stamp < cutoff:
                path.unlink(missing_ok=True)


def _date_from_path(path: Path) -> Optional[date]:
    try:
        return date.fromisoformat(path.stem.replace("access-", "", 1))
    except ValueError:
        return None
