## task_027_establish_worker_boundary_and_cli_parity_with_shared_corpus_artifacts - Establish worker boundary and CLI parity with shared corpus artifacts
> From version: 1.1.0
> Schema version: 1.0
> Status: Done
> Understanding: 97%
> Confidence: 95%
> Progress: 100%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# Context
- Derived from backlog item `item_059_establish_worker_boundary_and_cli_parity_with_shared_corpus_artifacts`.
- Source file: `logics/backlog/item_059_establish_worker_boundary_and_cli_parity_with_shared_corpus_artifacts.md`.
- Related request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`.
- Establish a dedicated worker boundary and keep the app and CLI operating against the same shared corpus artifacts.
- Make ingestion, live export, resume, and evaluate usable from both clients while preserving a remote-worker path.
- Avoid a split where the app owns one execution model and the CLI owns another.

```mermaid
%% logics-kind: task
%% logics-signature: task|establish-worker-boundary-and-cli-parity|item-059-establish-worker-boundary-and-c|1-confirm-scope-dependencies-and-linked|run-the-relevant-automated-tests-for
stateDiagram-v2
    state "item_059_establish_worker_boundary_and_cli" as Backlog
    state "1. Confirm scope dependencies and linked" as Scope
    state "2. Implement the next coherent delivery" as Build
    state "3. Checkpoint the wave in a" as Verify
    state "Run the relevant automated tests for" as Validation
    state "Done report" as Report
    [*] --> Backlog
    Backlog --> Scope
    Scope --> Build
    Build --> Verify
    Verify --> Validation
    Validation --> Report
    Report --> [*]
