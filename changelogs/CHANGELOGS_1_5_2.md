# Changelog (`1.5.1 -> 1.5.2`)

Release date: 2026-05-06

## Major Highlights

- DeepVault Nexus 1.5.2 is a focused worker extraction patch over 1.5.1.
- Microsoft Graph file-content downloads now follow redirects, restoring real binary/text retrieval for SharePoint content endpoints that return a download location instead of the file body directly.
- Worker coverage now proves the Graph client is initialized with redirect following before extract-backed export logic consumes downloaded content.

### Worker Extraction

- `GraphClient` now creates its `httpx.Client` with `follow_redirects=True`.
- The live export service can follow Graph `/content` redirects when downloading SharePoint file bodies for extract artifact creation.
- Added a focused worker test that captures the Graph client initialization and verifies downloaded bytes and content type still flow through `get_bytes`.

## Validation and Regression Evidence

- `rtk python3 -m pytest worker/tests/test_live_export_service.py`
- `rtk npm run test -- tests/changelogs.spec.ts`
- `rtk npm run typecheck`
- `rtk npm run lint`
- `rtk npm run build`
- `rtk npm run test`

## Notes

- This release does not change the corpus schema or the browser UI.
- Existing extract artifacts do not need migration; rerunning live export is enough to benefit from redirected content downloads.
