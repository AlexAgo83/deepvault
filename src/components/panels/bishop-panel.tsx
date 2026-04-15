import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Message, SectionHeading, SourceCard } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'

export function BishopPanel({
  conversationContextEnabled,
  clearHistory,
  exportJson,
  exportMarkdown,
  messages,
  question,
  onConversationContextChange,
  onQuestionChange,
  isAsking,
  onSubmit,
  provider,
  role,
  selectedMessage,
  resolveFileHref,
  showRightPanel = true,
}: {
  conversationContextEnabled: boolean
  clearHistory: () => void
  exportJson: () => void
  exportMarkdown: () => void
  messages: AppModel['messages']
  question: string
  onConversationContextChange: (_value: boolean) => void
  onQuestionChange: (_value: string) => void
  isAsking: boolean
  onSubmit: (_event: FormEvent<HTMLFormElement>) => void
  provider: string
  role: string
  selectedMessage: AppModel['selectedMessage']
  resolveFileHref: AppModel['resolveFileHref']
  showRightPanel?: boolean
}) {
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [showTracePreview, setShowTracePreview] = useState(false)
  const [showNeedPreview, setShowNeedPreview] = useState(false)
  const [showSources, setShowSources] = useState(false)

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

  useEffect(() => {
    setShowNeedPreview(false)
  }, [selectedMessage.id])

  useEffect(() => {
    setShowSources(false)
  }, [selectedMessage.id])

  return (
    <section className={`content-grid bishop-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <article className="panel chat-panel bishop-chat-panel">
        <SectionHeading
          title="Bishop"
          subtitleTooltip="Grounded answers come from the same local retrieval logic used by the explorer."
          actions={
            <>
              <button type="button" className="secondary-button secondary-button-sm" title="Export the current Bishop conversation as JSON" onClick={exportJson}>
                Export JSON
              </button>
              <button type="button" className="secondary-button secondary-button-sm" title="Export the current Bishop conversation as Markdown" onClick={exportMarkdown}>
                Export MD
              </button>
              <button type="button" className="secondary-button secondary-button-sm" title="Clear Bishop conversation history" onClick={clearHistory}>
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
          <div className="chat-form-head">
            <label htmlFor="question">Ask a question</label>
            <label className="chat-context-toggle" title="Keep previous Bishop turns in the prompt">
              <input
                type="checkbox"
                checked={conversationContextEnabled}
                onChange={(event) => onConversationContextChange(event.target.checked)}
              />
              <span>Keep context</span>
            </label>
          </div>
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
            <button type="submit" className="primary-button" title="Send the question to Bishop" disabled={isAsking}>
              {isAsking ? 'Thinking...' : 'Ask bishop'}
            </button>
          </div>
        </form>
      </article>

      {showRightPanel ? (
        <aside id="panel-right" className="panel panel-right bishop-trace-panel">
          <SectionHeading title="Answer trace" subtitle="Provenance and retrieval diagnostics for the last turn." />
          <div className="bishop-trace-scroll">
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
                <div className="trace-confidence-group">
                  <div className="trace-confidence-popover">
                    <button
                      type="button"
                      className="trace-confidence-button"
                      title="Show the trace preview"
                      onMouseEnter={() => setShowTracePreview(true)}
                      onMouseLeave={() => setShowTracePreview(false)}
                      onFocus={() => setShowTracePreview(true)}
                      onBlur={() => setShowTracePreview(false)}
                      aria-describedby={showTracePreview ? 'bishop-trace-preview' : undefined}
                      disabled={typeof selectedMessage.confidenceScore !== 'number'}
                    >
                      {typeof selectedMessage.confidenceScore === 'number' ? `${selectedMessage.confidenceScore}%` : 'n/a'}
                    </button>
                    {showTracePreview && selectedMessage.providerTracePreview ? (
                      <div id="bishop-trace-preview" className="trace-preview trace-preview-popover" role="tooltip" aria-live="polite">
                        {selectedMessage.providerTracePreview}
                      </div>
                    ) : null}
                  </div>
                  <div className="trace-confidence-popover">
                    <button
                      type="button"
                      className="trace-confidence-help"
                      title="Show the improvement hint"
                      onMouseEnter={() => setShowNeedPreview(true)}
                      onMouseLeave={() => setShowNeedPreview(false)}
                      onFocus={() => setShowNeedPreview(true)}
                      onBlur={() => setShowNeedPreview(false)}
                      aria-describedby={showNeedPreview ? 'bishop-need-preview' : undefined}
                      disabled={!selectedMessage.improvementHint}
                      aria-label="Show improvement hint"
                    >
                      ?
                    </button>
                    {showNeedPreview && selectedMessage.improvementHint ? (
                      <div id="bishop-need-preview" className="trace-preview trace-preview-popover" role="tooltip" aria-live="polite">
                        {selectedMessage.improvementHint}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="document-content bishop-sources-section">
              <div className="document-content-header">
                <h3>Details</h3>
                <button
                  type="button"
                  className="text-button text-button-sm"
                  onClick={() => setShowSources((value) => !value)}
                  aria-expanded={showSources}
                  aria-controls="bishop-source-list"
                >
                  {showSources ? 'Hide sources' : 'Show sources'}
                </button>
              </div>
            </div>
            {showSources ? (
              <div id="bishop-source-list" className="source-list">
                {(selectedMessage.sources || []).map((source) => (
                  <SourceCard key={source.id} source={source} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
                ))}
                {!selectedMessage.sources?.length ? (
                  <div className="empty-state">No grounded sources yet. Ask Bishop a question to populate this trace.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}
    </section>
  )
}