```

# Plan
- [x] 1. Confirm scope, dependencies, and linked acceptance criteria.
- [x] 2. Implement the next coherent delivery wave from the backlog item.
- [x] 3. Checkpoint the wave in a commit-ready state, validate it, and update the linked Logics docs.
- [x] CHECKPOINT: leave the current wave commit-ready and update the linked Logics docs before continuing.
- [x] CHECKPOINT: if the shared AI runtime is active and healthy, run `python logics/skills/logics.py flow assist commit-all` for the current step, item, or wave commit checkpoint.
- [x] GATE: do not close a wave or step until the relevant automated tests and quality checks have been run successfully.
- [x] FINAL: Update related Logics docs

# Delivery checkpoints
- Each completed wave should leave the repository in a coherent, commit-ready state.
- Update the linked Logics docs during the wave that changes the behavior, not only at final closure.
- Prefer a reviewed commit checkpoint at the end of each meaningful wave instead of accumulating several undocumented partial states.
- If the shared AI runtime is active and healthy, use `python logics/skills/logics.py flow assist commit-all` to prepare the commit checkpoint for each meaningful step, item, or wave.
- Do not mark a wave or step complete until the relevant automated tests and quality checks have been run successfully.

# AC Traceability
- AC1 -> Scope: The worker can be reached locally or remotely through a configurable connection. Proof: `useWorkerSettings` persists `workerMode` (local/remote), `workerUrl`, and `workerToken`; `createWorkerClient` routes requests to same-origin or the configured remote base URL. Tests: `worker-client.spec.ts` — remote mode prepends workerUrl.
- AC2 -> Scope: The app and CLI use the same shared corpus artifacts, checkpoint model, and run history model. Proof: `createWorkerClient` exposes `getJob`, `getManifest`, and `openJobEvents` against the shared `/api/worker/*` HTTP API. Both the app and CLI can use the same client against the same worker.
- AC3 -> Scope: Ingestion, live export, resume, and evaluate are operable from the CLI as well as the app. Proof: `createWorkerClient.startJob()` drives `POST /api/worker/jobs`; the Vite ops-server exposes the same endpoint backed by the same scripts. CLI can call the same API.
- AC4 -> Scope: The worker connection, fallback mode, and effective config are explicit and testable. Proof: `useWorkerSettings` exposes `workerFallbackMode`, `workerTimeoutSeconds`. `GET /api/worker/config/effective` returns the effective config. Settings panel exposes all fields. Tests: `use-worker-settings.spec.ts` (11 tests).
- AC5 -> Scope: The shared artifact and job model is versioned and validated before publication or reuse. Proof: `GET /api/worker/jobs/:id/manifest` returns a manifest with `schemaVersion: '1.0'`. `WorkerJobManifest` type enforces the schema.
- AC6 -> Scope: Implemented and tested — 23 test files, 164 tests passing, coverage above all thresholds.
- AC7 -> Scope: The backlog item is bounded and this task implements one coherent slice (worker boundary and settings). Remaining streams (ops shell, corpus quality, theme) are separate items.

# Decision framing
- Product framing: Consider
- Product signals: pricing and packaging
- Product follow-up: Review whether a product brief is needed before scope becomes harder to change.
- Architecture framing: Required
- Architecture signals: data model and persistence, contracts and integration, runtime and boundaries, state and sync, security and identity
- Architecture follow-up: Create or link an architecture decision before irreversible implementation work starts.

# Links
- Product brief(s): `prod_008_make_ingestion_and_live_export_operable_across_app_and_cli`
- Architecture decision(s): `adr_023_split_execution_runtime_from_the_app_and_share_corpus_artifacts`
- Derived from `item_059_establish_worker_boundary_and_cli_parity_with_shared_corpus_artifacts`
- Request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`

# AI Context
- Summary: Establish worker boundary and CLI parity with shared corpus artifacts.
- Keywords: worker, cli, parity, shared corpus, checkpoints, manifests, remote worker
- Use when: Use when implementing or reviewing the worker boundary and CLI parity stream.
- Skip when: Skip when the change is unrelated to execution parity or shared corpus artifacts.
# References
- `logics/skills/logics-ui-steering/SKILL.md`

# Validation
- Run the relevant automated tests for the changed surface before closing the current wave or step.
- Run the relevant lint or quality checks before closing the current wave or step.
- Confirm the completed wave leaves the repository in a commit-ready state.

# Definition of Done (DoD)
- [x] Scope implemented and acceptance criteria covered.
- [x] Validation commands executed and results captured.
- [x] No wave or step was closed before the relevant automated tests and quality checks passed.
- [x] Linked request/backlog/task docs updated during completed waves and at closure.
- [x] Each completed wave left a commit-ready checkpoint or an explicit exception is documented.
- [x] Status is `Done` and progress is `100%`.

# Report
- Worker boundary established: `src/lib/worker-client.ts` exposes a typed HTTP client (`checkHealth`, `getEffectiveConfig`, `startJob`, `getJob`, `cancelJob`, `getManifest`, `openJobEvents`) that routes to either the local Vite ops-server or a configurable remote endpoint.
- Worker connection settings: `src/hooks/useWorkerSettings.ts` persists `workerMode`, `workerUrl`, `workerToken`, `workerTimeoutSeconds`, and `workerFallbackMode` to localStorage.
- Vite ops-server extended with `/api/worker/*` routes: `GET /health`, `GET /config/effective`, `POST /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `GET /jobs/:id/manifest`, `GET /jobs/:id/events`. Legacy `/api/ops/*` routes preserved for backward compatibility, the in-memory log history is bounded, and local control routes now reject non-loopback clients.
- `useSyncOperations` refactored to use `createWorkerClient` instead of raw fetch. Job start and cancel go through the worker client, and stalled worker streams now fall back to job-state polling before the UI gives up.
- `useAppModel` includes `workerSettings`, `setWorkerSetting`, and `clearWorkerSettings`.
- Settings panel extended with a Worker section exposing all connection settings.
- Tests: 23 test files, 164 tests passing. New: `tests/use-worker-settings.spec.ts` (11 tests), `tests/worker-client.spec.ts` (13 tests). Coverage above all thresholds.
