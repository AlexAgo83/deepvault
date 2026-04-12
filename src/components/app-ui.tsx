import { useEffect, useState, type ReactNode } from 'react'
import type { ChatMessage, SourceRecord } from '../lib/deepvault'

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

  useEffect(() => {
    setShowTracePreview(false)
  }, [message.id])

  return (
    <article className={`message message-${message.role}`}>
      <div className="message-meta">
        <strong>{message.role === 'assistant' ? 'Bishop' : 'You'}</strong>
        <span>{message.status ? message.status : ''}</span>
        {message.role === 'assistant' && typeof message.confidenceScore === 'number' ? (
          <button
            type="button"
            className="message-confidence-button"
            aria-expanded={showTracePreview}
            onClick={() => setShowTracePreview((value) => !value)}
          >
            {message.confidenceScore}%
          </button>
        ) : null}
      </div>
      <p>{message.text}</p>
      {message.role === 'assistant' && message.improvementHint ? (
        <div className="message-need">
          <strong>What would help next</strong>
          <span>{message.improvementHint}</span>
        </div>
      ) : null}
      {showTracePreview && message.providerTracePreview ? <div className="message-trace-preview">{message.providerTracePreview}</div> : null}
      {message.sources?.length ? (
        <div className="message-sources">
          {message.sources.map((source) => (
            <div key={source.id} className="message-source">
              <strong>{source.title}</strong>
              <PathLabel value={source.path} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
