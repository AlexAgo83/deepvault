from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def wait_for_http(url: str, timeout_seconds: float) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}")


def fetch_json(url: str) -> dict[str, object]:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    host = os.environ.get("WORKER_SMOKE_HOST", "127.0.0.1")
    port = int(os.environ.get("WORKER_SMOKE_PORT", "8000"))
    timeout_seconds = float(os.environ.get("WORKER_SMOKE_TIMEOUT_SECONDS", "20"))

    runtime_dir = Path(tempfile.mkdtemp(prefix="deepvault-worker-smoke-"))
    env = os.environ.copy()
    env.setdefault("WORKER_MODE", "local")
    env.setdefault("WORKER_AUTH_ENABLED", "false")
    env["WORKER_RUNTIME_DATA_DIR"] = str(runtime_dir)

    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "worker.main:app",
            "--host",
            host,
            "--port",
            str(port),
        ],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http(f"http://{host}:{port}/api/health", timeout_seconds)
        health_payload = fetch_json(f"http://{host}:{port}/api/health")
        config_payload = fetch_json(f"http://{host}:{port}/api/config/mode")

        assert health_payload["status"] == "ok"
        assert health_payload["mode"] == "local"
        assert config_payload["mode"] == "local"
        assert config_payload["features"] == {"authEnabled": False}

        print("Worker contract smoke passed.")
        print(json.dumps({"health": health_payload, "configMode": config_payload}, indent=2))
        return 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

        if process.returncode not in (0, -15):
            stdout = process.stdout.read() if process.stdout else ""
            stderr = process.stderr.read() if process.stderr else ""
            if stdout.strip():
                print(stdout, file=sys.stderr)
            if stderr.strip():
                print(stderr, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
