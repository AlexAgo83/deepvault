import { CompactPathText, FileTypePill, PathLabel, Pill, SectionHeading } from '../app-ui'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { ExplorerRow } from '../../hooks/useAppModel'

export function ExplorerPanel({
  explorerRows,
  onSelectDocument,
  onExportJson,
  onExportMarkdown,
  resolveFileHref,
  selectedExplorerDoc,
}: {
  explorerRows: ExplorerRow[]
  onSelectDocument: (_document: ExplorerRow) => void
  onExportJson: () => void
  onExportMarkdown: () => void
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
  selectedExplorerDoc: ExplorerRow | null
}) {
  return (
    <section className="content-grid">
      <article className="panel">
        <SectionHeading
          title="Explorer"
          subtitle="Browse the pilot corpus by site, search term, and source details."
          actions={
            <>
              <button type="button" className="secondary-button" onClick={onExportJson}>
                Export JSON
              </button>
              <button type="button" className="secondary-button" onClick={onExportMarkdown}>
                Export MD
              </button>
            </>
          }
        />
        <div className="document-list">
          {explorerRows.map((document) => (
            <button
              key={document.id}
              type="button"
              className={`document-row ${selectedExplorerDoc?.id === document.id ? 'document-row-active' : ''}`}
              onClick={() => onSelectDocument(document)}
            >
              <div className="document-row-top">
                <div className="document-row-title">
                  <strong>{document.title}</strong>
                  <FileTypePill value={document.kind} />
                </div>
                <Pill tone="neutral">{document.score}</Pill>
              </div>
              <div className="document-row-meta">
                <span>{document.siteName}</span>
                <span>{formatUpdatedAt(document.updatedAt)}</span>
              </div>
              <p>{document.summary}</p>
            </button>
          ))}
          {explorerRows.length === 0 ? <div className="empty-state">No permitted sources matched this search.</div> : null}
        </div>
      </article>

      <article className="panel">
        {selectedExplorerDoc ? (
          <>
            <SectionHeading
              title={selectedExplorerDoc.title}
              subtitle={
                <PathLabel
                  value={selectedExplorerDoc.path}
                  href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                />
              }
            />
            <div className="detail-stack">
              <div className="detail-row">
                <span>Site</span>
                <strong>{selectedExplorerDoc.siteName || selectedExplorerDoc.siteId}</strong>
              </div>
              <div className="detail-row">
                <span>Owner</span>
                <strong>{selectedExplorerDoc.author}</strong>
              </div>
              <div className="detail-row">
                <span>Updated</span>
                <strong>{formatUpdatedAt(selectedExplorerDoc.updatedAt)}</strong>
              </div>
              <div className="detail-row">
                <span>Access</span>
                <strong>{selectedExplorerDoc.access.join(', ')}</strong>
              </div>
              <div className="detail-row">
                <span>Tags</span>
                <strong>{selectedExplorerDoc.tags.join(', ')}</strong>
              </div>
            </div>
            <div className="document-content">
              <h3>Answer-ready summary</h3>
              <p>
                <CompactPathText
                  value={selectedExplorerDoc.directAnswer || selectedExplorerDoc.summary}
                  href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                />
              </p>
              <h3>Source excerpt</h3>
              <p>
                <CompactPathText
                  value={selectedExplorerDoc.content}
                  href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                />
              </p>
            </div>
          </>
        ) : (
          <>
            <SectionHeading
              title="No visible document"
              subtitle="Choose a site with matching results to inspect its details."
            />
            <div className="empty-state">No permitted sources match the current site filter.</div>
          </>
        )}
      </article>
    </section>
  )
}
