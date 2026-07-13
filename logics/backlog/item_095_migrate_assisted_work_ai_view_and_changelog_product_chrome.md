## item_095_migrate_assisted_work_ai_view_and_changelog_product_chrome - Migrate assisted-work, AI view, and changelog product chrome
> From version: 1.5.2
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: Internationalization contract adoption
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# Problem
- Assisted-work and AI panels combine product controls with prompts, generated answers, traces, statistics, and provider output.
- Changelog framing is stable product copy while entry content may be supplied as versioned data.

# Scope
- In:
  - Migrate assistant actions, labels, placeholders, answer-state framing, trace labels, AI statistics labels, changelog navigation, loading and empty states, and accessibility text.
  - Use named placeholders for counts, durations, token or usage summaries, versions, and selected references.
  - Keep prompts, generated answers, citations, traces, provider output, and changelog entry content as runtime data unless explicitly authored as stable product copy.
  - Add tests for empty, running, successful, failed, and populated states.
- Out:
  - Translation of prompts, answers, traces, citations, provider output, or version-authored changelog bodies.
  - Changes to model invocation or statistics calculation.

# Acceptance criteria
- AC1: Targeted product chrome uses semantic keys in every locale.
- AC2: Dynamic summaries use named placeholders with locale-aware formatting.
- AC3: Generated, provider, and versioned content remains unchanged.
- AC4: State-focused UI tests cover visible and accessibility copy.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: AC1: Targeted product chrome uses semantic keys in every locale.
- request-AC2 -> This backlog slice. Proof: AC2: Dynamic summaries use named placeholders with locale-aware formatting.
- request-AC3 -> This backlog slice. Proof: AC3: Generated, provider, and versioned content remains unchanged.
- request-AC5 -> This backlog slice. Proof: AC4: State-focused UI tests cover visible and accessibility copy.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_016_complete_localized_panel_experience`
- Architecture decision(s): (none yet)
- Request: `req_023_complete_semantic_i18n_adoption_across_remaining_application_panels`
- Primary task(s): `task_046_orchestrate_completion_of_panel_localization`

# AI Context
- Summary: Migrate assisted-work, AI view, and changelog product chrome
- Keywords: scaffolded-backlog, migrate assisted-work, ai view, and changelog product chrome, implementation-ready
- Use when: Implementing the scaffolded slice for Migrate assisted-work, AI view, and changelog product chrome.
- Skip when: The change belongs to another backlog slice.

# Priority
- Priority: High
- Rationale: Set by scaffold input or defaulted for grooming.
