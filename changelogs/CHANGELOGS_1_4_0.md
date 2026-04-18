# CHANGELOGS_1_4_0

Release date: 2026-04-18

## DeepVault Nexus 1.4.0

DeepVault Nexus 1.4.0 is a stabilization release that freezes the current local-first product state and locks the documentation baseline before the larger hosted worker and corpus-logics migration begins.

### At a glance

- Aligned the active Logics package around the hosted worker direction: Python/FastAPI worker, Caddy reverse proxy, Entra SSO, and a browser that becomes a UI-only client
- Added the missing orchestration tasks and cross-links for the `req_020` migration slices so request, backlog, task, product, and architecture docs now point to the same delivery graph
- Normalized the first-wave worker contracts: worker folder layout, shared-vs-local state ownership, file-backed runtime artifacts, API/CLI parity, stable job lifecycle, `config/mode` payload, and standard error envelope
- Expanded the CI plan from a generic workflow note to an explicit first-wave pipeline with separate `frontend`, `worker`, and `contracts` smoke jobs plus an anti-zombie migration guard
- Revalidated the current app baseline with lint, typecheck, coverage, build, evaluate, end-to-end tests, and Logics lint before cutting the release

### Why it matters

- The repo now has a stable and reviewable handoff point before the heavy hosted-worker implementation and the next large corpus/logics wave begin.
- Product, architecture, and delivery docs describe the same target state, which reduces the risk of opening the migration with contradictory instructions.
- The current application baseline remains green, so the next phase can focus on implementation rather than untangling release drift.

### Validation

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run test:coverage
rtk npm run build
rtk npm run evaluate
rtk npm run e2e
rtk npm run e2e:pwa-refresh
rtk python3 logics/skills/logics.py lint --require-status
```

### Notes

- This release intentionally does not start the Python worker implementation yet; it freezes the baseline and the migration plan first.
- The Logics lint still reports known non-blocking warnings around Mermaid hygiene in older docs, but the active package is structurally coherent.
