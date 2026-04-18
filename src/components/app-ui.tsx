import { useEffect, useState, type ReactNode } from 'react'
import type { ChatMessage, SourceRecord } from '../lib/runtime-types'
import { downloadTextFile } from '../lib/file-download'

export type PillTone = 'neutral' | 'accent' | 'success' | 'danger'

export function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: PillTone
  title?: string
}) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {children}
    </span>
  )
}

function formatInlinePath(value: string): string {
  const cleaned = value.replace(/\/+$/, '')
  const segments = cleaned.split('/').filter(Boolean)
  return segments[segments.length - 1] || value
}

export function PathLabel({ value, href }: { value: string; href?: string | null }) {
  const displayValue = formatInlinePath(value)

  if (href) {
    return (
      <a className="path-inline path-inline-link" title={`Open file in SharePoint: ${value}`} href={href} target="_blank" rel="noreferrer">
        <span className="path-inline-icon" aria-hidden="true">
          <FileLinkIcon />
        </span>
        {displayValue}
      </a>
    )
  }

  const copyPath = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    }
  }

  return (
    <button
      type="button"
      className="path-inline"
      title={value}
      aria-label={`Copy full path ${value}`}
      onClick={() => {
        void copyPath()
      }}
    >
      {displayValue}
    </button>
  )
}

export function FileLinkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6.25 2.75h3.1l2.4 2.4v5.35c0 .41-.34.75-.75.75h-4.75a.75.75 0 0 1-.75-.75V3.5c0-.41.34-.75.75-.75Z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="M9.35 2.75v2.4h2.4" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="M5.5 9.75c.35-.56.9-.95 1.55-1.1.75-.18 1.53.05 2.06.58l.4.4c.53.53.76 1.31.58 2.06-.15.65-.54 1.2-1.1 1.55" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  )
}

export function CompactPathText({ value, href }: { value: string; href?: string | null }) {
  const marker = 'Path:'
  const markerIndex = value.indexOf(marker)

  if (markerIndex < 0) {
    return <>{value}</>
  }

  const prefix = value.slice(0, markerIndex + marker.length)
  const pathText = value.slice(markerIndex + marker.length).trim().replace(/[.]+$/, '')

  return (
    <>
      {prefix}{' '}
      <PathLabel value={pathText} href={href} />
    </>
  )
}

export function CompactDateTime({ value }: { value: string }) {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

  return (
    <span className="stat-datetime">
      <span>{date}</span>
      <span>{time}</span>
    </span>
  )
}

