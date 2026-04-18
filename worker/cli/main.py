from __future__ import annotations

import argparse
import json

from worker.app.config import get_settings
from worker.app.infra.runtime_store import get_runtime_store
from worker.app.services.bishop_service import BishopService
from worker.app.services.corpus_service import CorpusService
from worker.app.services.live_export_service import LiveExportService
from worker.app.infra.runtime_store import RuntimeStore
from worker.cli.commands import jobs
from worker.app.services.system_service import SystemService
from worker.cli.commands import bishop, config_mode, corpus, health
from worker.app.services.jobs_service import JobsService


def build_system_service() -> SystemService:
    return SystemService(settings=get_settings(), runtime_store=get_runtime_store())


def build_corpus_service() -> CorpusService:
    return CorpusService(settings=get_settings())


def build_bishop_service() -> BishopService:
    settings = get_settings()
    return BishopService(settings=settings, corpus_service=CorpusService(settings=settings))


def build_jobs_service() -> JobsService:
    settings = get_settings()
    runtime_store = RuntimeStore(settings.runtime_data_dir)
    corpus_service = CorpusService(settings=settings)
    bishop_service = BishopService(settings=settings, corpus_service=corpus_service)
    live_export_service = LiveExportService(settings=settings, runtime_store=runtime_store, corpus_service=corpus_service)
    return JobsService(
        settings=settings,
        runtime_store=runtime_store,
        corpus_service=corpus_service,
        bishop_service=bishop_service,
        live_export_service=live_export_service,
    )


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
    jobs_parser = subparsers.add_parser("jobs")
    jobs_subparsers = jobs_parser.add_subparsers(dest="jobs_command", required=True)
    jobs_run_parser = jobs_subparsers.add_parser("run")
    jobs_run_parser.add_argument("job_type", choices=["ingest", "analyze", "evaluate", "export-live"])
    jobs_run_parser.add_argument("--resume", action="store_true")
    jobs_status_parser = jobs_subparsers.add_parser("status")
    jobs_status_parser.add_argument("job_id")
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
    jobs_service = build_jobs_service()

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
    elif args.command == "jobs":
        if args.jobs_command == "run":
            payload = jobs.run(jobs_service, job_type=args.job_type, resume=getattr(args, "resume", False))
        elif args.jobs_command == "status":
            payload = jobs.status(jobs_service, job_id=args.job_id)
        else:
            parser.error(f"Unsupported jobs command: {args.jobs_command}")
            return 2
    else:
        parser.error(f"Unsupported command: {args.command}")
        return 2

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
