import { useEffect, useRef, useState } from 'react'
import { CompactPathText, FileLinkIcon, FileTypePill, PathLabel, Pill, SectionHeading } from '../app-ui'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { ExplorerRow } from '../../hooks/useAppModel'
import { t } from '../../i18n'

const EXPLORER_BATCH_SIZE = 10
const EXPLORER_MAX_VISIBLE = 50
const EXPLORER_DETAILS_STORAGE_KEY = 'deepvault_explorer_details_visible'

function readExplorerDetailsVisible(): boolean {
  try {
    return localStorage.getItem(EXPLORER_DETAILS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function ExplorerPanel({
  explorerRows,
  onSelectDocument,
  onExportJson,
  onExportMarkdown,
  resolveFileHref,
  selectedExplorerDoc,
  showRightPanel,
}: {
  explorerRows: ExplorerRow[]
  onSelectDocument: (_document: ExplorerRow) => void
  onExportJson: () => void
  onExportMarkdown: () => void
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
  selectedExplorerDoc: ExplorerRow | null
  showRightPanel: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(EXPLORER_BATCH_SIZE)
  const [showSourceExcerpt, setShowSourceExcerpt] = useState(false)
  const [showDetails, setShowDetails] = useState(() => readExplorerDetailsVisible())
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
  const displayExplorerRows = explorerRows.filter((document) => document.score !== 1)
  const visibleExplorerRows = displayExplorerRows.slice(0, Math.min(visibleCount, EXPLORER_MAX_VISIBLE))
  const hasMoreExplorerRows = displayExplorerRows.length > visibleExplorerRows.length

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

        setVisibleCount((current) =>
          Math.min(EXPLORER_MAX_VISIBLE, displayExplorerRows.length, current + EXPLORER_BATCH_SIZE),
        )
      },
      {
        root: null,
        rootMargin: '120px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [displayExplorerRows.length, hasMoreExplorerRows])

  useEffect(() => {
    setShowSourceExcerpt(false)
  }, [selectedExplorerDoc?.id])

  useEffect(() => {
    try {
      localStorage.setItem(EXPLORER_DETAILS_STORAGE_KEY, String(showDetails))
    } catch {
      // ignore storage failures
    }
  }, [showDetails])

  return (
    <section className={`content-grid explorer-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <article className="panel explorer-list-panel">
        <SectionHeading
          title={t('explorer.title')}
          subtitleTooltip={t('explorer.subtitle')}
          actions={
            <>
              <button type="button" className="secondary-button secondary-button-sm" title={t('explorer.exportJsonTitle')} onClick={onExportJson}>
                {t('explorer.exportJson')}
              </button>
              <button type="button" className="secondary-button secondary-button-sm" title={t('explorer.exportMarkdownTitle')} onClick={onExportMarkdown}>
                {t('explorer.exportMarkdown')}
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
              title={t('explorer.openDocument', { document: document.title })}
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
          {explorerRows.length === 0 ? <div className="empty-state">{t('explorer.noPermittedSources')}</div> : null}
          {explorerRows.length > 0 && displayExplorerRows.length === 0 ? (
            <div className="empty-state">{t('explorer.noStrongMatches')}</div>
          ) : null}
          {hasMoreExplorerRows ? <div ref={loadMoreSentinelRef} className="document-list-sentinel" aria-hidden="true" /> : null}
        </div>
      </article>

      {showRightPanel ? (
        <article id="panel-right" className="panel panel-right explorer-detail-panel">
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
                    <span>{t('explorer.site')}</span>
                    <div className="detail-row-site-value">
                      {selectedExplorerDoc.siteUrl ? (
                        <a
                          className="detail-row-site-button"
                          href={selectedExplorerDoc.siteUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('explorer.openSiteLabel', { site: selectedExplorerDoc.siteName || selectedExplorerDoc.siteId })}
                          title={t('explorer.openSiteLabel', { site: selectedExplorerDoc.siteName || selectedExplorerDoc.siteId })}
                        >
                          <span className="detail-row-site-button-icon" aria-hidden="true">
                            <FileLinkIcon />
                          </span>
                          <span>{t('explorer.openSite')}</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>{t('explorer.owner')}</span>
                    <strong>{selectedExplorerDoc.author}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{t('explorer.updated')}</span>
                    <strong>{formatUpdatedAt(selectedExplorerDoc.updatedAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{t('explorer.access')}</span>
                    <strong>{selectedExplorerDoc.access.join(', ')}</strong>
                  </div>
                  <div className="detail-row">
                    <span>{t('explorer.tags')}</span>
                    <strong className="detail-row-tags">{selectedExplorerDoc.tags.join(', ')}</strong>
                  </div>
                </div>
                <div className="document-content">
                  <div className="document-content-header">
                    <h3>{t('explorer.details')}</h3>
                    <button
                      type="button"
                      className="text-button text-button-sm"
                      onClick={() => setShowDetails((current) => !current)}
                      aria-expanded={showDetails}
                      aria-controls="explorer-details"
                    >
                      {showDetails ? t('explorer.hideDetails') : t('explorer.showDetails')}
                    </button>
                  </div>
                  {showDetails ? (
                    <p id="explorer-details">
                      <CompactPathText
                        value={selectedDirectAnswer || selectedSummary || selectedExplorerDoc.title}
                        href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                      />
                    </p>
                  ) : null}
                </div>
                {hasDistinctSourceExcerpt ? (
                  <div className="document-content">
                    <div className="document-content-header">
                      <h3>{t('explorer.excerpt')}</h3>
                      <button
                        type="button"
                        className="text-button text-button-sm"
                        onClick={() => setShowSourceExcerpt((current) => !current)}
                        aria-expanded={showSourceExcerpt}
                        aria-controls="explorer-source-excerpt"
                      >
                        {showSourceExcerpt ? t('explorer.hideExcerpt') : t('explorer.showExcerpt')}
                      </button>
                    </div>
                    {showSourceExcerpt ? (
                      <p id="explorer-source-excerpt" className="document-content-source">
                        <CompactPathText
                          value={selectedSourceExcerpt}
                          href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                        />
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <SectionHeading
                title={t('explorer.noVisibleDocument')}
                subtitleTooltip={t('explorer.noVisibleDocumentHint')}
              />
              <div className="empty-state">{t('explorer.noSiteSources')}</div>
            </>
          )}
        </article>
      ) : null}
    </section>
  )
}
