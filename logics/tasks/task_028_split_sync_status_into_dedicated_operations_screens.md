## task_028_split_sync_status_into_dedicated_operations_screens - Split Sync Status into dedicated operations screens
> From version: 1.1.0
> Schema version: 1.0
> Status: Done
> Understanding: 99%
> Confidence: 99%
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# Context
- Derived from backlog item `item_060_split_sync_status_into_dedicated_operations_screens`.
- Source file: `logics/backlog/item_060_split_sync_status_into_dedicated_operations_screens.md`.
- Related request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`.
- Split the overloaded Sync Status experience into a concise summary and dedicated operational screens.
- Make the default path obvious for status, operations, history, config, and recovery.
- Reduce panel overload while keeping the app easy to scan during live runs.

```mermaid
%% logics-kind: task
%% logics-signature: task|split-sync-status-into-dedicated-operati|item-060-split-sync-status-into-dedicate|1-confirm-scope-dependencies-and-linked|run-the-relevant-automated-tests-for
stateDiagram-v2
    state "item_060_split_sync_status_into_dedicated_" as Backlog
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

# Delivery checkpoints
- Each completed wave should leave the repository in a coherent, commit-ready state.
- Update the linked Logics docs during the wave that changes the behavior, not only at final closure.
- Prefer a reviewed commit checkpoint at the end of each meaningful wave instead of accumulating several undocumented partial states.
- If the shared AI runtime is active and healthy, use `python logics/skills/logics.py flow assist commit-all` to prepare the commit checkpoint for each meaningful step, item, or wave.
- Do not mark a wave or step complete until the relevant automated tests and quality checks have been run successfully.

# AC Traceability
- AC1 -> Scope: Sync Status becomes a concise summary surface rather than the only operational screen.. Proof: capture validation evidence in this doc.
- AC2 -> Scope: Dedicated surfaces exist for operations, run history, config, and recovery.. Proof: capture validation evidence in this doc.
- AC3 -> Scope: The screen split preserves consistent state vocabulary and clear navigation labels.. Proof: capture validation evidence in this doc.
- AC4 -> Scope: The summary remains readable during active runs and does not become overloaded.. Proof: capture validation evidence in this doc.
- AC5 -> Scope: The split is clear enough to implement in bounded slices without changing worker behavior.. Proof: capture validation evidence in this doc.

# Decision framing
- Product framing: Consider
- Product signals: navigation and discoverability
- Product follow-up: Review whether a product brief is needed before scope becomes harder to change.
- Architecture framing: Required
- Architecture signals: data model and persistence, state and sync
- Architecture follow-up: Create or link an architecture decision before irreversible implementation work starts.

# Links
- Product brief(s): `prod_005_split_sync_status_into_dedicated_operations_screens`
- Architecture decision(s): `adr_024_split_sync_status_into_dedicated_operations_screens`
- Derived from `item_060_split_sync_status_into_dedicated_operations_screens`
- Request(s): `req_017_implement_the_full_app_worker_corpus_and_shell_plan`

# AI Context
- Summary: Split Sync Status into dedicated operations screens.
- Keywords: sync status, operations, history, config, recovery, navigation, summary
- Use when: Use when implementing or reviewing the operational screen split.
- Skip when: Skip when the change is unrelated to the ops screen split.
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

Implemented the full sync panel split in a single wave.

**AC1** — Sync Status default view is now a concise summary with a KPI grid, site table, and a quick job summary card. No operation controls on the landing view.

**AC2** — Four dedicated sub-views implemented via local `syncView` state: Status (summary), Operations (controls + console), History (run list + evaluation prep checklist), Config (worker connection read-only display + recovery guidance).

**AC3** — Navigation labels are consistent: "Status", "Operations", "History", "Config". State vocabulary (job status, progress %, duration) is shared across all views via the same `currentJob` and `syncOperations` references.

**AC4** — Summary view shows at most one job summary card when a job is active/finished. Auto-switch to Operations view when a job starts keeps the summary uncluttered during runs.

**AC5** — No worker protocol or corpus schema changes. All sub-views read from the existing `syncOperations` model; the split is purely presentational.

Validation: 164/164 tests passing. All app.spec.tsx sync-related tests updated to navigate to the correct sub-view before asserting operation buttons or run history.
