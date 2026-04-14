import { useEffect, useRef, useState } from 'react'
import { CompactPathText, FileLinkIcon, FileTypePill, PathLabel, Pill, SectionHeading } from '../app-ui'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { ExplorerRow } from '../../hooks/useAppModel'

const EXPLORER_BATCH_SIZE = 10
const EXPLORER_MAX_VISIBLE = 50

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
  const [visibleCount, setVisibleCount] = useState(EXPLORER_BATCH_SIZE)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const selectedSourceExcerpt = selectedExplorerDoc?.content?.trim() || ''
  const selectedDirectAnswer = selectedExplorerDoc?.directAnswer?.trim() || ''
  const selectedSummary = selectedExplorerDoc?.summary?.trim() || ''
  const hasDistinctSourceExcerpt =
    selectedSourceExcerpt.length > 0 &&
    selectedSourceExcerpt !== selectedDirectAnswer &&
    selectedSourceExcerpt !== selectedSummary &&
    selectedSourceExcerpt !== selectedDirectAnswer.trim() &&
    selectedSourceExcerpt !== selectedSummary.trim() &&
    !/^Source:\s/i.test(selectedSourceExcerpt)
  const visibleExplorerRows = explorerRows.slice(0, Math.min(visibleCount, EXPLORER_MAX_VISIBLE))
  const hasMoreExplorerRows = explorerRows.length > visibleExplorerRows.length

  useEffect(() => {
    setVisibleCount(EXPLORER_BATCH_SIZE)
  }, [explorerRows])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !hasMoreExplorerRows || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) {
          return
        }

        setVisibleCount((current) => Math.min(EXPLORER_MAX_VISIBLE, explorerRows.length, current + EXPLORER_BATCH_SIZE))
      },
      {
        root: null,
        rootMargin: '120px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [explorerRows.length, hasMoreExplorerRows])

  return (
    <section className="content-grid explorer-grid">
      <article className="panel explorer-list-panel">
        <SectionHeading
          title="Explorer"
          subtitleTooltip="Browse the pilot corpus by site, search term, and source details."
          actions={
            <>
              <button type="button" className="secondary-button secondary-button-sm" title="Export the explorer results as JSON" onClick={onExportJson}>
                Export JSON
              </button>
              <button type="button" className="secondary-button secondary-button-sm" title="Export the explorer results as Markdown" onClick={onExportMarkdown}>
                Export MD
              </button>
            </>
          }
        />
        <div className="document-list">
          {visibleExplorerRows.map((document) => (
            <button
              key={document.id}
              type="button"
              className={`document-row ${selectedExplorerDoc?.id === document.id ? 'document-row-active' : ''}`}
              title={`Open ${document.title}`}
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
                <span>{document.author}</span>
                <span>{formatUpdatedAt(document.updatedAt)}</span>
              </div>
            </button>
          ))}
          {explorerRows.length === 0 ? <div className="empty-state">No permitted sources matched this search.</div> : null}
          {explorerRows.length > 0 ? (
            <div className="document-list-footer">
              <span>
                Showing {visibleExplorerRows.length} of {explorerRows.length}
              </span>
              <span>{hasMoreExplorerRows ? 'Scroll to load 10 more' : 'All results loaded'}</span>
            </div>
          ) : null}
          {hasMoreExplorerRows ? <div ref={loadMoreSentinelRef} className="document-list-sentinel" aria-hidden="true" /> : null}
        </div>
      </article>

      <article className="panel explorer-detail-panel">
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
            <div className="explorer-detail-scroll">
              <div className="detail-stack">
                <div className="detail-row detail-row-site-row">
                  <span>Site</span>
                  <div className="detail-row-site-value">
                    {selectedExplorerDoc.siteUrl ? (
                      <a
                        className="detail-row-site-button"
                        href={selectedExplorerDoc.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open site ${selectedExplorerDoc.siteName || selectedExplorerDoc.siteId}`}
                        title={`Open site ${selectedExplorerDoc.siteName || selectedExplorerDoc.siteId}`}
                      >
                        <span className="detail-row-site-button-icon" aria-hidden="true">
                          <FileLinkIcon />
                        </span>
                        <span>Open site</span>
                      </a>
                    ) : null}
                  </div>
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
                  <strong className="detail-row-tags">{selectedExplorerDoc.tags.join(', ')}</strong>
                </div>
              </div>
              <div className="document-content">
                <h3>Answer-ready summary</h3>
                <p>
                  <CompactPathText
                    value={selectedDirectAnswer || selectedSummary || selectedExplorerDoc.title}
                    href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                  />
                </p>
                <h3>Source excerpt</h3>
                {hasDistinctSourceExcerpt ? (
                  <p>
                    <CompactPathText
                      value={selectedSourceExcerpt}
                      href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                    />
                  </p>
                ) : (
                  <div className="document-content-note">
                    This source does not expose a separate body excerpt here, so the summary and source view are the same.
                  </div>
                )}
              </div>
            </div>
          </>
      ) : (
          <>
            <SectionHeading
              title="No visible document"
              subtitleTooltip="Choose a site with matching results to inspect its details."
            />
            <div className="empty-state">No permitted sources match the current site filter.</div>
          </>
        )}
      </article>
    </section>
  )
}
