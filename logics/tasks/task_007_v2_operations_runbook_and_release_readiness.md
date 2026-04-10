## task_007_v2_operations_runbook_and_release_readiness - V2 operations runbook and release readiness
> From version: 0.0.2
> Schema version: 1.0
> Status: Ready
> Understanding: 95%
> Confidence: 90%
> Progress: 1%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.

# Context
- Execute the bounded delivery slice for V2 operations runbook and release readiness.
- The work should produce a practical launch guide for Azure, rollback, secrets, monitoring, and release gates.

```mermaid
%% logics-kind: task
%% logics-signature: task|v2-operations-runbook-and-release-readin|item-013-v2-operations-runbook-and-relea|1-confirm-the-v2-readiness-scope|run-python3-logics-skills-logics-doc-lin
stateDiagram-v2
    state "item_013_v2_operations_runbook_and_release" as Backlog
    state "1. Confirm the V2 readiness scope" as Scope
    state "2. Draft the runbook sections for" as Build
    state "3. Add the release readiness checklist" as Verify
    state "Run python3 logics skills logics-doc-linte" as Validation
    state "Done report" as Report
    [*] --> Backlog
    Backlog --> Scope
    Scope --> Build
    Build --> Verify
    Verify --> Validation
    Validation --> Report
    Report --> [*]
```

# Plan
- [ ] 1. Confirm the V2 readiness scope, dependencies, and launch gates.
- [ ] 2. Draft the runbook sections for deploy, rollback, disable, secrets, and smoke checks.
- [ ] 3. Add the release readiness checklist for approvals, monitoring, and incident response.
- [ ] 4. Execute the V1 → V2 data migration according to the plan below.
- [ ] 5. Provision Azure resources according to the manifest below.
- [ ] 6. Link the task back to the backlog, product brief, and ADRs.
- [ ] CHECKPOINT: leave the current wave commit-ready and update the linked Logics docs before continuing.
- [ ] CHECKPOINT: if the shared AI runtime is active and healthy, run `python logics/skills/logics.py flow assist commit-all` for the current step, item, or wave commit checkpoint.
- [ ] GATE: do not close a wave or step until the relevant automated tests and quality checks have been run successfully.
- [ ] FINAL: Update related Logics docs and release checklist artifacts

# V1 → V2 data migration plan

Migration moves derived data from local SQLite and local files to Azure managed services. SharePoint is the source of truth and does not migrate — only derived content, state, and indexes migrate.

## Migration steps

| Step | What migrates | From | To | Notes |
|---|---|---|---|---|
| 1 | Sync state and watermarks | SQLite `sync_state` table | Azure SQL / Postgres `sync_state` table | Schema must be identical. Export as CSV, import via migration script. Validate row counts. |
| 2 | Site configuration | SQLite `sites` table | Azure SQL / Postgres `sites` table | Same schema. Validate all pilot sites are present after import. |
| 3 | Raw content extracts | Local `data/extracts/` files | Azure Blob Storage `deepvault-extracts` container | Upload recursively. Verify blob count matches local file count. |
| 4 | Chunk files | Local `data/chunks/` files | Azure Blob Storage `deepvault-chunks` container | Upload recursively. Verify chunk count per source matches pre-migration figures. |
| 5 | Retrieval index | Local vector index | Azure AI Search index | Re-index from blobs after migration. Do not attempt to migrate the index binary directly. Re-indexing is the safe path. |
| 6 | Audit logs | Local `data/audit/` files | Azure Blob Storage `deepvault-audit` container | Append-only. Upload historical logs. New audit events go directly to Azure from day one of hosted runtime. |
| 7 | Secrets | Local `.env` file | Azure Key Vault | Create secrets in Key Vault manually. Rotate any secret that was in the local `.env` before going live. Never copy `.env` to Azure. |

## Migration validation gates
- Row counts in Azure SQL match SQLite exports within 0 discrepancy.
- Blob counts in Azure match local file counts within 0 discrepancy.
- Re-index run completes without errors and Azure AI Search reports document count within 5% of local index.
- Smoke test: run 5 evaluation queries against the hosted backend and verify answers cite sources from the migrated corpus.
- Secrets: confirm all secrets resolve from Key Vault. Confirm `.env` references are removed from hosted config.

## Rollback plan
If migration validation fails:
1. Keep local V1 runtime running. Do not shut it down until hosted V2 is confirmed stable.
2. Identify which migration step failed from the validation gates.
3. Re-run only the failed step. Do not repeat completed steps unless the schema changed.
4. If Azure AI Search re-index fails, delete the index and re-run ingestion from blobs. This is the known-safe path.

# Azure resource manifest (V2 first slice)

