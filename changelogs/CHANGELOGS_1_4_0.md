# Changelog (`1.3.0 -> 1.4.0`)

Release date: 2026-04-18

## Major Highlights

- DeepVault Nexus 1.4.0 stabilizes the current local-first product state and freezes the documentation baseline before the hosted worker and corpus-logics migration begins.
- The release closes the loop on the `req_020` migration slices so request, backlog, task, product, and architecture docs now point to the same delivery graph.
- First-wave worker contracts are normalized around folder layout, shared-vs-local state ownership, file-backed runtime artifacts, API/CLI parity, stable job lifecycle, `config/mode`, and the standard error envelope.
- CI is expanded into explicit `frontend`, `worker`, and `contracts` smoke jobs, with an anti-zombie migration guard added to the local validation path.
- The current app baseline is revalidated with lint, typecheck, coverage, build, evaluate, e2e, and Logics lint before the release is cut.

### Release and Migration Planning

- Added the missing orchestration tasks and cross-links for `req_020` so the migration plan is reviewable as a single delivery graph.
- Aligned the active Logics package around the hosted worker direction and the next large migration wave.
- Kept the release intentionally focused on baseline freeze and planning rather than starting the Python worker implementation.

### Validation and CI

- Expanded the CI plan from a generic workflow note to explicit `frontend`, `worker`, and `contracts` smoke jobs.
- Added the anti-zombie migration guard to catch runaway local processes during validation.
- Revalidated the baseline with lint, typecheck, coverage, build, evaluate, e2e, and Logics lint.

## Notes

- This release intentionally does not start the Python worker implementation yet.
- The Logics lint still reports known non-blocking Mermaid hygiene warnings in older docs.
