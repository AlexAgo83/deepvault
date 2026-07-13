## req_023_complete_semantic_i18n_adoption_across_remaining_application_panels - Complete semantic i18n adoption across remaining application panels
> From version: 1.5.2
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Complexity: High
> Theme: Internationalization contract adoption
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# Needs
- Every remaining product-owned panel label, instruction, action, status, placeholder, and accessibility attribute must use stable semantic catalog keys.
- Runtime, provider, repository, artifact, corpus, and AI-generated values must remain data rather than becoming translation keys.
- Dynamic status and result messages must use named placeholders with locale-aware formatting.
- The repository must measure coverage and prevent new hardcoded product copy after migration.

# Context
- An initial convention slice established the repository i18n contract and migrated a representative application surface.
- Settings, runtime, hosted-session, provider, worker, synchronization, explorer, artifact, assistant, AI view, and changelog panels still contain substantial hardcoded interface copy.
- These panels mix stable product chrome with provider names, repository paths, document metadata, artifact content, remote status details, prompts, answers, traces, and user input.
- Only stable product-owned framing belongs in locale catalogs; remote, configured, generated, technical, and user-owned values must be passed as data.
- The target convention requires semantic keys, locale parity, placeholder parity, deterministic validation, and an explicit base-locale policy.

# Acceptance criteria
- AC1: All remaining panel-owned product copy and accessibility text is catalog-driven through stable semantic keys with locale parity.
- AC2: Dynamic messages use named placeholders and locale-aware formatting without raw sentences or rendered values as keys.
- AC3: Provider names, paths, corpus content, document metadata, artifacts, prompts, generated answers, traces, remote messages, and user input remain untranslated data.
- AC4: A source inventory and static guard detect unclassified or newly hardcoded product copy outside a reviewed allowlist.
- AC5: Contract validation, unit and UI tests, type checks, and production build pass with representative panel coverage in every supported locale.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_016_complete_localized_panel_experience`
- Architecture decision(s): (none yet)

# References
- src/components/settings-panel.tsx
- src/components/settings-changelog-panel.tsx
- src/components/sync-panel.tsx
- src/components/explorer-panel.tsx
- src/components/artifacts-panel.tsx
- src/components/bishop-panel.tsx
- src/components/ai-stats-panel.tsx

# AI Context
- Summary: Complete semantic i18n adoption across remaining application panels
- Keywords: request-chain-scaffold, complete semantic i18n adoption across remaining application panels, development-ready
- Use when: You need to implement or review the scaffolded workflow for Complete semantic i18n adoption across remaining application panels.
- Skip when: The change is unrelated to this scaffolded request chain.

# Backlog
- `item_093_migrate_settings_runtime_provider_worker_and_synchronization_chrome`
- `item_094_migrate_explorer_and_artifact_panel_chrome_with_strict_content_boundaries`
- `item_095_migrate_assisted_work_ai_view_and_changelog_product_chrome`
- `item_096_enforce_panel_catalog_coverage_and_close_the_migration`
