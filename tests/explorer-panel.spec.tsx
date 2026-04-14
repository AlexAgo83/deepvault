import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExplorerPanel } from '../src/components/panels/explorer-panel'
import type { ExplorerRow } from '../src/hooks/useAppModel'

const explorerRow: ExplorerRow = {
  id: 'delivery-plan',
  siteId: 'pilot-alpha',
  siteName: 'Pilot Site Alpha',
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
    expect(explorerCell).toHaveTextContent('20260127 - CARESOFT - Planning de livraison.xlsx.')
    expect(explorerCell).not.toHaveTextContent(/^Source:/i)
  })
})
