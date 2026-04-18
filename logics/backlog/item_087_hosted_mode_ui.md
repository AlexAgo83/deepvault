## item_087_hosted_mode_ui - Hosted mode UI (identity display, Shared label, sign-out, API key inputs hidden)

> From version: 1.3.0
> Schema version: 1.0
> Status: Ready
> Understanding: 95%
> Confidence: 94%
> Progress: 0%
> Complexity: Low
> Theme: Product / UX
> Reminder: Update status, understanding, confidence, progress and linked request/task references when you edit this doc.

# Problem

- In hosted mode, the app must adapt its UI to reflect the authentication context: show the authenticated user's identity, offer a sign-out option, hide API key input fields, and display a subtle indicator that the user is on the shared hosted instance.
- In local dev mode, none of these changes should appear — the UI must be identical to the current local behavior.
- The browser needs to know which mode it is in (`hosted` vs `local`) to render the correct UI — this is provided by `GET /api/config/mode`.

# Scope

- In: read `GET /api/config/mode` at app startup and store the mode in React context; in hosted mode: display the authenticated user's display name or email in the shell top bar or Settings panel; add a sign-out option that clears the MSAL cache and posts a logout to the Microsoft logout endpoint; show a subtle `Shared` label inside the Settings panel; hide API key input fields in Settings (they remain visible in local dev mode); hide Artifacts panel and Sync job control buttons for non-operators; derive operator state from a worker-returned runtime flag rather than inferring it client-side from token contents; in local dev mode: no identity info shown, no sign-out option, no `Shared` label, API key inputs visible as today.
- Out: MSAL token acquisition (item_085); operator allowlist enforcement (item_086); full RBAC UI.

# Acceptance criteria

- AC1: In hosted mode, the authenticated user's display name or email is visible in the Nexus shell (top bar or Settings).
- AC2: In hosted mode, a sign-out option is accessible; clicking it clears the MSAL session and redirects to the Microsoft logout endpoint.
- AC3: The Settings panel shows a subtle `Shared` label in hosted mode and no label in local dev mode.
- AC4: API key input fields are hidden in hosted mode and visible in local dev mode.
- AC5: Team members (non-operators) do not see the Artifacts panel or Sync job control buttons at all; operators see both.
- AC6: In local dev mode (`WORKER_MODE=local`), the UI is identical to the current behavior — no identity info, no sign-out, no `Shared` label.

# Links

- Request: `logics/request/req_020_host_nexus_as_a_shared_multi_user_web_application.md`
- Product brief(s): `logics/product/prod_015_user_authentication_and_access_management.md`, `logics/product/prod_014_host_nexus_as_a_shared_multi_user_web_application.md`
- Architecture decision(s): `logics/architecture/adr_034_nexus_hosted_deployment_topology_and_multi_user_access_model.md`
- Depends on: `item_085_entra_sso_msal_and_worker_token_validation`
- Task(s): `task_043_orchestrate_hosted_auth_access_and_deployment`

# Validation evidence

- Hosted mode: user display name visible in shell; sign-out button present; `Shared` label in Settings; API key inputs hidden
- Hosted mode (team member): Artifacts panel not rendered; Sync job controls not visible
- Hosted mode (operator): Artifacts panel visible; Sync job controls visible
- Local dev mode: no identity info; no sign-out; no `Shared` label; API key inputs visible
- `rtk npm run e2e -- tests/e2e/hosted-mode-ui.spec.ts`
