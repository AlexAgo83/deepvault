import { CompactDateTime, Pill, SectionHeading, StatCard } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'

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

export function AIStatsPanel({ messages }: { messages: AppModel['messages'] }) {
  const responses = messages.filter(
    (message) => message.role === 'assistant' && message.id !== 'seed' && message.status !== 'draft' && message.status !== 'answering',
  )
  const confidenceValues = responses.map((message) => message.confidenceScore).filter((value): value is number => typeof value === 'number')
  const confidenceAverage = confidenceValues.length
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : null
  const answeredCount = responses.filter((message) => message.status === 'answered').length
  const needHints = responses.filter((message) => Boolean(message.improvementHint))
  const needCounts = needHints.reduce<Record<string, number>>((counts, message) => {
    const hint = message.improvementHint || ''
    counts[hint] = (counts[hint] || 0) + 1
    return counts
  }, {})
  const topNeeds = Object.entries(needCounts)
    .map(([hint, count]) => ({ hint, count }))
    .sort((left, right) => right.count - left.count || left.hint.localeCompare(right.hint))
    .slice(0, 5)
  const recentResponses = [...responses].slice(-5).reverse()

  return (
    <section className="content-grid ai-stats-grid">
      <div className="ai-stats-main-column">
        <article className="panel ai-stats-panel">
          <SectionHeading
            title="AI stats"
            subtitleTooltip="Track Bishop responses, confidence, and the context that would make the next answer stronger."
          />

          <div className="kpi-grid compact">
            <StatCard label="Responses" value={responses.length} note="Completed Bishop responses in the current session." />
            <StatCard label="Answered" value={answeredCount} note="Responses that were grounded enough to answer." />
            <StatCard
              label="Avg confidence"
              value={confidenceAverage === null ? 'n/a' : `${confidenceAverage}%`}
              note="Average confidence across completed responses with a numeric score."
            />
            <StatCard label="Need hints" value={needHints.length} note="Responses that surfaced a brief hint about better input." />
          </div>

          <div className="ai-response-list">
            {recentResponses.length ? (
              recentResponses.map((message) => (
                <article key={message.id} className="sync-card ai-response-card" title={message.improvementHint || message.text}>
                  <div className="source-card-top">
                    <strong>{message.status === 'answered' ? 'Answered response' : message.status}</strong>
                    <div className="ai-response-badges">
                      <Pill tone={getStatusTone(message.status)}>{message.status}</Pill>
                      <Pill tone="accent">{formatConfidence(message.confidenceScore)}</Pill>
                    </div>
                  </div>
                  <div className="source-meta">
                    <span>{message.createdAt ? <CompactDateTime value={message.createdAt} /> : 'recent'}</span>
                    <span>{message.provider || 'local'}</span>
                    <span>{message.orchestrationMode || 'local'}</span>
                  </div>
                  <p>{message.text}</p>
                  {message.improvementHint ? (
                    <div className="message-need ai-response-need">
                      <strong>What would help next</strong>
                      <span>{message.improvementHint}</span>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-state">Ask Bishop a question to populate the response stats.</div>
            )}
          </div>
        </article>
      </div>

      <aside className="panel">
        <SectionHeading
          title="AI needs"
          subtitleTooltip="Recurring inputs that would have improved the last answers."
        />
        <div className="detail-stack">
          {topNeeds.length ? (
            topNeeds.map(({ hint, count }) => (
              <div key={hint} className="detail-row ai-need-row">
                <span>{hint}</span>
                <strong>{count}</strong>
              </div>
            ))
          ) : (
            <div className="empty-state">No AI needs have been surfaced yet.</div>
          )}
        </div>
      </aside>
    </section>
  )
}
