# Changelog (`1.4.0 -> 1.5.0`)

Release date: 2026-04-19

## Major Highlights

- DeepVault Nexus 1.5.0 consolidates the shared-app direction into one release story: worker runtime migration, hosted auth, operator gating, and deployment packaging now move together.
- The app shell is now organized around clearer ownership boundaries, with runtime, sync, and settings surfaces split more deliberately.
- The corpus, Bishop, explorer, and AI View flows were hardened so the app feels more coherent across local, hosted, and release-note surfaces.
- Release operations were cleaned up in parallel: changelog structure, parser support, and published release bodies now follow the same cdx-manager-style format.

### Worker Runtime and Shared Backend

- Python FastAPI worker foundation, CLI parity, corpus endpoint, Bishop proxy, and worker-managed jobs now define the shared backend path.
- File-backed runtime artifacts, stable job status values, and SSE progress streaming keep long-running operations observable and restart-safe.
- The browser now stays thin while the worker owns corpus loading, scoring, Bishop dispatch, and job execution.

### Hosted Auth and Deployment

- Entra SSO, bearer-token validation, operator allowlisting, and structured access logging make the shared deployment operable for authenticated users.
- Hosted-mode UI hides local-only controls and exposes the identity and shared-session affordances needed for multi-user operation.
- Docker Compose, Caddy, and the operator runbook provide the deployable package for the hosted stack.

### Shell, Navigation, and Settings

- Runtime controls, sync operations, and settings now live in clearer places instead of competing in the same surface.
- Persisted theme, navigation, and shell ownership changes reduce friction in the day-to-day operator flow.
- Dedicated sync and recovery entry points make the operations path easier to scan and use.

### AI, Corpus, and Explorer

- Bishop response flow, generated artifacts, corpus enrichment, and retrieval behavior were tightened so the AI surface reads more predictably.
- Explorer card hierarchy, source-link polish, file-type pills, and compact path display improve the browsing surface.
- PWA install/update/offline behavior remains part of the product baseline, including install and update affordances.

### Release Process and Validation

- Changelog sections after `Major Highlights` now collapse again in the app, keeping long release notes usable.
- The changelog parser and release-note tests were updated for the new markdown structure.
- `VERSION` was removed, and `package.json` is now the single source of truth for versioning.

## Validation and Regression Evidence

- `npm run check`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run e2e`
- `rtk python3 -m pytest worker/tests -q`
- `rtk python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status --format text`

## Notes

- This release groups the full hosted-app transition rather than a narrow cleanup slice.
- GitHub release bodies should be regenerated from this changelog after tagging `v1.5.0`.
