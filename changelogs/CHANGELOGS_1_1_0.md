# Changelog (`1.0.0 -> 1.1.0`)

Release date: 2026-04-13

## Major Highlights

- DeepVault Nexus 1.1.0 turns the local app into a clearer product surface.
- The release keeps the app local-first, but makes the shell more intentional, more discoverable, and easier to scan at a glance.
- A getting started modal now appears on app open so the product story is visible immediately.
- Runtime controls move into `Settings`, while `Sync status` stays focused on operational visibility.
- The release-facing README and Logics product and architecture briefs now reflect the current direction.

## Generated Commit Summary

## Onboarding and Shell

- Added a getting started modal on app open.
- Reframed the shell around the public `Nexus` name and a cleaner release-ready header.
- Compacting status, export, and action controls so hover and tooltips carry the supporting detail.

## Settings and Status

- Moved runtime controls into `Settings` so role, provider, and site scope live with configuration.
- Kept `Sync status` focused on operational visibility and added a streamed operations console.
- Added a persistent Bishop conversation-context toggle that defaults to on.

## Documentation

- Updated the release-facing README and Logics product and architecture briefs to reflect the current direction.

## Validation and Regression Evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run evaluate`
- `npm run e2e`

## Notes

- The release remains local-first and does not reintroduce Azure or Teams as the main day-to-day surface.
- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` stay generated locally and out of Git.
