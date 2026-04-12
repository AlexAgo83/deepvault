# CHANGELOGS_1_1_0

Release date: 2026-04-13

## DeepVault Nexus 1.1.0

DeepVault Nexus 1.1.0 turns the local app into a clearer product surface.
The release keeps the app local-first, but makes the shell more intentional, more discoverable, and easier to scan at a glance.

### At a glance

- Added a getting started modal on app open so the product story is visible immediately
- Reframed the shell around the public `Nexus` name and a cleaner release-ready header
- Moved runtime controls into `Settings` so role, provider, and site scope live with configuration
- Kept `Sync status` focused on operational visibility and added a streamed operations console
- Compacting status, export, and action controls so hover and tooltips carry the supporting detail
- Added a persistent Bishop conversation-context toggle that defaults to on
- Updated the release-facing README and Logics product/architecture briefs to reflect the current direction

### Why it matters

- Users can understand the app faster on first launch.
- Configuration and operational monitoring now have separate, obvious homes.
- The release feels like a product rather than an internal workspace while keeping the local validation loop intact.

### Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run evaluate
npm run e2e
```

### Notes

- The release remains local-first and does not reintroduce Azure or Teams as the main day-to-day surface.
- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` stay generated locally and out of Git.
