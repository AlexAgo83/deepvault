import { describe, expect, it } from 'vitest'
import { getChangelogEntries, parseChangelogMarkdown } from '../src/data/changelogs'

describe('changelog helpers', () => {
  it('returns a defensive copy of the changelog entries', () => {
    const first = getChangelogEntries()
    const second = getChangelogEntries()

    expect(first).toHaveLength(5)
    expect(second).toHaveLength(5)
    expect(first).not.toBe(second)
    expect(first[0]?.version).toBe('1.4.0')

    first.pop()
    expect(getChangelogEntries()).toHaveLength(5)
  })

  it('parses release date, intro, and highlights from markdown', () => {
    const parsed = parseChangelogMarkdown(`
# Changelog (\`1.3.0 -> 1.4.0\`)

Release date: 2026-04-17

## Major Highlights
- Added **coverage** guardrails
- Linked the \`ubuntu\` workflow
Plain text that should not become a highlight

## Validation and Regression Evidence
- This item belongs to a later section
`)

    expect(parsed).toEqual({
      releaseDate: '2026-04-17',
      intro: 'Added **coverage** guardrails',
      highlights: ['Added **coverage** guardrails', 'Linked the `ubuntu` workflow'],
    })
  })

  it('returns empty values when markdown omits the expected sections', () => {
    const parsed = parseChangelogMarkdown(`
Release date:

Standalone paragraph without a matching release heading.
`)

    expect(parsed).toEqual({
      releaseDate: null,
      intro: '',
      highlights: [],
    })
  })
})
