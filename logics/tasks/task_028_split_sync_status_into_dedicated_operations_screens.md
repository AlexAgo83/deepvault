## task_028_split_sync_status_into_dedicated_operations_screens - Split Sync Status into dedicated operations screens
> From version: 1.1.0
> Schema version: 1.0
> Status: Ready
> Understanding: 94%
> Confidence: 90%
> Progress: 0%
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
- [ ] 1. Confirm scope, dependencies, and linked acceptance criteria.
- [ ] 2. Implement the next coherent delivery wave from the backlog item.
- [ ] 3. Checkpoint the wave in a commit-ready state, validate it, and update the linked Logics docs.
- [ ] CHECKPOINT: leave the current wave commit-ready and update the linked Logics docs before continuing.
- [ ] CHECKPOINT: if the shared AI runtime is active and healthy, run `python logics/skills/logics.py flow assist commit-all` for the current step, item, or wave commit checkpoint.
- [ ] GATE: do not close a wave or step until the relevant automated tests and quality checks have been run successfully.
- [ ] FINAL: Update related Logics docs

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
- [ ] Scope implemented and acceptance criteria covered.
- [ ] Validation commands executed and results captured.
- [ ] No wave or step was closed before the relevant automated tests and quality checks passed.
- [ ] Linked request/backlog/task docs updated during completed waves and at closure.
- [ ] Each completed wave left a commit-ready checkpoint or an explicit exception is documented.
- [ ] Status is `Done` and progress is `100%`.

# Report
