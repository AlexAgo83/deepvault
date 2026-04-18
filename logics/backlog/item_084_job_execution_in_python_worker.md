## item_084_job_execution_in_python_worker - Job execution in Python worker (ingest, analyze, evaluate, export-live)

> From version: 1.3.0
> Schema version: 1.0
> Status: In Progress
> Understanding: 100%
> Confidence: 97%
> Progress: 92%
> Complexity: High
> Theme: Architecture / Infrastructure
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem

- Job execution (ingest, analyze, evaluate, export-live) is currently implemented as Node.js CLI scripts invoked outside the HTTP API.
- In the Python FastAPI model, jobs are triggered via `POST /api/jobs` and streamed via `GET /api/jobs/:id/events` (SSE). The browser subscribes to the event stream to display real-time job progress.
- The worker still needs an operator/dev CLI surface for job control, but it should call the same Python job services as the HTTP routes rather than reviving the old Node.js script split.
- All Node.js pipeline scripts must be rewritten in Python inside the `worker/` package.

# Scope

- In: implement `POST /api/jobs` (accept `{ type: "ingest" | "analyze" | "evaluate" | "export-live", options }`) in `worker/jobs.py`; run the job in a background task; expose `GET /api/jobs/:id` (job status and metadata) and `GET /api/jobs/:id/events` (SSE stream of job progress events); port the ingest pipeline (SharePoint Graph API calls, corpus construction) to `worker/deepvault.py`; port the analyze pipeline (AI enrichment per document) to `worker/jobs.py` or a dedicated `worker/analyze.py`; port evaluate and export-live equivalently; persist job state and manifests to `data/runtime/`; operator-only access enforced (item_085/086 gate); update the browser Sync panel to trigger jobs via `POST /api/jobs` and subscribe to SSE progress.
- In: expose worker-managed job control through the first-party CLI (`worker jobs run ingest|analyze|evaluate|export-live`, `worker jobs status <id>`) over the same service layer used by the HTTP routes.
- In: persist canonical job metadata to `data/runtime/jobs/<jobId>.json` and append job events to `data/runtime/jobs/<jobId>.events.jsonl`; use the canonical statuses `queued`, `running`, `succeeded`, `failed`, and `cancelled`; generate `jobId` as UUID v4.
- In: standardize the first-wave SSE/event and job-summary contract so both the browser and CLI consume the same persisted lifecycle; use ISO 8601 UTC timestamps and keep job metadata/event logs by default until an explicit cleanup policy is introduced.
- Out: Entra token gating (item_085); operator allowlist enforcement (item_086); Docker Compose packaging (item_088).

# Acceptance criteria

- AC1: `POST /api/jobs` with `{ type: "ingest" }` starts an ingest job and returns `{ jobId, status: "running" }`.
- AC2: `GET /api/jobs/:id/events` streams SSE progress events during the job (`{ event: "progress", data: { step, pct, message } }`); the browser Sync panel renders real-time progress from the SSE stream.
- AC3: `GET /api/jobs/:id` returns the job status, start time, end time, and result summary after completion.
- AC4: Job results (corpus, manifests, checkpoints) are persisted to `data/runtime/` and survive a worker restart.
- AC5: The `analyze` job enriches documents with AI summaries, keywords, and confidence scores as per `adr_029`; the enriched corpus is published to `data/runtime/corpus-published.json` after the job completes.
- AC6: The browser Sync panel can trigger ingest, analyze, evaluate, and export-live jobs and display progress — functionally equivalent to the current behavior with the Node.js scripts.
- AC7: `worker jobs run ...` and `worker jobs status <id>` operate on the same persisted job lifecycle as `POST /api/jobs` and `GET /api/jobs/:id`.
- AC8: Each job persists a canonical metadata file and append-only event log under `data/runtime/jobs/`, and the API/CLI both reflect the same canonical statuses (`queued`, `running`, `succeeded`, `failed`, `cancelled`).
- AC9: Job ids are UUID v4, timestamps are ISO 8601 UTC, and the same event/summary payloads are visible through both the API and CLI surfaces.

