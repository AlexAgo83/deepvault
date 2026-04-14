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
      />,
    )

    const explorerCell = screen.getByTitle('Open Delivery plan')
    expect(explorerCell).toBeInTheDocument()
    expect(explorerCell).toHaveTextContent('Delivery plan')
    expect(explorerCell).toHaveTextContent('document')
    expect(explorerCell).toHaveTextContent('0.92')
    expect(explorerCell).toHaveTextContent('Operations')
    expect(explorerCell).toHaveTextContent('27 Jan 2026, 11:00')
    expect(explorerCell).not.toHaveTextContent('Source:')
    expect(explorerCell).not.toHaveTextContent('CARESOFT')
    expect(explorerCell).not.toHaveTextContent('Planning de livraison.xlsx')
  })

  it('reveals the source excerpt on demand', async () => {
    const user = userEvent.setup()
    const explorerRowWithExcerpt: ExplorerRow = {
      ...explorerRow,
      content: 'Full source excerpt text with extra context.',
    }

    render(
      <ExplorerPanel
        explorerRows={[explorerRowWithExcerpt]}
        onSelectDocument={vi.fn()}
        onExportJson={vi.fn()}
        onExportMarkdown={vi.fn()}
        resolveFileHref={() => null}
        selectedExplorerDoc={explorerRowWithExcerpt}
      />,
    )

    expect(screen.queryByText('Source excerpt')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show source excerpt' }))
    expect(screen.getByRole('button', { name: 'Hide source excerpt' })).toBeInTheDocument()
    expect(screen.getByText('Full source excerpt text with extra context.')).toBeInTheDocument()
  })
})
