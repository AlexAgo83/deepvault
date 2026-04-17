import { describe, expect, it } from 'vitest'
import { getChangelogEntries, parseChangelogMarkdown } from '../src/data/changelogs'

describe('changelog helpers', () => {
  it('returns a defensive copy of the changelog entries', () => {
    const first = getChangelogEntries()
    const second = getChangelogEntries()

    expect(first).toHaveLength(4)
    expect(second).toHaveLength(4)
    expect(first).not.toBe(second)

    first.pop()
    expect(getChangelogEntries()).toHaveLength(4)
  })

  it('parses release date, intro, and highlights from markdown', () => {
    const parsed = parseChangelogMarkdown(`
# CHANGELOGS_1_4_0

Release date: 2026-04-17

## DeepVault Nexus 1.4.0

First summary line
continues on the next line.

### At a glance
- Added **coverage** guardrails
- Linked the \`ubuntu\` workflow
Plain text that should not become a highlight

### Details
- This item belongs to a later section
`)

    expect(parsed).toEqual({
      releaseDate: '2026-04-17',
      intro: 'First summary line continues on the next line.',
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
