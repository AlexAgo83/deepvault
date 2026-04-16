import { useEffect, useState } from 'react'
import { CompactDateTime, PathLabel, Pill, SectionHeading } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'

const AI_NEED_CHART_COLORS = ['#b96a43', '#2f6d4c', '#c48a2f', '#6b7b8c', '#8c5a7b', '#5c6bc0']

function getStatusTone(status: string) {
  if (status === 'answered') {
    return 'success'
  }

  if (status === 'no_permitted_sources') {
    return 'danger'
  }

  if (status === 'no_answer') {
    return 'accent'
  }

  return 'neutral'
}

function formatConfidence(value?: number) {
  return typeof value === 'number' ? `${value}%` : 'n/a'
}

function getResponseDisplayId(messageId: string | undefined, index: number) {
  const normalizedId = messageId?.trim()
  if (!normalizedId?.length) {
    return String(index + 1)
  }

  return normalizedId.replace(/-assistant$/i, '')
}

function getPromptForResponse(messages: AppModel['messages'], responseId: string) {
  const responseIndex = messages.findIndex((message) => message.id === responseId)
  if (responseIndex <= 0) {
    return null
  }

  for (let index = responseIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') {
      return message.text
    }
  }

  return null
}

function formatNeedShare(count: number, total: number) {
  if (!total) {
    return '0%'
  }

  return `${Math.round((count / total) * 100)}%`
}

