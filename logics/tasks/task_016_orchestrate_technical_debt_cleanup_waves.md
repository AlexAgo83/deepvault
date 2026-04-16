## task_016_orchestrate_technical_debt_cleanup_waves - Orchestrate technical debt cleanup waves
> From version: 1.2.1
> Schema version: 1.0
> Status: Done
> Understanding: 99%
> Confidence: 99%
> Progress: 100.0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# Context
- Orchestrate the five bounded cleanup waves created from `req_011_audit_de_dette_technique_et_cleanup_structurel`.
- Keep the execution order explicit so refactors, contract cleanup, export hardening, and workflow hygiene stay separated.
- Recommended wave order:
  - Wave 1: `item_042_clean_logics_workflow_hygiene_and_references`
  - Wave 2: `item_038_refactor_app_shell_and_ui_state`
  - Wave 3: `item_039_split_deepvault_retrieval_and_evaluation_helpers`
  - Wave 4: `item_040_clarify_bishop_orchestration_contract`
  - Wave 5: `item_041_harden_live_export_and_checkpoint_handling`

```mermaid
%% logics-kind: task
%% logics-signature: task|orchestrate-technical-debt-cleanup-waves|item-038-refactor-app-shell-and-ui-state|1-confirm-the-five-sibling-backlog|run-npm-run-lint-and-npm
stateDiagram-v2
    state "item_038_refactor_app_shell_and_ui_state" as Backlog
    state "1. Confirm the five sibling backlog" as Scope
    state "2. Orchestrate the UI and shell" as Build
    state "3. Keep each wave commit-ready validate" as Verify
    state "Run npm run lint and npm" as Validation
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
- [x] 1. Confirm the five sibling backlog items, their boundaries, and their execution order.
- [x] 2. Orchestrate the UI and shell wave first, then the retrieval and Bishop waves, then the export and workflow hygiene waves.
- [x] 3. Keep each wave commit-ready, validate it, and update the linked Logics docs before moving on.
- [x] CHECKPOINT: leave the current wave commit-ready and update the linked Logics docs before continuing.
- [x] CHECKPOINT: if the shared AI runtime is active and healthy, run `python logics/skills/logics.py flow assist commit-all` for the current step, item, or wave commit checkpoint.
- [x] GATE: do not close a wave or step until the relevant automated tests and quality checks have been run successfully.
- [x] FINAL: update the request, backlog, and task docs once all waves are closed.

# Delivery checkpoints
- Each completed wave should leave the repository in a coherent, commit-ready state.
- Update the linked Logics docs during the wave that changes the behavior, not only at final closure.
- Prefer a reviewed commit checkpoint at the end of each meaningful wave instead of accumulating several undocumented partial states.
- If the shared AI runtime is active and healthy, use `python logics/skills/logics.py flow assist commit-all` to prepare the commit checkpoint for each meaningful step, item, or wave.
- Do not mark a wave or step complete until the relevant automated tests and quality checks have been run successfully.

# AC Traceability
- AC1 -> Plan: Orchestrate the five sibling backlog items in bounded waves. Proof: capture validation evidence in this doc.

# Decision framing
- Product framing: Not needed
- Product signals: (none detected)
- Product follow-up: No product brief follow-up is expected based on current signals.
- Architecture framing: Not needed
- Architecture signals: (none detected)
- Architecture follow-up: No architecture decision follow-up is expected based on current signals.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Backlog items: `item_038_refactor_app_shell_and_ui_state`, `item_039_split_deepvault_retrieval_and_evaluation_helpers`, `item_040_clarify_bishop_orchestration_contract`, `item_041_harden_live_export_and_checkpoint_handling`, `item_042_clean_logics_workflow_hygiene_and_references`
- Architecture decisions: `adr_018_split_the_app_shell_and_ui_state_boundaries`, `adr_019_split_deepvault_retrieval_and_evaluation_helpers`, `adr_020_clarify_bishop_orchestration_states_and_response_contract`, `adr_021_harden_live_export_and_checkpoint_boundaries`
- Request(s): `req_011_audit_de_dette_technique_et_cleanup_structurel`

# AI Context
- Summary: Orchestrate technical debt cleanup waves
- Keywords: orchestrate, technical, debt, cleanup, waves
- Use when: Use when executing the current implementation wave for Orchestrate technical debt cleanup waves.
- Skip when: Skip when the work belongs to another backlog item or a different execution wave.
# Validation
- Run `npm run lint` and `npm run typecheck` after code waves.
- Run `npm run test` after library and orchestration waves.
- Run `npm run build` and `npm run e2e` before finalizing the initiative.
- Run `python logics/skills/logics-doc-linter/scripts/logics_lint.py` and refresh `logics/INDEX.md` after workflow hygiene changes.
- Confirm each completed wave leaves the repository in a commit-ready state.

# Definition of Done (DoD)
- [x] Scope implemented and acceptance criteria covered.
- [x] Validation commands executed and results captured.
- [x] No wave or step was closed before the relevant automated tests and quality checks passed.
- [x] Linked request, backlog, and task docs were updated during completed waves and at closure.
- [x] Each completed wave left a commit-ready checkpoint or an explicit exception is documented.
- [x] Status is `Done` and progress is `100%`.

# Report
- Wave 1 completed: cleaned Logics workflow hygiene and reference hygiene, regenerated `logics/RELATIONSHIPS.md`, and refreshed the duplicate-review notes in `item_042`.
- Wave 2 completed: split the app shell into smaller UI primitives and hooks while keeping the current explorer, Bishop, and sync flows intact.
- Wave 3 completed: split evaluation and formatting helpers into a dedicated module and kept the public deepvault surface stable.
- Wave 4 completed: clarified the Bishop orchestration contract by making the grounded-only path explicit, aligning the shared chat message type, and validating the hook/tests against the new mode.
- Wave 5 completed: split live export CLI/runtime state from checkpoint persistence, added checkpoint snapshot helpers and replayable state tests, and kept the live export workflow observable.
- April 2026 maintenance follow-up: fixed a `typecheck` regression in `tests/use-sync-operations.spec.tsx`, moved `formatDuration` out of `sync-panel.tsx` to clear the fast-refresh lint warning, narrowed worker job env propagation to the minimum required per operation, switched Gemini REST auth from query string to `x-goog-api-key`, and realigned README version/security notes with the shipped `1.2.0` state.
- April 2026 hardening follow-up: normalized provider options in `useAppModel` so empty live corpora remain renderable, derived provider readiness from current session credentials instead of stale corpus snapshots, and moved Bishop conversation persistence from `localStorage` to `sessionStorage` with legacy migration coverage.
- April 2026 CI hardening follow-up: made `npm run evaluate` ignore ambient provider API keys and local data-mode/path overrides so the mock baseline remains deterministic on CI runners and developer machines with local LLM credentials loaded, and raised retrieval strictness enough to reject unrelated multi-term queries that only collide on a generic `Timeline` section heading.
- April 2026 cross-platform follow-up: replaced the shell-dependent `npm run check` implementation with a Node orchestrator, documented Windows copy/env commands in the README, and extended GitHub Actions validation to `windows-latest` alongside Ubuntu with OS-specific Playwright install steps.
