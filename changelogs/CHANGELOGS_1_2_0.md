# CHANGELOGS_1_2_0

Release date: 2026-04-15

## DeepVault Nexus 1.2.0

DeepVault Nexus 1.2.0 tightens the product surface, improves corpus enrichment, and makes the operational panels more readable and stable.

### At a glance

- Added creator and last-modified metadata to the live corpus ingest so documents can carry both provenance signals
- Improved document tagging and Bishop refinement hints so generic corpus noise produces fewer vague `AI needs` prompts
- Refined Explorer with separate `Details` and `Excerpt` toggles, clearer file identity cues, and more compact result cells
- Updated Bishop and AI View with overlay-style confidence and need hints, hidden-by-default sources, and cleaner source interactions
- Made Sync history, logs, and durations more compact while preserving persisted job state and cleanup behavior
- Polished the topbar and mobile shell with persistent per-screen toggles, independent right-panel visibility, and a more usable mobile menu
- Added process cleanup wrappers around the heavier scripts to reduce stray Vite and Chrome processes after interrupted runs
- Renamed the public `AI stats` surface to `AI View` and tightened the naming across the shell
- Improved mobile layout behavior so the sidebar becomes a modal, right panels can stack cleanly, and the footer remains visible in the normal page flow
- Split the explorer details surface into more intentional reveal/hide blocks so secondary information stays available without overwhelming the card
- Persisted Sync operation history and bounded streamed logs to keep the UI responsive during long runs

### Why it matters

- The app now exposes more useful provenance for each file without forcing the user to inspect raw SharePoint metadata.
- Explorer, Bishop, and AI View are easier to scan because secondary detail is hidden until needed.
- Long-running operations are easier to trust because the UI is more compact, the logs are bounded, and the shell is less likely to leave orphaned processes behind.
- The shell now behaves better on smaller screens without sacrificing the desktop layout.
- The product vocabulary is more consistent across navigation, status, and inspection surfaces.

### Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run evaluate
npm run e2e
```

### Notes

- `createdBy` and `lastModifiedBy` are filled for documents only after a new export regenerates the corpus.
- `Resume Sync` remains checkpoint-driven; a full export is still the right choice for a retroactive backfill.
- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` stay generated locally and out of Git.
- The changelog intentionally summarizes the major user-facing slices rather than every small layout tweak.
