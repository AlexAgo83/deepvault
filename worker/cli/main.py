from __future__ import annotations

import argparse
import json

from worker.app.config import get_settings
from worker.app.infra.runtime_store import get_runtime_store
from worker.app.services.system_service import SystemService
from worker.cli.commands import config_mode, health


def build_system_service() -> SystemService:
    return SystemService(settings=get_settings(), runtime_store=get_runtime_store())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("health")
    subparsers.add_parser("config-mode")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    system_service = build_system_service()

    if args.command == "health":
        payload = health.run(system_service)
    elif args.command == "config-mode":
        payload = config_mode.run(system_service)
    else:
        parser.error(f"Unsupported command: {args.command}")
        return 2

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
