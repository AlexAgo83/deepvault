import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExplorerPanel } from '../src/components/panels/explorer-panel'
import type { ExplorerRow } from '../src/hooks/useAppModel'

const explorerRow: ExplorerRow = {
  id: 'delivery-plan',
  siteId: 'pilot-alpha',
  siteName: 'Pilot Site Alpha',
  siteUrl: 'https://example.sharepoint.com/sites/pilot-alpha',
  kind: 'document',
  title: 'Delivery plan',
  path: '/Shared Documents/Delivery plan.xlsx',
  author: 'Operations',
  updatedAt: '2026-01-27T10:00:00.000Z',
  summary: 'Source: 20260127 - CARESOFT - Planning de livraison.xlsx.',
  directAnswer: 'Planning de livraison',
  content: 'Planning de livraison',
  tags: ['planning'],
  access: ['analyst'],
  source: 'SharePoint',
  score: 0.92,
  webUrl: 'https://example.sharepoint.com/sites/pilot-alpha/Shared%20Documents/Delivery%20plan.xlsx',
}

describe('ExplorerPanel', () => {
  it('removes the Source label from explorer cell text', () => {
    render(
      <ExplorerPanel
        explorerRows={[explorerRow]}
        onSelectDocument={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        resolveFileHref={() => null}
        selectedExplorerDoc={explorerRow}
        showRightPanel={true}
      />,
    )

    const explorerCell = screen.getByTitle('Open Delivery plan')
    expect(explorerCell).toBeInTheDocument()
    expect(explorerCell).toHaveTextContent('Delivery plan')
    expect(explorerCell).toHaveTextContent('document')
    expect(explorerCell).toHaveTextContent('0.92')
    expect(explorerCell).toHaveTextContent('Operations')
    expect(explorerCell).toHaveTextContent('27 Jan 2026')
    expect(explorerCell).not.toHaveTextContent('Source:')
    expect(explorerCell).not.toHaveTextContent('CARESOFT')
    expect(explorerCell).not.toHaveTextContent('Planning de livraison.xlsx')
  })

  it('hides rows scored at 1 and shows an empty state when nothing remains', () => {
    render(
      <ExplorerPanel
        explorerRows={[
          {
            ...explorerRow,
            id: 'low-score',
            title: 'Low score document',
            score: 1,
          },
        ]}
        onSelectDocument={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        resolveFileHref={() => null}
        selectedExplorerDoc={null}
        showRightPanel={true}
      />,
    )

    expect(screen.queryByTitle('Open Low score document')).not.toBeInTheDocument()
    expect(screen.getByText('No strong matches found.')).toBeInTheDocument()
  })

  it('reveals the excerpt and details on demand', async () => {
    const user = userEvent.setup()
    const explorerRowWithExcerpt: ExplorerRow = {
      ...explorerRow,
      content: 'Full source excerpt text with extra context.',
      directAnswer: 'Compact answer summary',
      summary: 'Compact answer summary',
    }

    const { unmount } = render(
      <ExplorerPanel
        explorerRows={[explorerRowWithExcerpt]}
        onSelectDocument={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        resolveFileHref={() => null}
        selectedExplorerDoc={explorerRowWithExcerpt}
        showRightPanel={true}
      />,
    )

    expect(screen.queryByText('Excerpt')).toBeInTheDocument()
    expect(screen.queryByText('Details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show excerpt' }))
    expect(screen.getByRole('button', { name: 'Hide excerpt' })).toBeInTheDocument()
    expect(screen.getByText('Full source excerpt text with extra context.')).toBeInTheDocument()
    expect(screen.queryByText('Compact answer summary')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
    expect(screen.getByText('Compact answer summary')).toBeInTheDocument()

    unmount()

    render(
      <ExplorerPanel
        explorerRows={[explorerRowWithExcerpt]}
        onSelectDocument={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        resolveFileHref={() => null}
        selectedExplorerDoc={explorerRowWithExcerpt}
        showRightPanel={true}
      />,
    )

    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
  })
})
