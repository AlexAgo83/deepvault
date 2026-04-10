## spec_000_deepvault_navy_experience_and_state_matrix - DeepVault Navy experience and state matrix
> From version: 0.0.2
> Understanding: 94%
> Confidence: 92%

# Overview
`DeepVault - Navy` is the local browsing surface for SharePoint content.
It must make the content structure understandable fast, with a grounded layout that works on desktop and mobile.
The spec covers the navigation states, detail states, and operational states that the local UI needs to expose.

# Goals
- Let users inspect SharePoint structure locally.
- Keep the explorer readable, fast, and easy to debug.
- Make loading, empty, error, and permission states explicit instead of hidden.

# Non-goals
- Editing SharePoint content.
- Building a full admin console.
- Replacing the hosted backend or Teams channel.

# Users & use cases
- Engineers validating ingestion and navigation.
- Testers checking pilot sites and content structure.
- Reviewers who need to understand what the local app has ingested.

# Scope
- In: site tree, breadcrumbs, detail pane, content preview, source links, and sync status.
- In: explicit loading, empty, error, and no-permission states.
- In: keyboard navigation, responsive layout, and lightweight search and filtering when available.
- Out: write actions, admin workflows, and Teams-specific behavior.

# Authentication model for local Navy
`DeepVault - Navy` runs as a local web service and requires a real Microsoft identity to access SharePoint content. The minimum authentication model is:

- On first launch, Navy opens a device code flow (MSAL) that prompts the user to authenticate with their Entra ID (Microsoft 365) account in a browser.
- The access token and refresh token are stored in the OS native credential store (macOS Keychain on Mac, Windows Credential Manager on Windows). Tokens are never written to plain files or environment variables.
- Subsequent launches reuse the stored refresh token silently. The user is only re-prompted if the refresh token expires or is revoked.
- Token expiry: access tokens expire after 1 hour (Entra default). Refresh tokens are valid for 90 days of inactivity.
- Local Navy does not support unauthenticated access. The explorer cannot show any SharePoint content without a valid token.
- The identity resolved at login is the same identity used by the retrieval layer for permission checks. No separate service account is used for local exploration.

# Requirements
- `DeepVault - Navy` must let a user move from site to library to folder to list to document detail.
- The explorer must keep the current location, breadcrumbs, and selection state visible.
- The UI must show why content is unavailable when permissions block it.
- The local shell must stay usable on desktop and mobile.
- Navy must prompt for Entra authentication on first launch via device code flow.
- Navy must surface a clear re-authentication prompt if the stored token expires or is invalid.
- Any UI implementation should use `logics/skills/logics-ui-steering/SKILL.md` before layout or styling choices are finalized.

# Acceptance criteria
- Users can browse the pilot sites locally through the expected SharePoint hierarchy.
- The explorer exposes enough detail context to confirm the pilot content is present.
- Loading, empty, error, and denied states are visible and understandable.
- The surface remains consistent with the local runtime contract and can be reused later.

# Validation / test plan
- Manually smoke test the tree, breadcrumb, and detail pane on desktop and mobile.
- Verify source links open the correct SharePoint objects.
- Confirm empty, loading, and permission-denied states are readable.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# Open questions
- Should search and filtering ship in the first local pass or after the navigation shell is stable?

# References
- `logics/product/prod_000_sharepoint_knowledge_graph_product_vision.md`
- `logics/product/prod_001_local_first_development_and_test_strategy.md`
- `logics/backlog/item_003_explorer_ui_for_sharepoint_navigation.md`
- `logics/backlog/item_006_local_companion_app_for_explorer_and_chat.md`
- `logics/backlog/item_008_local_explorer_shell_and_navigation.md`
- `logics/architecture/adr_001_identity_and_access_model_for_sharepoint_knowledge_graph.md`
- `logics/architecture/adr_005_explorer_ui_for_sharepoint_navigation.md`
- `logics/architecture/adr_007_local_companion_app_architecture_for_explorer_and_chat.md`
- `logics/architecture/adr_009_permission_aware_retrieval_and_source_filtering.md`
- `logics/architecture/adr_012_local_companion_runtime_for_explorer_and_chat.md`