export function StatCard({
  label,
  value,
  note,
  valueClassName,
}: {
  label: string
  value: ReactNode
  note: string
  valueClassName?: string
}) {
  return (
    <article className="stat-card" title={note}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${valueClassName || ''}`.trim()}>{value}</div>
    </article>
  )
}

export function SectionHeading({
  title,
  subtitle,
  subtitleTooltip,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  subtitleTooltip?: string
  actions?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2 title={subtitleTooltip}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-heading-actions">{actions}</div> : null}
    </div>
  )
}

export function FileTypePill({ value }: { value: string }) {
  return <span className="file-type-pill">{value}</span>
}

export function SourceCard({
  source,
  href,
}: {
  source: SourceRecord
  href?: string | null
}) {
  return (
    <article className="source-card">
      <div className="source-card-top">
        <strong>{source.title}</strong>
        <Pill tone="accent">{String(source.score)}</Pill>
      </div>
      <div className="source-meta">
        <span>{source.siteName}</span>
        <span>{source.author}</span>
        <span>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.updatedAt))}</span>
      </div>
      <p>{source.snippet}</p>
      <div className="source-path">
        <PathLabel value={source.path} href={href} />
      </div>
    </article>
  )
}

export function Message({
  message,
  resolveFileHref,
}: {
  message: ChatMessage
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
}) {
  const [showTracePreview, setShowTracePreview] = useState(false)
  const [showNeedPreview, setShowNeedPreview] = useState(false)
  const [showSources, setShowSources] = useState(false)

  useEffect(() => {
    setShowTracePreview(false)
  }, [message.id])

  useEffect(() => {
    setShowNeedPreview(false)
  }, [message.id])

  useEffect(() => {
    setShowSources(false)
  }, [message.id])

  const sourceCount = message.sources?.length || 0
  const handleArtifactDownload = () => {
    if (!message.artifact) {
      return
    }
    downloadTextFile(message.artifact.filename, message.artifact.content, message.artifact.mimeType)
  }

  return (
    <article className={`message message-${message.role}`}>
      <div className="message-meta">
        <strong>{message.role === 'assistant' ? 'Bishop' : 'You'}</strong>
        <span>{message.status ? message.status : ''}</span>
        {message.role === 'assistant' && (message.artifact || typeof message.confidenceScore === 'number' || message.improvementHint) ? (
          <div className="message-meta-actions">
            {message.artifact ? (
              <button
                type="button"
                className="secondary-button secondary-button-sm message-download-button"
                title={`Download ${message.artifact.filename}`}
                onClick={handleArtifactDownload}
              >
                Download
              </button>
            ) : null}
            {typeof message.confidenceScore === 'number' ? (
              <div className="message-confidence-popover">
                <button
                  type="button"
                  className="message-confidence-button"
                  aria-describedby={showTracePreview ? `message-trace-preview-${message.id}` : undefined}
                  onMouseEnter={() => setShowTracePreview(true)}
                  onMouseLeave={() => setShowTracePreview(false)}
                  onFocus={() => setShowTracePreview(true)}
                  onBlur={() => setShowTracePreview(false)}
                >
                  {message.confidenceScore}%
                </button>
                {showTracePreview && message.providerTracePreview ? (
                  <div
                    id={`message-trace-preview-${message.id}`}
                    className="message-trace-preview message-trace-preview-popover"
                    role="tooltip"
                    aria-live="polite"
                  >
                    {message.providerTracePreview}
                  </div>
                ) : null}
              </div>
            ) : null}
            {message.improvementHint ? (
              <div className="message-confidence-popover">
                <button
                  type="button"
                  className="message-need-help"
                  aria-describedby={showNeedPreview ? `message-need-preview-${message.id}` : undefined}
                  onMouseEnter={() => setShowNeedPreview(true)}
                  onMouseLeave={() => setShowNeedPreview(false)}
                  onFocus={() => setShowNeedPreview(true)}
                  onBlur={() => setShowNeedPreview(false)}
                  aria-label="Show improvement hint"
                  title="Show improvement hint"
                >
                  ?
                </button>
                {showNeedPreview ? (
                  <div
                    id={`message-need-preview-${message.id}`}
                    className="message-trace-preview message-trace-preview-popover"
                    role="tooltip"
                    aria-live="polite"
                  >
                    {message.improvementHint}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <p>{message.text}</p>
      {message.role === 'assistant' && message.artifactNotice ? <p className="message-artifact-note">{message.artifactNotice}</p> : null}
      {message.sources?.length ? (
        <div className="message-sources-block">
          {showSources ? (
            <>
              <div className="message-sources-header">
                <span>{`Sources (${sourceCount})`}</span>
                <button
                  type="button"
                  className="text-button text-button-sm"
                  onClick={() => setShowSources((value) => !value)}
                  aria-expanded={showSources}
                  aria-controls={`message-sources-${message.id}`}
                >
                  Hide
                </button>
              </div>
              <div id={`message-sources-${message.id}`} className="message-sources">
                {message.sources.map((source) => (
                  <div key={source.id} className="message-source">
                    <span>{source.siteName}</span>
                    <PathLabel value={source.path} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="message-sources-toggle-closed">
              <button
                type="button"
                className="text-button text-button-sm"
                onClick={() => setShowSources((value) => !value)}
                aria-expanded={showSources}
                aria-controls={`message-sources-${message.id}`}
              >
                Show
              </button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}
