## spec_001_deepvault_gordon_teams_channel_experience_and_rollout - DeepVault Gordon Teams channel experience and rollout
> From version: 0.0.2
> Understanding: 92%
> Confidence: 90%
> Related request: `logics/request/req_002_v2_azure_and_teams_foundation.md`

# Overview
`DeepVault - Gordon` is the governed Teams delivery surface for the hosted product.
It must feel like a real enterprise bot, not a generic chat clone, and it must preserve trust, permission checks, and source grounding.
The spec covers message routing, channel behavior, rollout boundaries, and the visible states users and admins need.

# Goals
- Deliver a Teams chatbot that reuses the hosted backend.
- Keep permissions and answer provenance intact in the channel.
- Make the rollout controlled enough for an internal tenant or test channel first.

# Non-goals
- Fake human identities.
- Tenant-wide rollout on day one.
- Rebuilding the local validation surfaces inside Teams.

# Users & use cases
- Employees asking SharePoint-backed questions in Teams.
- Admins validating the bot in a scoped tenant or channel.
- Support staff checking whether the bot routed and answered correctly.

# Scope
- In: bot entry, message routing, governed identity, permission-aware answers, and rollout controls.
- In: simple response formatting, source citations, and deny states when content is not permitted.
- Out: local runtime behavior, explorer UI work, and non-Teams channel packaging.

# Requirements
- The Teams surface must route every question through the hosted backend contract.
- The bot must respect the same permission-aware retrieval model used elsewhere in DeepVault.
- The rollout must support an internal channel or test tenant before broad exposure.
- The experience must show clear success, denied, and failure states.

# Acceptance criteria
- `DeepVault - Gordon` can route messages to the hosted backend and return grounded answers.
- Permission checks prevent unauthorized content from reaching the answer flow.
- The rollout can be limited to a scoped Teams environment before wider deployment.
- The channel behavior remains consistent with the hosted product contract.

# Validation / test plan
- Test the bot in a scoped Teams tenant or internal channel.
- Verify routing, permission denial, and answer rendering end to end.
- Confirm the channel respects the hosted backend contract and source citations.
- Run `python3 logics/skills/logics-doc-linter/scripts/logics_lint.py --require-status`.

# Open questions
- What is the smallest Teams rollout scope that still gives useful production feedback?

# References
- `logics/product/prod_000_sharepoint_knowledge_graph_product_vision.md`
- `logics/product/prod_002_hosted_production_strategy_with_teams_at_the_end.md`
- `logics/backlog/item_004_teams_bot_chat_and_permissions.md`
- `logics/backlog/item_012_teams_bot_channel_and_permissions.md`
- `logics/architecture/adr_004_teams_bot_architecture_for_llm_chat.md`
- `logics/architecture/adr_013_hosted_backend_and_teams_chat_channel.md`