| Resource | Azure service | SKU / tier | Purpose |
|---|---|---|---|
| Compute | Azure Container Apps or App Service | B1 (Basic) for first slice, scale to P1v3 if load warrants | Hosts the backend API and ingestion orchestrator |
| Relational store | Azure SQL Database | General Purpose, 2 vCores, 32 GB | Sync state, site config, checkpoints, operational metadata |
| Blob storage | Azure Blob Storage | LRS, Standard tier | Raw extracts, chunks, audit logs |
| Retrieval index | Azure AI Search | Basic tier (up to 15 indexes, 2 GB) | Vector and hybrid search for retrieval |
| Secrets | Azure Key Vault | Standard tier | All credentials, API keys, Graph client secrets |
| Scheduler | Azure Functions (Consumption plan) | Per-execution billing | Daily sync timer trigger, manual refresh endpoint |
| Monitoring | Azure Monitor + Application Insights | Pay-as-you-go | Structured logs, run traces, availability alerts |
| Identity | Azure Entra ID (existing tenant) | No additional SKU | App registrations for backend and bot |

## Cost control guardrails
- Azure AI Search Basic tier caps storage at 2 GB. Monitor index size weekly. Upgrade to Standard only when the corpus exceeds 1.5 GB.
- Blob storage costs are driven by chunk and extract volume. Set a lifecycle policy to archive chunks older than 180 days to Cool tier.
- LLM token consumption is not billed via Azure — monitor OpenAI and Gemini dashboards directly. Set a monthly spend alert at 80% of the agreed budget.
- Azure Functions Consumption plan is billed per execution. The daily sync trigger costs roughly 30 executions per month for the pilot scope — well within the free tier (1M executions/month).

# Delivery checkpoints
- Each completed wave should leave the repository in a coherent, commit-ready state.
- Update the linked Logics docs during the wave that changes the behavior, not only at final closure.
- Prefer a reviewed commit checkpoint at the end of each meaningful wave instead of accumulating several undocumented partial states.
- If the shared AI runtime is active and healthy, use `python logics/skills/logics.py flow assist commit-all` to prepare the commit checkpoint for each meaningful step, item, or wave.
- Do not mark a wave or step complete until the relevant automated tests and quality checks have been run successfully.

# AC Traceability
- AC1 -> Scope: Draft the runbook sections for deploy, rollback, disable, secrets, and smoke checks.. Proof: capture validation evidence in this doc.
- AC2 -> Scope: Add the release readiness checklist for approvals, monitoring, and incident response.. Proof: capture validation evidence in this doc.
- AC3 -> Scope: Keep the task bounded to the V2 operations slice and link it back to the backlog item.. Proof: capture validation evidence in this doc.

# Decision framing
- Product framing: Not needed
- Product signals: production readiness, supportability, release safety
- Product follow-up: Keep the hosted production brief aligned with the release criteria.
- Architecture framing: Required
- Architecture signals: Azure release process, rollback, secrets, audit boundaries
- Architecture follow-up: Keep the hosted backend and security ADRs synchronized with this task.

# Links
- Product brief(s): `logics/product/prod_002_hosted_production_strategy_with_teams_at_the_end.md`
- Architecture decision(s): `logics/architecture/adr_006_runtime_configuration_and_operations.md`, `logics/architecture/adr_013_hosted_backend_and_teams_chat_channel.md`, `logics/architecture/adr_015_deepvault_security_audit_logging_and_retention_boundaries.md`
- Backlog item: `logics/backlog/item_013_v2_operations_runbook_and_release_readiness.md`
- Request(s): `logics/request/req_000_sharepoint_knowledge_graph_kickoff.md`

# AI Context
- Summary: V2 operations runbook and release readiness task for DeepVault
- Keywords: operations, runbook, release, readiness, rollback, secrets
- Use when: Use when executing the current implementation wave for the V2 launch guide.
- Skip when: Skip when the work belongs to another backlog item or a different execution wave.
# Validation
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.
- Run `python3 logics/skills/logics-relationship-linker/scripts/link_relations.py --out logics/RELATIONSHIPS.md`.
- Run `python3 logics/skills/logics-global-reviewer/scripts/logics_global_review.py --out /tmp/deepvault_global_review.md`.
- Confirm the completed wave leaves the repository in a commit-ready state.

# Definition of Done (DoD)
- [ ] Scope implemented and acceptance criteria covered.
- [ ] Validation commands executed and results captured.
- [ ] No wave or step was closed before the relevant automated tests and quality checks passed.
- [ ] Linked request/backlog/task docs updated during completed waves and at closure.
- [ ] Each completed wave left a commit-ready checkpoint or an explicit exception is documented.
- [ ] Status is `Done` and progress is `100%`.

# Report
