## adr_015_deepvault_security_audit_logging_and_retention_boundaries - DeepVault security audit logging and retention boundaries
> Date: 2026-04-10
> Status: Proposed
> Drivers: Preserve trust and debuggability without leaking secrets, personal data, or unnecessary content into logs and traces.
> Related request: `logics/request/req_001_v1_local_hardening_and_scope_evolution.md`
> Related backlog: `logics/backlog/item_005_v1_runtime_config_and_operations.md`, `logics/backlog/item_010_v1_local_sync_status_and_operational_view.md`
> Related task: (none in current repo scope)
> Reminder: Keep audit boundaries, retention policy, and redaction rules aligned across the local and hosted runtimes. Reviewed during the 2026-04-10 release/doc sync.

# Overview
DeepVault needs a clear boundary between debug logging, durable audit, and user-visible provenance.
The product should explain what happened without exposing secrets, raw tokens, or unnecessary personal data.
Audit data should be useful in both the local and hosted runtimes, but the retention policy can differ by environment.

```mermaid
flowchart LR
    Current[Loose logging boundaries] --> Decision[Audit and retention policy]
    Decision --> App[User visible provenance]
    Decision --> Data[Log schema and redaction]
    Decision --> Ops[Retention and access control]
    Decision --> Team[Support and incident review]
```

# Context
The product needs enough observability to debug ingestion, retrieval, and chat behavior.
At the same time, logs must not become a second content store for secrets or sensitive SharePoint material.
Teams, Azure, and local validation all introduce different visibility needs, so the boundary has to be explicit.

# Decision
Keep a minimal audit trail with:
- request and answer identifiers
- source identifiers and retrieval decisions
- permission outcome and channel context
- timestamps, environment, and runtime version

Keep secrets, raw tokens, and unnecessary raw content out of standard logs.
Keep debug logs separate from durable audit records.
Use shorter retention for local debug output and longer, governed retention for hosted audit data.

# Alternatives considered
- Log everything verbatim
- Keep no durable audit trail
- Rely only on user-visible traces

# Consequences
- Debugging stays possible without exposing more data than needed.
- The team must maintain a clear redaction and retention policy.
- Incident analysis becomes more structured and easier to audit.

# Migration and rollout
- Start with the current local runtime and hosted backend logs.
- Add durable audit storage and retention rules when the hosted runtime is ready.
- Make user-visible provenance a subset of the durable audit model rather than a separate ad hoc path.

# References
- `logics/request/req_000_v0_bootstrap_and_initial_foundations.md`
- `logics/backlog/item_005_v1_runtime_config_and_operations.md`
- `logics/backlog/item_010_v1_local_sync_status_and_operational_view.md`
# Follow-up work
- Define the audit event schema and redaction rules.
- Decide which records are user visible versus backend only.
- Add environment-specific retention defaults for local and hosted runtimes.
