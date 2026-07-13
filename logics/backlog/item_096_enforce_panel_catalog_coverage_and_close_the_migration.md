## item_096_enforce_panel_catalog_coverage_and_close_the_migration - Enforce panel catalog coverage and close the migration
> From version: 1.5.2
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: Internationalization contract adoption
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# Problem
- Hidden panel states, notifications, placeholders, and accessibility attributes can escape manual localization review.
- Without a guard, new panel work can reintroduce hardcoded product copy.

# Scope
- In:
  - Run a final source inventory across panel branches, notifications, attributes, helpers, and error framing and classify every candidate.
  - Add a static guard with a reviewed allowlist for fixtures, technical literals, remote/configured/generated content, and user data.
  - Validate catalog parity, placeholder parity, unused-key policy, semantic key conventions, and content-boundary fixtures.
  - Run the full repository validation matrix and record coverage and closure evidence in the task journal.
- Out:
  - Unrelated panel refactoring.
  - Translation-platform integration.

# Acceptance criteria
- AC1: The inventory contains no unclassified product-owned copy.
- AC2: A failing fixture proves the guard rejects new hardcoded panel copy.
- AC3: Catalog, placeholder, and data-boundary checks pass.
- AC4: Full validation passes and the Logics chain contains closure evidence.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: The inventory contains no unclassified product-owned copy.
- request-AC2 -> This backlog slice. Proof: AC2: A failing fixture proves the guard rejects new hardcoded panel copy.
- request-AC3 -> This backlog slice. Proof: AC3: Catalog, placeholder, and data-boundary checks pass.
- request-AC4 -> This backlog slice. Proof: AC4: Full validation passes and the Logics chain contains closure evidence.
- request-AC5 -> This backlog slice. Proof: AC4: Full validation passes and the Logics chain contains closure evidence.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_016_complete_localized_panel_experience`
- Architecture decision(s): (none yet)
- Request: `req_023_complete_semantic_i18n_adoption_across_remaining_application_panels`
- Primary task(s): `task_046_orchestrate_completion_of_panel_localization`

# AI Context
- Summary: Enforce panel catalog coverage and close the migration
- Keywords: scaffolded-backlog, enforce panel catalog coverage and close the migration, implementation-ready
- Use when: Implementing the scaffolded slice for Enforce panel catalog coverage and close the migration.
- Skip when: The change belongs to another backlog slice.

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.

# Tasks
- `task_046_orchestrate_completion_of_panel_localization`

# Notes
- Task `task_046_orchestrate_completion_of_panel_localization` was finished via `logics-manager flow finish task` on 2026-07-13.
