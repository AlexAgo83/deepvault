# CHANGELOGS_1.0.0

Release date: 2026-04-10

## DeepVault Nexus 1.0.0

The first release of DeepVault Nexus lands the local V1 workspace and the live SharePoint export path.

### Highlights

- Local React + TypeScript workspace for `DeepVault - Navy`, `DeepVault - Bishop`, and sync visibility
- Permission-aware retrieval on top of the bundled pilot corpus
- Mock/live corpus switching for browser testing
- SharePoint / Microsoft Graph live export pipeline wired to `.env.local`
- Memory guards and pagination progress logs for large live exports
- Local ingestion and evaluation commands for mock and live corpus files
- Project branding, MIT license, and contribution guide added for the release

### Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run evaluate
npm run e2e
npm run export:live
npm run ingest:live -- --input public/live-corpus.json
npm run evaluate:live -- --input public/live-corpus.json
```

### Notes

- `public/live-corpus.json`, `data/runtime/`, and `data/eval/*.live.json` are generated locally and ignored by Git.
- The live corpus is treated as business content and should remain local unless you deliberately export it elsewhere.
