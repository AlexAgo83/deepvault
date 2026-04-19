# Changelog (`1.4.0 -> 1.5.0`)

Release date: 2026-04-19

## Major Highlights

- DeepVault Nexus 1.5.0 keeps the changelog experience aligned with the new cdx-manager-style release notes.
- The changelog viewer once again collapses the sections that come after `Major Highlights`, making release notes easier to skim.
- The legacy `VERSION` file is gone, so `package.json` is now the single source of truth for the app version.

### Changelog Presentation

- Removed `## Generated Commit Summary` from the generated changelogs and release notes.
- Switched release-note subsections back to `###` so the UI renders them as collapsible blocks.
- Updated the changelog parser and panel tests for the revised markdown structure.

### Versioning

- Dropped the standalone `VERSION` file.
- Kept `package.json` as the canonical version source for release prep.

### Validation and Regression Evidence

- Updated the changelog parser test coverage for the new structure.
- Confirmed the changelog panel still opens and renders nested markdown sections.

## Notes

- This release is a documentation and release-process cleanup rather than a product feature wave.
- GitHub release bodies should be updated from `changelogs/CHANGELOGS_1_5_0.md` after tagging.
