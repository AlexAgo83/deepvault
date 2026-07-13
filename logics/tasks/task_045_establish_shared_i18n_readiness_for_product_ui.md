## task_045_establish_shared_i18n_readiness_for_product_ui - Establish shared i18n readiness for product UI
> From version: 1.5.2
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Owner: codex

# Definition of Done (DoD)
- [x] The backlog scope is implemented.
- [x] Acceptance criteria are covered.
- [x] Validation passes.
- [x] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# Backlog
- `item_092_establish_shared_i18n_readiness_for_product_ui`

# Acceptance criteria
- AC1: A valid English source-only i18n v1 contract declares a repository-contained JSON catalog.
- AC2: Common shell, onboarding, and confirmation-dialog copy use stable semantic keys with unchanged visible wording and behavior.
- AC3: Dynamic technical, corpus, AI-generated, provider, remote-error, and user content remain outside the catalog.
- AC4: Missing keys fall back deterministically and are visible during development.
- AC5: New static UI copy follows documented namespaces and contract validation passes.
- AC6: The viewer exposes the catalog and existing tests, lint, typecheck, and build remain green.

# Validation
- Shared contract validation, typecheck, lint, all 327 tests, and the production Vite/PWA build passed.
- contract validation, typecheck, lint, 327 tests, and production PWA build passed
- Finish workflow executed on 2026-07-13.
- Linked backlog/request close verification passed.

# Report
- Implementation complete.
- Finished on 2026-07-13.
- Linked backlog item(s): `item_092_establish_shared_i18n_readiness_for_product_ui`
- Related request(s): `req_022_establish_shared_i18n_readiness_for_product_ui`

# AI Context
- Summary: Implement establish shared i18n readiness for product ui.
- Keywords: task, implementation, backlog, runtime, python
- Use when: You need a bounded implementation task for a backlog item.
- Skip when: The work is still at the request or backlog shaping stage.

# Links
- Request: `req_022_establish_shared_i18n_readiness_for_product_ui`
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# AC Traceability
- request-AC1 -> This task. Proof: the valid source-only contract declares `src/i18n/en.json`.
- request-AC2 -> This task. Proof: sidebar navigation, onboarding, and confirmation actions resolve semantic keys with unchanged copy.
- request-AC3 -> This task. Proof: corpus, AI, provider, error, technical, and user values remain runtime content.
- request-AC4 -> This task. Proof: the adapter exposes bracketed keys in development and deterministic keys in production.
- request-AC5 -> This task. Proof: shell, onboarding, and dialog namespaces validate under the shared contract.
- request-AC6 -> This task. Proof: viewer contract validation, typecheck, lint, 327 tests, and build passed.
