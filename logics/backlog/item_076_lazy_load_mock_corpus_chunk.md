## item_076_lazy_load_mock_corpus_chunk - Lazy-load the mock corpus as a separate Vite chunk

> From version: 1.3.0
> Schema version: 1.0
> Status: Obsolete
> Understanding: 94%
> Confidence: 92%
> Progress: 0%
> Complexity: Low
> Theme: Performance / Maintainability
> Cancelled by: `logics/architecture/adr_035_python_fastapi_as_the_worker_runtime.md` — the bundled mock corpus (`src/data/corpus.ts`) is removed from the browser entirely. The browser always fetches the corpus from the Python worker (`GET /api/corpus`). There is no corpus to lazy-load.
> Reminder: This item is cancelled. Do not implement.

# Problem

- The mock corpus is bundled in `src/data/corpus.ts` and included in the main JavaScript chunk — inflating the initial bundle for users who configure a live corpus and never need the mock data.

# Scope

- In: convert the mock corpus import to a dynamic import (or explicit Vite chunk) so it is excluded from the main bundle when not needed; verify that Vite code-splitting and PWA Workbox handle the additional chunk correctly in offline mode.
- Out: changes to the corpus data format or schema; CSS modularization (tracked separately as an optional follow-up per req_018 AC8).

# Acceptance criteria

- AC1: The mock corpus is not included in the main bundle for a production build configured in live mode.
- AC2: The mock corpus loads correctly and without errors when the app runs in mock mode.
- AC3: The PWA service worker caches the corpus chunk correctly and the app works offline in mock mode after install.

# Links

- Request: `logics/request/req_018_post_v1_3_code_quality_security_and_maintainability_audit.md`
- Product brief(s): (none)
- Architecture decision(s): `logics/architecture/adr_027_pwa_cache_and_offline_fallback_strategy.md`
- Task(s): `task_040_orchestrate_post_v1_3_code_quality_security_and_maintainability_audit`

# Validation evidence

- `rtk npm run build`
- `rtk npm run e2e -- tests/e2e/offline.spec.ts tests/e2e/live-mode.spec.ts`
- `rtk npm run check`
