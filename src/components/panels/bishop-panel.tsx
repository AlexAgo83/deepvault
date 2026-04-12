import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Message, SectionHeading, SourceCard } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'

export function BishopPanel({
  clearHistory,
  exportJson,
  exportMarkdown,
  messages,
  question,
  onQuestionChange,
  isAsking,
  onSubmit,
  provider,
  role,
  selectedMessage,
  resolveFileHref,
}: {
  clearHistory: () => void
  exportJson: () => void
  exportMarkdown: () => void
  messages: AppModel['messages']
  question: string
  onQuestionChange: (_value: string) => void
  isAsking: boolean
  onSubmit: (_event: FormEvent<HTMLFormElement>) => void
  provider: string
  role: string
  selectedMessage: AppModel['selectedMessage']
  resolveFileHref: AppModel['resolveFileHref']
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [showTracePreview, setShowTracePreview] = useState(false)

  const updateStickToBottom = () => {
    const node = messageListRef.current
    if (!node) {
      return
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    setStickToBottom(distanceFromBottom <= 24)
  }

  useLayoutEffect(() => {
    const node = messageListRef.current
    if (!node || !stickToBottom) {
      return
    }

    node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight)
  }, [messages, stickToBottom])

  useEffect(() => {
    setShowTracePreview(false)
  }, [selectedMessage.id])

  return (
    <section className="content-grid bishop-grid">
      <article className="panel chat-panel">
        <SectionHeading
          title="Bishop"
          subtitle="Grounded answers come from the same local retrieval logic used by the explorer."
          actions={
            <>
              <button type="button" className="secondary-button" onClick={exportJson}>
                Export JSON
              </button>
              <button type="button" className="secondary-button" onClick={exportMarkdown}>
                Export MD
              </button>
              <button type="button" className="secondary-button" onClick={clearHistory}>
                Clear history
              </button>
            </>
          }
        />
        <div className="message-list" ref={messageListRef} onScroll={updateStickToBottom}>
          {messages.map((message) => (
            <Message key={message.id} message={message} resolveFileHref={resolveFileHref} />
          ))}
        </div>
        <form className="chat-form" onSubmit={onSubmit}>
          <label htmlFor="question">Ask a question</label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            rows={4}
            placeholder="What is the deadline for the compliance audit?"
            disabled={isAsking}
          />
          <div className="chat-form-actions">
            <div className="chat-note">
              Current provider: {provider}. Current role: {role}. No fallback mixing during evaluation.
            </div>
            <button type="submit" className="primary-button" disabled={isAsking}>
              {isAsking ? 'Thinking...' : 'Ask bishop'}
            </button>
          </div>
        </form>
      </article>

      <aside className="panel">
        <SectionHeading title="Answer trace" subtitle="Provenance and retrieval diagnostics for the last turn." />
        <div className="detail-stack">
          <div className="detail-row">
            <span>Status</span>
            <strong>{selectedMessage.status || 'ready'}</strong>
          </div>
          <div className="detail-row">
            <span>Provider</span>
            <strong>{selectedMessage.provider || provider}</strong>
          </div>
          <div className="detail-row">
            <span>Orchestration</span>
            <strong>{selectedMessage.orchestrationMode || 'local'}</strong>
          </div>
          <div className="detail-row">
            <span>Chunk count</span>
            <strong>{selectedMessage.chunkCount || 0}</strong>
          </div>
          <div className="detail-row">
            <span>Token count</span>
            <strong>{selectedMessage.tokenCount || 0}</strong>
          </div>
          <div className="detail-row">
            <span>Latency</span>
            <strong>{selectedMessage.latencyMs || 0} ms</strong>
          </div>
          <div className="detail-row detail-row-action">
            <span>Confidence</span>
            <button
              type="button"
              className="trace-confidence-button"
              onClick={() => setShowTracePreview((value) => !value)}
              aria-expanded={showTracePreview}
              disabled={typeof selectedMessage.confidenceScore !== 'number'}
            >
              {typeof selectedMessage.confidenceScore === 'number' ? `${selectedMessage.confidenceScore}%` : 'n/a'}
            </button>
          </div>
        </div>
        {showTracePreview && selectedMessage.providerTracePreview ? (
          <div className="trace-preview" aria-live="polite">
            {selectedMessage.providerTracePreview}
          </div>
        ) : null}
        <div className="source-list">
          {(selectedMessage.sources || []).map((source) => (
            <SourceCard key={source.id} source={source} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
          ))}
          {!selectedMessage.sources?.length ? (
            <div className="empty-state">No grounded sources yet. Ask Bishop a question to populate this trace.</div>
          ) : null}
        </div>
      </aside>
    </section>
  )
}
