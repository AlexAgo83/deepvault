import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBishopExportHandlers } from '../src/components/panels/bishop-export'
import { buildExplorerExportJson, buildExplorerExportMarkdown, createExplorerExportHandlers } from '../src/components/panels/explorer-export'

vi.mock('../src/lib/file-download', () => ({
  downloadTextFile: vi.fn(),
}))

import { downloadTextFile } from '../src/lib/file-download'

describe('export helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('builds explorer export payloads and dispatches download handlers', () => {
    const rows = [
      {
        id: 'doc-1',
        title: 'Budget',
        siteName: 'Pilot Site Alpha',
        score: 12,
        path: '/Documents/Budget.docx',
        siteId: 'pilot-alpha',
        kind: 'document',
        webUrl: null,
        author: 'Ops',
        updatedAt: '2026-04-10T10:00:00Z',
        summary: 'Budget summary',
        directAnswer: 'Budget summary',
        content: 'Budget summary',
        tags: ['finance'],
        access: ['analyst'],
        source: 'sharepoint',
      },
    ]

    const json = buildExplorerExportJson({
      activeScopeLabel: 'All sites',
      explorerRows: rows,
      search: 'budget',
      selectedExplorerDoc: rows[0],
    })
    const markdown = buildExplorerExportMarkdown({
      activeScopeLabel: 'All sites',
      explorerRows: rows,
      search: 'budget',
      selectedExplorerDoc: rows[0],
    })
    const handlers = createExplorerExportHandlers({
      activeScopeLabel: 'All sites',
      explorerRows: rows,
      search: 'budget',
      selectedExplorerDoc: rows[0],
    })

    expect(json).toContain('Pilot Site Alpha')
    expect(markdown).toContain('Explorer results export')
    handlers.exportJson()
    handlers.exportMarkdown()
    expect(downloadTextFile).toHaveBeenCalledTimes(2)
  })

  it('builds bishop export handlers', () => {
    const handlers = createBishopExportHandlers({
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          text: 'Hello',
          status: 'answered',
          sources: [],
        },
      ],
      question: 'What is the budget?',
    })

    handlers.exportJson()
    handlers.exportMarkdown()
    expect(downloadTextFile).toHaveBeenCalledTimes(2)
  })
})
