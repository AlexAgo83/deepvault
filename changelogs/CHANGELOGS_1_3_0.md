# CHANGELOGS_1_3_0

Release date: 2026-04-16

## DeepVault Nexus 1.3.0

DeepVault Nexus 1.3.0 tightens the operator workflow around `Settings` and `AI View`, while making the local release-validation path much closer to the CI lane.

### At a glance

- Added a top-level section switcher to `Settings` so runtime, SharePoint, AI provider, and worker controls can be changed from one screen without stacking every panel at once
- Compacted the `Settings` layout by removing redundant summary cards and panel titles, and fixed action rows so controls keep their natural height
- Refined `AI View` response cards with visible response identifiers, hidden unnecessary hover text, persisted reveal/hide state across rows, and a pinned `AI needs` donut above the scrollable detail list
- Added per-panel icons to each `Getting started` card so the onboarding modal matches the main navigation language
- Added `npm run ci:local` so lint, typecheck, coverage, build, mock evaluation, Playwright install, and e2e can be reproduced locally in one command
- Removed an obsolete `BishopPanel` prop and aligned the workflow e2e selector with the current `Show` source toggle copy

### Why it matters

- `Settings` now behaves more like a focused control center than a long configuration dump, which reduces scrolling and keeps the active section obvious.
- `AI View` is easier to scan across many responses because the cards retain the same reveal state and surface a concrete response id instead of generic labels.
- Release validation is easier to trust locally because the new CI-style command exercises the same major gates in one pass.

### Validation

```bash
npm run ci:local
```

### Notes

- `npm run ci:local` installs Chromium before the Playwright run so first-run machines can execute the end-to-end suite without a separate setup step.
- The release remains local-first; generated live corpus and runtime artifacts still stay out of Git.
