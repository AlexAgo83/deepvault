import { CompactDateTime, Pill, SectionHeading } from '../app-ui'
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
  const topNeeds = Object.entries(needCounts)
    .map(([hint, count]) => ({ hint, count }))
    .sort((left, right) => right.count - left.count || left.hint.localeCompare(right.hint))
    .slice(0, 5)
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
              recentResponses.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className="sync-card ai-response-card"
                  title={message.improvementHint || message.text}
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
                  <p>{message.text}</p>
                  {message.improvementHint ? (
                    <div className="message-need ai-response-need">
                      <div className="message-need-head">
                        <strong>What would help next</strong>
                      </div>
                      <p>{message.improvementHint}</p>
                    </div>
                  ) : null}
                </button>
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
          <div className="ai-stats-scroll">
            <div className="detail-stack">
              {topNeeds.length ? (
                topNeeds.map(({ hint, count }) => (
                  <div key={hint} className="ai-need-row">
                    <span>{hint}</span>
                    <strong>{count}</strong>
                  </div>
                ))
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
