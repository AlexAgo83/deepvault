# Changelog (`1.1.0 -> 1.2.0`)

Release date: 2026-04-15

## Major Highlights

- DeepVault Nexus 1.2.0 tightens the product surface, improves corpus enrichment, and makes the operational panels more readable and stable.
- Live corpus ingest now carries creator and last-modified metadata so documents can preserve more provenance.
- Explorer, Bishop, and AI View get clearer detail toggles, better file identity cues, and more compact result cards.
- The shell and mobile layout are more usable, with persistent per-screen toggles, independent right-panel visibility, and a cleaner mobile menu.
- Heavy scripts now run through cleanup wrappers so interrupted runs are less likely to leave stray Vite or Chrome processes behind.

### Corpus and Provenance

- Added creator and last-modified metadata to live corpus ingest.
- Improved document tagging and Bishop refinement hints so generic corpus noise produces fewer vague `AI needs` prompts.
- Persisted Sync operation history and bounded streamed logs to keep the UI responsive during long runs.

### Explorer and AI View

- Refined Explorer with separate `Details` and `Excerpt` toggles, clearer file identity cues, and more compact result cells.
- Updated Bishop and AI View with overlay-style confidence and need hints, hidden-by-default sources, and cleaner source interactions.
- Renamed the public `AI stats` surface to `AI View` and tightened naming across the shell.

### Shell and Mobile UX

- Polished the topbar and mobile shell with persistent per-screen toggles, independent right-panel visibility, and a more usable mobile menu.
- Improved mobile layout behavior so the sidebar becomes a modal, right panels can stack cleanly, and the footer remains visible in the normal page flow.
- Split the explorer details surface into more intentional reveal and hide blocks so secondary information stays available without overwhelming the card.

### Validation and Tooling

- Added process cleanup wrappers around the heavier scripts to reduce stray Vite and Chrome processes after interrupted runs.

## Notes

- `createdBy` and `lastModifiedBy` are filled for documents only after a new export regenerates the corpus.
- `Resume Sync` remains checkpoint-driven; a full export is still the right choice for a retroactive backfill.
- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` stay generated locally and out of Git.