function buildNeedChartSegments(needs: Array<{ hint: string; count: number }>) {
  const total = needs.reduce((sum, need) => sum + need.count, 0)
  let currentAngle = 0

  const segments = needs.map((need, index) => {
    const start = currentAngle
    const end = currentAngle + (total ? (need.count / total) * 360 : 0)
    currentAngle = end

    return {
      ...need,
      color: AI_NEED_CHART_COLORS[index % AI_NEED_CHART_COLORS.length],
      start,
      end,
    }
  })

  const gradient = segments.length
    ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`
    : undefined
  const label = segments.length
    ? `Need distribution: ${segments.map((segment) => `${segment.hint} ${formatNeedShare(segment.count, total)}`).join(', ')}`
    : 'Need distribution unavailable'

  return { segments, total, gradient, label }
}

function AIResponseCard({
  isExpanded,
  message,
  onCollapse,
  onExpand,
  messages,
  responseDisplayId,
  resolveFileHref,
  showSources,
  showNeed,
  onToggleSources,
  onToggleNeed,
}: {
  isExpanded: boolean
  message: AppModel['messages'][number]
  onCollapse: () => void
  onExpand: () => void
  messages: AppModel['messages']
  responseDisplayId: string
  resolveFileHref: AppModel['resolveFileHref']
  showSources: boolean
  showNeed: boolean
  onToggleSources: () => void
  onToggleNeed: () => void
}) {
  const prompt = getPromptForResponse(messages, message.id)
  const sourceCount = message.sources?.length || 0

  return (
    <div
      className={`sync-card ai-response-card ${isExpanded ? 'ai-response-card-expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={prompt || message.improvementHint || message.text}
      aria-expanded={isExpanded}
      onClick={() => onExpand()}
      onFocus={() => {
        if (!isExpanded) {
          onExpand()
        }
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return
        }

        onCollapse()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        if (isExpanded) {
          onCollapse()
          return
        }

        onExpand()
      }}
    >
      <div className="ai-response-head">
        <div className="ai-response-head-copy">
          <strong>
            {message.status === 'answered' ? (
              <>
                <span className="ai-response-id-prefix" aria-hidden="true">#</span>
                <span>{responseDisplayId}</span>
              </>
            ) : (
              message.status
            )}
          </strong>
        </div>
        <div className="ai-response-badges">
          <Pill tone={getStatusTone(message.status)}>{message.status}</Pill>
          <Pill tone="accent">{formatConfidence(message.confidenceScore)}</Pill>
        </div>
      </div>
      <div className="ai-response-meta">
        <span>{message.createdAt ? <CompactDateTime value={message.createdAt} /> : 'recent'}</span>
        {isExpanded ? (
          <div className="ai-response-source-badges" aria-label="Response source metadata">
            <Pill tone="neutral">{message.provider || 'local'}</Pill>
            <Pill tone="neutral">{message.orchestrationMode || 'local'}</Pill>
          </div>
        ) : null}
      </div>
      {prompt ? (
        <div className="ai-response-question">
          <strong>Question</strong>
          <p>{prompt}</p>
        </div>
      ) : null}
      <div className="ai-response-answer">
        <strong>Response</strong>
        <p>{message.text}</p>
      </div>
      {message.sources?.length ? (
        <div className="ai-response-sources">
          <div className="message-sources-header">
            <span>{`Sources (${sourceCount})`}</span>
            <button
              type="button"
              className="text-button text-button-sm"
              onClick={(event) => {
                event.stopPropagation()
                if (!showSources && !isExpanded) {
                  onExpand()
                }
                onToggleSources()
              }}
              aria-label={showSources ? 'Hide sources' : 'Show sources'}
              aria-expanded={showSources}
              aria-controls={`ai-response-sources-${message.id}`}
            >
              {showSources ? 'Hide' : 'Show'}
            </button>
          </div>
          {showSources ? (
            <>
              <div id={`ai-response-sources-${message.id}`} className="message-sources">
                {message.sources.map((source) => (
                  <div key={source.id} className="message-source">
                    <span>{source.siteName}</span>
                    <PathLabel value={source.path} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {message.improvementHint ? (
        <div className="message-need ai-response-need">
          <div className="message-need-head">
            <strong>What would help next</strong>
            <button
              type="button"
              className="text-button text-button-sm"
              onClick={(event) => {
                event.stopPropagation()
                if (!showNeed && !isExpanded) {
                  onExpand()
                }
                onToggleNeed()
              }}
              aria-label={showNeed ? 'Hide what would help next' : 'Show what would help next'}
              aria-expanded={showNeed}
              aria-controls={`ai-response-need-${message.id}`}
            >
              {showNeed ? 'Hide' : 'Show'}
            </button>
          </div>
          {showNeed ? <p id={`ai-response-need-${message.id}`}>{message.improvementHint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export function AIStatsPanel({
  messages,
  resolveFileHref,
  showRightPanel,
}: {
  messages: AppModel['messages']
  resolveFileHref: AppModel['resolveFileHref']
  showRightPanel: boolean
}) {
  const responses = messages.filter(
    (message) => message.role === 'assistant' && message.id !== 'seed' && message.status !== 'draft' && message.status !== 'answering',
  )
  const needCounts = responses.reduce<Record<string, number>>((counts, message) => {
    if (!message.improvementHint) {
      return counts
    }

    const hint = message.improvementHint || ''
    counts[hint] = (counts[hint] || 0) + 1
    return counts
  }, {})
  const sortedNeeds = Object.entries(needCounts)
    .map(([hint, count]) => ({ hint, count }))
    .sort((left, right) => right.count - left.count || left.hint.localeCompare(right.hint))
  const topNeeds = sortedNeeds
    .slice(0, 5)
  const remainingNeedCount = sortedNeeds.slice(5).reduce((sum, need) => sum + need.count, 0)
  const chartNeeds = remainingNeedCount ? [...topNeeds, { hint: 'Other needs', count: remainingNeedCount }] : topNeeds
  const needChart = buildNeedChartSegments(chartNeeds)
  const responseDisplayIds = new Map(responses.map((message, index) => [message.id, getResponseDisplayId(message.id, index)]))
  const recentResponses = [...responses].slice(-5).reverse()
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [showNeed, setShowNeed] = useState(false)

  useEffect(() => {
    if (!expandedResponseId) {
      return
    }

    if (!recentResponses.some((message) => message.id === expandedResponseId)) {
      setExpandedResponseId(null)
    }
  }, [expandedResponseId, recentResponses])

  return (
    <section className={`content-grid ai-stats-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <div className="ai-stats-main-column">
        <article className="panel ai-stats-panel">
          <SectionHeading
            title="AI View"
            subtitleTooltip="Track Bishop responses, confidence, and the context that would make the next answer stronger."
          />

          <div className="ai-response-list">
            {recentResponses.length ? (
              recentResponses.map((message) => (
                <AIResponseCard
                  key={message.id}
                  isExpanded={expandedResponseId === message.id}
                  message={message}
                  onCollapse={() =>
                    setExpandedResponseId((current) => (current === message.id ? null : current))
                  }
                  onExpand={() => setExpandedResponseId(message.id)}
                  messages={messages}
                  responseDisplayId={responseDisplayIds.get(message.id) || getResponseDisplayId(message.id, 0)}
                  resolveFileHref={resolveFileHref}
                  showSources={showSources}
                  showNeed={showNeed}
                  onToggleSources={() => setShowSources((value) => !value)}
                  onToggleNeed={() => setShowNeed((value) => !value)}
                />
              ))
            ) : (
              <div className="empty-state">Ask Bishop a question to populate the response stats.</div>
            )}
          </div>
        </article>
      </div>

      {showRightPanel ? (
        <aside id="panel-right" className="panel panel-right ai-stats-needs-panel">
          <SectionHeading
            title="AI needs"
            subtitleTooltip="Recurring inputs that would have improved the last answers."
          />
          {topNeeds.length ? (
            <>
              <div className="ai-needs-chart-card">
                <div className="ai-needs-chart-shell">
                  <div
                    className="ai-needs-chart"
                    role="img"
                    aria-label={needChart.label}
                    style={needChart.gradient ? { backgroundImage: needChart.gradient } : undefined}
                  >
                    <div className="ai-needs-chart-center">
                      <strong>{needChart.total}</strong>
                      <span>needs</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ai-stats-scroll">
                <div className="detail-stack">
                  {topNeeds.map(({ hint, count }, index) => (
                    <div key={hint} className="ai-need-row">
                      <span className="ai-need-row-copy">
                        <span className="ai-needs-legend-swatch" style={{ backgroundColor: AI_NEED_CHART_COLORS[index % AI_NEED_CHART_COLORS.length] }} aria-hidden="true" />
                        <span>{hint}</span>
                      </span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="ai-stats-scroll">
              <div className="detail-stack">
                <div className="empty-state">No AI needs have been surfaced yet.</div>
              </div>
            </div>
          )}
        </aside>
      ) : null}
    </section>
  )
}
