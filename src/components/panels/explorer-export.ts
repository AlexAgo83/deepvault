import { downloadTextFile } from '../../lib/file-download'
import type { ExplorerRow } from '../../hooks/useAppModel'

export function buildExplorerExportJson({
  activeScopeLabel,
  explorerRows,
  search,
  selectedExplorerDoc,
}: {
  activeScopeLabel: string
  explorerRows: ExplorerRow[]
  search: string
  selectedExplorerDoc: ExplorerRow | null
}) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      activeScopeLabel,
      search,
      selectedDocumentId: selectedExplorerDoc?.id || null,
      results: explorerRows,
    },
    null,
    2,
  )
}

export function buildExplorerExportMarkdown({
  activeScopeLabel,
  explorerRows,
  search,
  selectedExplorerDoc,
}: {
  activeScopeLabel: string
  explorerRows: ExplorerRow[]
  search: string
  selectedExplorerDoc: ExplorerRow | null
}) {
  return [
    '# Explorer results export',
    '',
    `Exported at ${new Date().toISOString()}`,
    `Scope: ${activeScopeLabel}`,
    `Search: ${search || 'all sources'}`,
    `Selected document: ${selectedExplorerDoc?.title || 'none'}`,
    '',
    '## Results',
    ...explorerRows.map((row) => `- ${row.title} | ${row.siteName} | score ${row.score} | ${row.path}`),
  ].join('\n')
}

export function createExplorerExportHandlers({
  activeScopeLabel,
  explorerRows,
  search,
  selectedExplorerDoc,
}: {
  activeScopeLabel: string
  explorerRows: ExplorerRow[]
  search: string
  selectedExplorerDoc: ExplorerRow | null
}) {
  return {
    exportJson: () =>
      downloadTextFile(
        `deepvault-explorer-${new Date().toISOString().slice(0, 10)}.json`,
        buildExplorerExportJson({ activeScopeLabel, explorerRows, search, selectedExplorerDoc }),
        'application/json',
      ),
    exportMarkdown: () =>
      downloadTextFile(
        `deepvault-explorer-${new Date().toISOString().slice(0, 10)}.md`,
        buildExplorerExportMarkdown({ activeScopeLabel, explorerRows, search, selectedExplorerDoc }),
        'text/markdown',
      ),
  }
}
