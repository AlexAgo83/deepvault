## adr_006_runtime_configuration_and_operations - Runtime configuration and operations
> Date: 2026-04-12
> Status: Proposed
> Drivers: Keep runtime secrets easy to manage locally, protect secrets, and leave room for future scale and governance.
> Related request: `logics/request/req_000_v0_bootstrap_and_initial_foundations.md`, `logics/request/req_015_architecture_robustness_and_product_improvements.md`
> Related backlog: `logics/backlog/item_005_runtime_config_and_operations.md`, `logics/backlog/item_010_local_sync_status_and_operational_view.md`, `logics/backlog/item_005_v1_runtime_config_and_operations.md`
> Related task: `logics/tasks/task_025_non_v2_delivery_orchestration_and_validation_hardening.md`
> Reminder: Revisit this decision when the pilot site list moves from a developer-managed setup to a user-managed setup. Default to env vars locally and secret-backed config in Azure. Use GitHub Actions for CI/CD, not for scheduled refresh jobs. Reviewed during the 2026-04-12 release/doc sync; browser-local Settings now covers provider keys for local testing.

# Overview
The first version should stay easy to operate.
Pilot sites can live in environment configuration at first.
Secrets should stay out of source control.
As the product grows, the site list and operational controls can move to a more durable store.

```mermaid
flowchart LR
    Current[Simple env config] --> Choice[Operational config model]
    Choice --> Secrets[Secret handling]
    Choice --> Sites[Pilot site list]
    Choice --> Ops[Logs and audit]
```

# Context
The request explicitly requires the pilot site list to be configurable.
The project also needs a clean way to manage API secrets, sync settings, and later operational concerns.
Using a simple, explicit setup first reduces early friction.

# Decision
Keep the first release configuration-driven through environment variables and secret-backed credentials.
Use the environment to define the pilot site list, auth mode, and operational defaults.
Do not hard-code site names or secrets into the application.

# Alternatives considered
- Hard-coded config in the app
- Database-only config from day one
- Secret store only with no visible pilot settings

# Consequences
- Simple pilot onboarding
- Easier local development and debugging
- Later migration will be needed once non-developers manage sites or sync settings

# Migration and rollout
Start with `.env`-based pilot configuration.
Move site management into a database or admin surface only when the operational need is proven.
Keep the current secret model compatible with that future migration.

# Decision defaults
- Local config: environment variables.
- Secrets: secret-backed credentials.
- Pilot site list: config-driven, not hard-coded.
- Future migration: admin UI or durable store only when needed.
- CI/CD: GitHub Actions for build and deployment.
- Scheduled jobs: Azure Functions timer trigger for backend refresh automation.

# References
- `logics/request/req_000_sharepoint_knowledge_graph_kickoff.md`
- `logics/backlog/item_005_runtime_config_and_operations.md`
- `logics/backlog/item_010_local_sync_status_and_operational_view.md`
# Follow-up work
- Define a canonical env schema
- Add config validation on startup
- Plan a future admin/config UI if site management becomes user-facing
- Keep the browser-local provider-key Settings surface aligned with future secret-backed config so local testing stays simple without changing the runtime contract
