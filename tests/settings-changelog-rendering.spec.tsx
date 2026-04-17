import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type MockEntry = {
  fileName: string
  load: () => Promise<string>
  title: string
  version: string
}

const changelogMocks = vi.hoisted(() => ({
  mockEntries: [] as MockEntry[],
  parseChangelogMarkdownMock: vi.fn(),
}))

vi.mock('../src/data/changelogs', () => ({
  getChangelogEntries: () => [...changelogMocks.mockEntries],
  parseChangelogMarkdown: changelogMocks.parseChangelogMarkdownMock,
}))

import { SettingsChangelogPanel } from '../src/components/panels/settings-changelog-panel'

describe('SettingsChangelogPanel markdown rendering', () => {
  afterEach(() => {
    changelogMocks.mockEntries.length = 0
    changelogMocks.parseChangelogMarkdownMock.mockReset()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads immediately without IntersectionObserver and renders rich markdown content', async () => {
    changelogMocks.mockEntries.push({
      version: '9.9.9',
      title: 'DeepVault Nexus 9.9.9',
      fileName: 'CHANGELOGS_9_9_9.md',
      load: vi.fn().mockResolvedValue(`## DeepVault Nexus 9.9.9

# Overview

Paragraph with **bold** text, *italic* text, \`inline code\`, and [docs](https://example.com/docs).

## Secondary heading

> Important quoted note

\`\`\`txt
line one
line two
\`\`\`

### Details

- First item
- Second item

#### Fine print

Closing paragraph.
`),
    })
    changelogMocks.parseChangelogMarkdownMock.mockReturnValue({
      releaseDate: '2026-04-17',
      intro: 'Overview',
      highlights: [],
    })

    vi.stubGlobal('IntersectionObserver', undefined)

    render(<SettingsChangelogPanel />)

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Secondary heading' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fine print' })).toBeInTheDocument()
    expect(screen.getByText('Important quoted note')).toBeInTheDocument()
    expect(screen.getByText('inline code')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com/docs')

    const detailsSummary = screen.getByText('Details')
    const details = detailsSummary.closest('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(detailsSummary)

    expect(details).toHaveAttribute('open')
    expect(within(details as HTMLElement).getByText('First item')).toBeInTheDocument()
    expect(within(details as HTMLElement).getByText('Second item')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/line one/)).toBeInTheDocument()
    })
  })
})