# Links

- Request: `logics/request/req_020_host_nexus_as_a_shared_multi_user_web_application.md`
- Product brief(s): `logics/product/prod_014_host_nexus_as_a_shared_multi_user_web_application.md`
- Architecture decision(s): `logics/architecture/adr_035_python_fastapi_as_the_worker_runtime.md`, `logics/architecture/adr_023_split_execution_runtime_from_the_app_and_share_corpus_artifacts.md`, `logics/architecture/adr_029_bound_post_ingest_analysis_contract_and_runtime_output.md`
- Depends on: `item_080_python_fastapi_worker_foundation`
- Task(s): `task_042_orchestrate_python_worker_foundation_and_runtime_migration`

# Validation evidence

- `curl -X POST http://localhost:8000/api/jobs -d '{"type":"ingest"}'` → `{ jobId, status: "running" }`
- `rtk python3 -m worker.cli.main jobs run ingest`
- `rtk python3 -m worker.cli.main jobs status <id>`
- Browser Sync panel → trigger ingest → progress updates visible in real time
- After ingest: `data/runtime/corpus-published.json` is updated
- `python -m pytest worker/tests/test_jobs.py -v`

## Progress notes

- Wave 5 has started with a first worker-native job slice: the FastAPI worker now exposes `POST /api/jobs`, `GET /api/jobs/{id}`, and `GET /api/jobs/{id}/events`, and persists canonical metadata plus append-only event logs under `data/runtime/jobs/`.
- The first-party CLI now calls the same `JobsService` as the HTTP routes through `worker jobs run ...` and `worker jobs status <id>`, with `run` executing synchronously so the process does not exit before the worker-owned lifecycle is persisted.
- The worker-native job implementations now cover `evaluate`, `ingest`, and `analyze`. `ingest` builds the sync overview from the selected corpus source and writes `data/runtime/sync-state.json` or `data/runtime/sync-state.live.json` directly from the Python worker.
- `analyze` now writes `data/runtime/analyzed-corpus.json` and `data/runtime/analyze-report.json` from the Python worker, with analysis reuse, bounded run budget, exclusion/stale states, and local heuristic fallback when a provider is requested but not yet wired on the worker.
- The browser Sync runtime now uses the worker-native jobs endpoints (`/api/jobs`, `/api/jobs/{id}/cancel`, `/api/jobs/{id}/events`) instead of the legacy `/api/worker/jobs` contract, with a compatibility adapter preserving the existing UI status and console model during the migration.
- The worker-native job implementations now cover `evaluate`, `ingest`, `analyze`, and a first useful `export-live` publication path. `export-live` now publishes `public/live-corpus.json`, persists `data/runtime/live-export-checkpoint.json`, and refreshes `data/runtime/sync-state.live.json` from a worker-selected local source (`DEEPVAULT_CORPUS_PATH`, `analyzed-corpus.json`, prior checkpoint, or mock baseline).
- The remaining scope is now the last legacy tail: replace the residual Node live-export/Graph path with a worker-native Graph export and then delete the unused legacy execution path before closing the item.
- Validation for this first slice:
  - `rtk python3 -m pytest worker/tests/test_jobs.py -v`
  - `rtk python3 -m pytest worker/tests/test_app_routes.py worker/tests/test_bishop.py worker/tests/test_jobs.py -v`
  - `rtk python3 -m worker.cli.main jobs run evaluate`
  - `rtk python3 -m worker.cli.main jobs run ingest`
  - `rtk python3 -m worker.cli.main jobs run export-live`
  - `rtk python3 -m worker.cli.main jobs status 10504cb9-a722-4ebb-99f7-ddace960e4b2`
  - `rtk npm run test -- tests/worker-client.spec.ts tests/use-sync-operations.spec.tsx tests/app.spec.tsx`
  - `rtk npm run typecheck`
  - `rtk npm run build`
