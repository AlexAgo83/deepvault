from __future__ import annotations

import json

from worker.app.access_log import AccessLogger


def test_access_logger_writes_one_json_line_per_request(tmp_path) -> None:
    logger = AccessLogger(tmp_path)

    logger.log(
        oid="user-object-id",
        endpoint="/api/corpus",
        status=200,
        ts="2026-04-18T20:15:00Z",
    )

    log_path = tmp_path / "access-2026-04-18.json"
    assert log_path.exists()

    lines = log_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0]) == {
        "ts": "2026-04-18T20:15:00Z",
        "oid": "user-object-id",
        "endpoint": "/api/corpus",
        "status": 200,
    }


def test_access_logger_removes_logs_older_than_retention(tmp_path) -> None:
    logger = AccessLogger(tmp_path, retention_days=30)
    old_log = tmp_path / "access-2026-03-18.json"
    recent_log = tmp_path / "access-2026-03-19.json"
    old_log.write_text("{}", encoding="utf-8")
    recent_log.write_text("{}", encoding="utf-8")

    logger.log(
        oid="user-object-id",
        endpoint="/api/corpus",
        status=200,
        ts="2026-04-18T20:15:00Z",
    )

    assert not old_log.exists()
    assert recent_log.exists()
