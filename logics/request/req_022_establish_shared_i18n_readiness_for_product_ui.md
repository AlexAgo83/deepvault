## req_022_establish_shared_i18n_readiness_for_product_ui - Establish shared i18n readiness for product UI
> From version: 1.5.2
> Schema version: 1.0
> Status: Draft
> Understanding: 100
> Confidence: 94
> Complexity: Medium
> Theme: Internationalization readiness
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# Needs
- Establish an English source-only shared i18n contract for the existing React product UI.
- Route new and progressively migrated static interface copy through stable semantic keys.
- Preserve technical data, generated content, corpus content, and user content as non-catalog values.

# Context
- User-facing copy is distributed across the app shell, settings, onboarding, confirmation dialogs, sync, explorer, artifacts, and assistant panels.
- No locale catalog or translation runtime is currently detected.
- The product contains substantial dynamic technical and generated content that must not be treated as application translation copy.
- The shared i18n contract and lifecycle commands are delivery dependencies.

# Scope
- In:
  - inventory static app-owned copy and define namespaces for shell, onboarding, settings, dialogs, sync, explorer, artifacts, and assistant UI;
  - initialize an English source-only i18n v1 contract and JSON catalog;
  - add a minimal local semantic-key adapter with named placeholders and deterministic fallback;
  - migrate common shell, onboarding, and confirmation-dialog copy as the first bounded slice;
  - require semantic keys for new static UI copy and expose the catalog in the viewer;
  - document later locale addition and remaining panel slices.
- Out:
  - translate corpus documents, AI output, filenames, provider data, logs, errors returned by remote systems, or user-entered content;
  - add a second locale or remote translation platform;
  - change authentication, synchronization, storage, assistant, or theme behavior;
  - refactor unrelated panel architecture.

# Acceptance criteria
- AC1: A valid English source-only i18n v1 contract declares a repository-contained JSON catalog.
- AC2: Common shell, onboarding, and confirmation-dialog copy use stable semantic keys with unchanged visible wording and behavior.
- AC3: Dynamic technical, corpus, AI-generated, provider, remote-error, and user content remain outside the catalog.
- AC4: Missing keys fall back deterministically and are visible during development.
- AC5: New static UI copy follows documented namespaces and contract validation passes.
- AC6: The viewer exposes the catalog and existing tests, lint, typecheck, and build remain green.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Dependencies and risks
- Depends on the shared i18n v1 schema and lifecycle commands.
- Broad text extraction could incorrectly capture dynamic technical or generated content; the inventory must classify ownership before migration.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `src/components/app-shell.tsx`
- `src/components/app-ui.tsx`
- `src/components/getting-started-modal.tsx`
- `src/components/confirm-modal.tsx`
- `src/components/panels/settings-panel.tsx`
- `src/components/panels/sync-panel.tsx`

# AI Context
- Summary: Introduce an English source-only catalog for app-owned UI while excluding dynamic technical and generated content.
- Keywords: i18n-readiness, source-only, semantic-keys, react
- Use when: Planning the initial bounded UI migration after shared tooling is available.
- Skip when: Translating corpus, AI, provider, or user content.

# Backlog
- none
