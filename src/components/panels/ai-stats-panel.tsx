import { CompactDateTime, Pill, SectionHeading } from '../app-ui'
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

export function AIStatsPanel({ messages, showRightPanel }: { messages: AppModel['messages']; showRightPanel: boolean }) {
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
  const recentResponses = [...responses].slice(-5).reverse()

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
              recentResponses.map((message) => {
                const prompt = getPromptForResponse(messages, message.id)

                return (
                  <button
                    key={message.id}
                    type="button"
                    className="sync-card ai-response-card"
                    title={prompt || message.improvementHint || message.text}
                  >
                    <div className="ai-response-head">
                      <div className="ai-response-head-copy">
                        <strong>{message.status === 'answered' ? 'Answered response' : message.status}</strong>
                      </div>
                      <div className="ai-response-badges">
                        <Pill tone={getStatusTone(message.status)}>{message.status}</Pill>
                        <Pill tone="accent">{formatConfidence(message.confidenceScore)}</Pill>
                      </div>
                    </div>
                    <div className="ai-response-meta">
                      <span>{message.createdAt ? <CompactDateTime value={message.createdAt} /> : 'recent'}</span>
                      <div className="ai-response-source-badges" aria-label="Response source metadata">
                        <Pill tone="neutral">{message.provider || 'local'}</Pill>
                        <Pill tone="neutral">{message.orchestrationMode || 'local'}</Pill>
                      </div>
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
                    {message.improvementHint ? (
                      <div className="message-need ai-response-need">
                        <div className="message-need-head">
                          <strong>What would help next</strong>
                        </div>
                        <p>{message.improvementHint}</p>
                      </div>
                    ) : null}
                  </button>
                )
              })
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
          <div className="ai-stats-scroll">
            <div className="detail-stack">
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
                  {topNeeds.map(({ hint, count }, index) => (
                    <div key={hint} className="ai-need-row">
                      <span className="ai-need-row-copy">
                        <span className="ai-needs-legend-swatch" style={{ backgroundColor: AI_NEED_CHART_COLORS[index % AI_NEED_CHART_COLORS.length] }} aria-hidden="true" />
                        <span>{hint}</span>
                      </span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-state">No AI needs have been surfaced yet.</div>
              )}
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  )
}
