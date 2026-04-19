# Changelog (`1.2.0 -> 1.3.0`)

Release date: 2026-04-16

## Major Highlights

- DeepVault Nexus 1.3.0 tightens the operator workflow around `Settings` and `AI View` while making the local release-validation path much closer to the CI lane.
- Settings now has a top-level section switcher so runtime, SharePoint, AI provider, and worker controls live in one place without stacking every panel at once.
- AI View response cards are more usable with visible response identifiers, hidden unnecessary hover text, persisted reveal state, and a pinned `AI needs` donut.
- Getting started cards now carry per-panel icons so the onboarding modal matches the main navigation language.
- The release adds `npm run ci:local` so lint, typecheck, coverage, build, evaluation, Playwright install, and e2e can be reproduced locally in one command.

### Settings and Shell

- Compacted the `Settings` layout by removing redundant summary cards and panel titles.
- Fixed action rows so controls keep their natural height.
- Added a top-level section switcher so the shell behaves more like a focused control surface.

### AI View

- Refined response cards with visible response identifiers and hidden unnecessary hover text.
- Persisted reveal and hide state across rows.
- Added a pinned `AI needs` donut above the scrollable detail list.

### Validation and Tooling

- Added `npm run ci:local` so the local validation path mirrors the CI lane more closely.
- Removed an obsolete `BishopPanel` prop.
- Aligned the workflow e2e selector with the current `Show` source toggle copy.

## Notes

- `npm run ci:local` installs Chromium before the Playwright run so first-run machines can execute e2e without a separate setup step.
- The release remains local-first; generated live corpus and runtime artifacts still stay out of Git.
