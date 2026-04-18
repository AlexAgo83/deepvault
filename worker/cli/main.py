from __future__ import annotations

import argparse
import json

from worker.app.config import get_settings
from worker.app.infra.runtime_store import get_runtime_store
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.system_service import SystemService
from worker.cli.commands import bishop, config_mode, corpus, health


def build_system_service() -> SystemService:
    return SystemService(settings=get_settings(), runtime_store=get_runtime_store())


def build_corpus_service() -> CorpusService:
    return CorpusService(settings=get_settings())


def build_bishop_service() -> BishopService:
    settings = get_settings()
    return BishopService(settings=settings, corpus_service=CorpusService(settings=settings))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("health")
    subparsers.add_parser("config-mode")
    bishop_parser = subparsers.add_parser("bishop")
    bishop_subparsers = bishop_parser.add_subparsers(dest="bishop_command", required=True)
    bishop_query_parser = bishop_subparsers.add_parser("query")
    bishop_query_parser.add_argument("--question", required=True)
    bishop_query_parser.add_argument("--role", default="analyst")
    bishop_query_parser.add_argument("--provider")
    corpus_parser = subparsers.add_parser("corpus")
    corpus_subparsers = corpus_parser.add_subparsers(dest="corpus_command", required=True)
    corpus_subparsers.add_parser("show")
    corpus_subparsers.add_parser("validate")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    system_service = build_system_service()
    corpus_service = build_corpus_service()
    bishop_service = build_bishop_service()

    if args.command == "health":
        payload = health.run(system_service)
    elif args.command == "config-mode":
        payload = config_mode.run(system_service)
    elif args.command == "corpus":
        if args.corpus_command == "show":
            payload = corpus.show(corpus_service)
        elif args.corpus_command == "validate":
            payload = corpus.validate(corpus_service)
        else:
            parser.error(f"Unsupported corpus command: {args.corpus_command}")
            return 2
    elif args.command == "bishop":
        if args.bishop_command == "query":
            payload = bishop.query(
                bishop_service,
                question=args.question,
                role=args.role,
                provider=args.provider,
            )
        else:
            parser.error(f"Unsupported bishop command: {args.bishop_command}")
            return 2
    else:
        parser.error(f"Unsupported command: {args.command}")
        return 2

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
