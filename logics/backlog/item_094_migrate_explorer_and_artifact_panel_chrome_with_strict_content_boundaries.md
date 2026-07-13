## item_094_migrate_explorer_and_artifact_panel_chrome_with_strict_content_boundaries - Migrate explorer and artifact panel chrome with strict content boundaries
> From version: 1.5.2
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: High
> Theme: Internationalization contract adoption
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# Problem
- Explorer and artifact panels mix stable navigation and action labels with repository content, metadata, paths, export values, and artifact bodies.
- A broad translation pass could corrupt content or incorrectly catalog remote values.

# Scope
- In:
  - Migrate explorer and artifact headings, actions, filters, loading and empty states, metadata labels, export framing, dialogs, notifications, and accessibility attributes.
  - Use named placeholders for result counts, selected-item references, timestamps, sizes, and export summaries.
  - Keep paths, document titles, corpus text, artifact names and bodies, metadata values, and remote statuses as runtime data.
  - Add fixtures that switch locale around representative repository and artifact content without mutating that content.
- Out:
  - Translation of files, corpus records, artifact bodies, metadata values, or exports.
  - Changes to exploration or export behavior.

# Acceptance criteria
- AC1: Explorer and artifact product chrome is fully catalog-driven.
- AC2: Dynamic summaries use named placeholders and locale-aware formatting.
- AC3: Content-boundary fixtures remain byte-for-byte stable across locale switches.
- AC4: Explorer and artifact UI tests pass in every supported locale.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: Explorer and artifact product chrome is fully catalog-driven.
- request-AC2 -> This backlog slice. Proof: AC2: Dynamic summaries use named placeholders and locale-aware formatting.
- request-AC3 -> This backlog slice. Proof: AC3: Content-boundary fixtures remain byte-for-byte stable across locale switches.
- request-AC5 -> This backlog slice. Proof: AC4: Explorer and artifact UI tests pass in every supported locale.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_016_complete_localized_panel_experience`
- Architecture decision(s): (none yet)
- Request: `req_023_complete_semantic_i18n_adoption_across_remaining_application_panels`
- Primary task(s): `task_046_orchestrate_completion_of_panel_localization`

# AI Context
- Summary: Migrate explorer and artifact panel chrome with strict content boundaries
- Keywords: scaffolded-backlog, migrate explorer and artifact panel chrome with strict content boundaries, implementation-ready
- Use when: Implementing the scaffolded slice for Migrate explorer and artifact panel chrome with strict content boundaries.
- Skip when: The change belongs to another backlog slice.

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.
