import { useEffect, useRef, useState } from 'react'
import { CompactDateTime, PathLabel, Pill, SectionHeading, StatCard } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'
import { t } from '../../i18n'

type AIViewSection = 'answered' | 'tokens'
type TokensView = 'trend' | 'timeline'

const AI_NEED_CHART_COLORS = ['#b96a43', '#2f6d4c', '#c48a2f', '#6b7b8c', '#8c5a7b', '#5c6bc0']

function AnsweredIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 6.5h9.5v5.75h-6l-2.5 2v-2h-1a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M7.5 8.75h5M7.5 10.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function TokensIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 15.25V9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 15.25V5.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 15.25V11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 15.25h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function TrendViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="3.5" y="11" width="3" height="5.5" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="8.5" y="7.5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="13.5" y="4.5" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function TimelineViewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 13.5 L7 9 L11 11.5 L16 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13.5 L7 9 L11 11.5 L16 5.5 L16 16.5 L3 16.5 Z" fill="currentColor" opacity="0.2" />
    </svg>
  )
}

function TokensTimelineGraph({ items, gradientId, ariaLabel }: { items: Array<{ label: string; total: number }>; gradientId: string; ariaLabel: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') {
      return
    }

    const updateWidth = () => {
      setWidth((current) => {
        const next = Math.round(node.getBoundingClientRect().width)
        return current === next ? current : next
      })
    }

    updateWidth()

    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const max = Math.max(...items.map((d) => d.total), 1)
  const W = Math.max(width, 280)
  const H = 160
  const padTop = 12
  const padBottom = 28
  const padH = 10
  const innerW = W - padH * 2
  const innerH = H - padTop - padBottom
  const pts = items.map((d, i) => ({
    x: padH + (i / Math.max(items.length - 1, 1)) * innerW,
    y: padTop + (1 - d.total / max) * innerH,
    label: d.label,
  }))
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `${pts[0]?.x ?? padH},${padTop + innerH} ${line} ${pts[pts.length - 1]?.x ?? W - padH},${padTop + innerH}`

  return (
    <div ref={containerRef} className="tokens-timeline-shell">
      <svg viewBox={`0 0 ${W} ${H}`} className="tokens-timeline-graph" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="var(--accent)" />
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function getStatusTone(status: string) {
  if (status === 'answered') return 'success'
  if (status === 'no_permitted_sources') return 'danger'
  if (status === 'no_answer') return 'accent'
  return 'neutral'
}

function formatConfidence(value?: number) {
  return typeof value === 'number' ? `${value}%` : t('aiView.notAvailable')
}

function getPromptForResponse(messages: AppModel['messages'], responseId: string) {
  const responseIndex = messages.findIndex((message) => message.id === responseId)
  if (responseIndex <= 0) return null
  for (let index = responseIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return message.text
  }
  return null
}

function buildNeedChartSegments(needs: Array<{ hint: string; count: number }>, distributionKey = 'aiView.needDistribution') {
  const total = needs.reduce((sum, need) => sum + need.count, 0)
  let currentAngle = 0
  const segments = needs.map((need, index) => {
    const start = currentAngle
    const end = currentAngle + (total ? (need.count / total) * 360 : 0)
    currentAngle = end
    return { ...need, color: AI_NEED_CHART_COLORS[index % AI_NEED_CHART_COLORS.length], start, end }
  })
  return {
    segments,
    total,
    gradient: segments.length
      ? `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`
      : undefined,
    label: segments.length
      ? t(distributionKey, { items: segments.map((segment) => `${segment.hint} ${segment.count}`).join(', ') })
      : t('aiView.distributionUnavailable'),
  }
}

function AIResponseCard({
  isExpanded,
  message,
  messages,
  onCollapse,
  onExpand,
  resolveFileHref,
  showNeed,
  showSources,
  onToggleNeed,
  onToggleSources,
}: {
  isExpanded: boolean
  message: AppModel['messages'][number]
  messages: AppModel['messages']
  onCollapse: () => void
  onExpand: () => void
  resolveFileHref: AppModel['resolveFileHref']
  showNeed: boolean
  showSources: boolean
  onToggleNeed: () => void
  onToggleSources: () => void
}) {
  const prompt = getPromptForResponse(messages, message.id)
  const sourceCount = message.sources?.length || 0

  return (
    <div
      className={`sync-card ai-response-card ${isExpanded ? 'ai-response-card-expanded' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={prompt || message.text}
      aria-expanded={isExpanded}
      onClick={() => onExpand()}
      onFocus={() => {
        if (!isExpanded) onExpand()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCollapse()
      }}
    >
      <div className="ai-response-head">
        <div className="ai-response-head-copy">
          <strong>{message.status === 'answered' ? `#${message.id.replace(/-assistant$/i, '').trim() || '1'}` : message.status}</strong>
        </div>
        <div className="ai-response-badges">
          <Pill tone={getStatusTone(message.status)}>{message.status}</Pill>
          <Pill tone="accent">{formatConfidence(message.confidenceScore)}</Pill>
        </div>
      </div>
      <div className="ai-response-meta">
        <span>{message.createdAt ? <CompactDateTime value={message.createdAt} /> : t('aiView.recent')}</span>
        {isExpanded ? (
          <div className="ai-response-source-badges" aria-label={t('aiView.sourceMetadata')}>
            <Pill>{message.provider || t('aiView.local')}</Pill>
            <Pill>{message.orchestrationMode || t('aiView.local')}</Pill>
          </div>
        ) : null}
      </div>
      {prompt ? (
        <div className="ai-response-question">
          <strong>{t('aiView.question')}</strong>
          <p>{prompt}</p>
        </div>
      ) : null}
      <div className="ai-response-answer">
        <strong>{t('aiView.response')}</strong>
        <p>{message.text}</p>
      </div>
      {message.sources?.length ? (
        <div className="ai-response-sources">
          <div className="message-sources-header">
            <span>{t('aiView.sources', { count: sourceCount })}</span>
            <button
              type="button"
              className="text-button text-button-sm"
              aria-label={showSources ? t('aiView.hideSources') : t('aiView.showSources')}
              onClick={(event) => {
                event.stopPropagation()
                onToggleSources()
              }}
            >
              {showSources ? t('aiView.hide') : t('aiView.show')}
            </button>
          </div>
          {showSources ? (
            <div className="message-sources">
              {message.sources.map((source) => (
                <div key={source.id} className="message-source">
                  <span>{source.siteName}</span>
                  <PathLabel value={source.path} href={resolveFileHref(source.siteId, source.path, source.webUrl)} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {message.improvementHint ? (
        <div className="message-need ai-response-need">
          <div className="message-need-head">
            <strong>{t('aiView.whatHelps')}</strong>
            <button
              type="button"
              className="text-button text-button-sm"
              aria-label={showNeed ? t('aiView.hideWhatHelps') : t('aiView.showWhatHelps')}
              onClick={(event) => {
                event.stopPropagation()
                onToggleNeed()
              }}
            >
              {showNeed ? t('aiView.hide') : t('aiView.show')}
            </button>
          </div>
          {showNeed ? <p>{message.improvementHint}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function useAnsweredSectionState(messages: AppModel['messages']) {
  const responses = messages.filter(
    (message) => message.role === 'assistant' && message.id !== 'seed' && message.status !== 'draft' && message.status !== 'answering',
  )
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [showNeed, setShowNeed] = useState(false)

  useEffect(() => {
    if (expandedResponseId && !responses.some((message) => message.id === expandedResponseId)) {
      setExpandedResponseId(null)
    }
  }, [expandedResponseId, responses])

  const needCounts = responses.reduce<Record<string, number>>((counts, message) => {
    if (message.improvementHint) counts[message.improvementHint] = (counts[message.improvementHint] || 0) + 1
    return counts
  }, {})
  const sortedNeeds = Object.entries(needCounts).map(([hint, count]) => ({ hint, count })).sort((left, right) => right.count - left.count || left.hint.localeCompare(right.hint))
  const needChart = buildNeedChartSegments(sortedNeeds.slice(0, 5))

  return {
    responses,
    expandedResponseId,
    setExpandedResponseId,
    showNeed,
    setShowNeed,
    showSources,
    setShowSources,
    sortedNeeds,
    needChart,
  }
}

function AnsweredSection({
  messages,
  resolveFileHref,
  answeredState,
}: {
  messages: AppModel['messages']
  resolveFileHref: AppModel['resolveFileHref']
  answeredState: ReturnType<typeof useAnsweredSectionState>
}) {
  const {
    responses,
    expandedResponseId,
    setExpandedResponseId,
    showNeed,
    setShowNeed,
    showSources,
    setShowSources,
  } = answeredState

  return (
    <div className="ai-response-list">
      {responses.length ? (
        [...responses].slice(-5).reverse().map((message) => (
          <AIResponseCard
            key={message.id}
            isExpanded={expandedResponseId === message.id}
            message={message}
            messages={messages}
            onCollapse={() => setExpandedResponseId((current) => (current === message.id ? null : current))}
            onExpand={() => setExpandedResponseId(message.id)}
            resolveFileHref={resolveFileHref}
            showNeed={showNeed}
            showSources={showSources}
            onToggleNeed={() => setShowNeed((value) => !value)}
            onToggleSources={() => setShowSources((value) => !value)}
          />
        ))
      ) : (
        <div className="empty-state">{t('aiView.emptyResponses')}</div>
      )}
    </div>
  )
}

function AnsweredAside({ answeredState }: { answeredState: ReturnType<typeof useAnsweredSectionState> }) {
  const { sortedNeeds, needChart } = answeredState

  return (
    <aside id="panel-right" className="panel panel-right ai-stats-needs-panel">
      <SectionHeading title={t('aiView.needsTitle')} subtitleTooltip={t('aiView.needsSubtitle')} />
      {sortedNeeds.length ? (
        <div className="ai-needs-scroll">
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
                  <span>{t(needChart.total === 1 ? 'aiView.needCount.one' : 'aiView.needCount.other')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="detail-stack">
            {sortedNeeds.slice(0, 5).map(({ hint, count }, index) => (
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
      ) : (
        <div className="empty-state">{t('aiView.emptyNeeds')}</div>
      )}
    </aside>
  )
}

function TokensSection({
  aiUsageSummary,
  tokensView,
  onToggleTokensView,
}: {
  aiUsageSummary: AppModel['aiUsageSummary']
  tokensView: TokensView
  onToggleTokensView: () => void
}) {
  const [hourlyView, setHourlyView] = useState<TokensView>('trend')
  const maxDailyTotal = Math.max(...aiUsageSummary.daily.map((entry) => entry.total), 1)
  const maxHourlyTotal = Math.max(...aiUsageSummary.hourly.map((entry) => entry.total), 1)
  const hasDaily = aiUsageSummary.daily.some((item) => item.total > 0)
  const activeHourly = aiUsageSummary.hourly.filter((item) => item.total > 0)
  const dailyTimelineItems = aiUsageSummary.daily.map((d) => ({ label: d.day.slice(5), total: d.total }))
  const hourlyTimelineItems = activeHourly.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}h`, total: h.total }))

  return (
    <div className="ai-tokens-main">
      <div className="ai-stats-scroll">
        <div className="kpi-grid compact ai-stats-kpi-grid">
          <StatCard label={t('aiView.todayInput')} value={aiUsageSummary.todayInput} note={t('aiView.todayInputNote')} />
          <StatCard label={t('aiView.todayOutput')} value={aiUsageSummary.todayOutput} note={t('aiView.todayOutputNote')} />
          <StatCard label={t('aiView.todayTotal')} value={aiUsageSummary.todayTotal} note={t('aiView.todayTotalNote')} />
          <StatCard label={t('aiView.answeredCount')} value={aiUsageSummary.answeredCount} note={t('aiView.answeredCountNote')} />
        </div>

        <div className="detail-stack">
          <div className="artifacts-detail-block tokens-chart-block">
            <div className="tokens-trend-header">
              <strong>{t('aiView.dailyTrend')}</strong>
              <button
                type="button"
                className={`tokens-view-toggle ${tokensView === 'trend' ? 'tokens-view-toggle-active' : ''}`}
                title={t('aiView.barChartTitle')}
                aria-label={t('aiView.showBarChart')}
                aria-pressed={tokensView === 'trend'}
                onClick={() => { if (tokensView !== 'trend') onToggleTokensView() }}
              >
                <TrendViewIcon />
              </button>
              <button
                type="button"
                className={`tokens-view-toggle ${tokensView === 'timeline' ? 'tokens-view-toggle-active' : ''}`}
                title={t('aiView.timelineTitle')}
                aria-label={t('aiView.showTimeline')}
                aria-pressed={tokensView === 'timeline'}
                onClick={() => { if (tokensView !== 'timeline') onToggleTokensView() }}
              >
                <TimelineViewIcon />
              </button>
            </div>
            {hasDaily ? (
              tokensView === 'timeline' ? (
                <div className="tokens-chart-surface">
                  <TokensTimelineGraph items={dailyTimelineItems} gradientId="tl-fill-daily" ariaLabel={t('aiView.dailyTimeline')} />
                </div>
              ) : (
                <div className="tokens-chart-surface">
                  <div className="usage-bars">
                  {aiUsageSummary.daily.map((item) => (
                    <div key={item.day} className="usage-bar-row">
                      <span>{item.day.slice(5)}</span>
                      <div className="usage-bar-track"><span style={{ width: `${Math.max(6, (item.total / maxDailyTotal) * 100)}%` }} /></div>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                  </div>
                </div>
              )
            ) : (
              <div className="empty-state">{t('aiView.emptyDaily')}</div>
            )}
          </div>

          <div className="artifacts-detail-block tokens-chart-block">
            <div className="tokens-trend-header">
              <strong>{t('aiView.hourlyDistribution')}</strong>
              <button
                type="button"
                className={`tokens-view-toggle ${hourlyView === 'trend' ? 'tokens-view-toggle-active' : ''}`}
                title={t('aiView.barChartTitle')}
                aria-label={t('aiView.showBarChart')}
                aria-pressed={hourlyView === 'trend'}
                onClick={() => setHourlyView('trend')}
              >
                <TrendViewIcon />
              </button>
              <button
                type="button"
                className={`tokens-view-toggle ${hourlyView === 'timeline' ? 'tokens-view-toggle-active' : ''}`}
                title={t('aiView.timelineTitle')}
                aria-label={t('aiView.showTimeline')}
                aria-pressed={hourlyView === 'timeline'}
                onClick={() => setHourlyView('timeline')}
              >
                <TimelineViewIcon />
              </button>
            </div>
            {activeHourly.length > 0 ? (
              hourlyView === 'timeline' ? (
                <div className="tokens-chart-surface">
                  <TokensTimelineGraph items={hourlyTimelineItems} gradientId="tl-fill-hourly" ariaLabel={t('aiView.hourlyTimeline')} />
                </div>
              ) : (
                <div className="tokens-chart-surface">
                  <div className="usage-bars">
                  {activeHourly.map((item) => (
                    <div key={item.hour} className="usage-bar-row">
                      <span>{`${String(item.hour).padStart(2, '0')}:00`}</span>
                      <div className="usage-bar-track"><span style={{ width: `${Math.max(6, (item.total / maxHourlyTotal) * 100)}%` }} /></div>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                  </div>
                </div>
              )
            ) : (
              <div className="empty-state">{t('aiView.emptyHourly')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TokensAside({ aiUsageSummary }: { aiUsageSummary: AppModel['aiUsageSummary'] }) {
  const providerNeeds = aiUsageSummary.providerBreakdown.map((entry) => ({ hint: entry.provider, count: entry.total }))
  const providerChart = buildNeedChartSegments(providerNeeds, 'aiView.providerDistribution')

  return (
    <aside id="panel-right" className="panel panel-right ai-stats-needs-panel">
      <SectionHeading title={t('aiView.providerSplit')} subtitleTooltip={t('aiView.providerSplitSubtitle')} />
      {aiUsageSummary.providerBreakdown.length ? (
        <div className="ai-needs-scroll">
          <div className="ai-needs-chart-card">
            <div className="ai-needs-chart-shell">
              <div
                className="ai-needs-chart"
                role="img"
                aria-label={providerChart.label}
                style={providerChart.gradient ? { backgroundImage: providerChart.gradient } : undefined}
              >
                <div className="ai-needs-chart-center">
                  <strong>{providerChart.total}</strong>
                  <span>{t(providerChart.total === 1 ? 'aiView.tokenCount.one' : 'aiView.tokenCount.other')}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="detail-stack">
            {providerNeeds.map(({ hint, count }, index) => (
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
      ) : (
        <div className="empty-state">{t('aiView.emptyProviderSplit')}</div>
      )}
    </aside>
  )
}

export function AIStatsPanel({
  aiUsageSummary,
  messages,
  resolveFileHref,
  showRightPanel,
}: {
  aiUsageSummary: AppModel['aiUsageSummary']
  messages: AppModel['messages']
  resolveFileHref: AppModel['resolveFileHref']
  showRightPanel: boolean
}) {
  const [section, setSection] = useState<AIViewSection>('answered')
  const [tokensView, setTokensView] = useState<TokensView>('trend')
  const answeredState = useAnsweredSectionState(messages)

  return (
    <section className={`ai-view-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <div className="ai-stats-main-column">
        <article className="panel ai-view-switcher-panel" aria-label={t('aiView.navigation')}>
          <div className="sync-view-switcher">
          <div className="sync-view-switcher-head">
            <div>
              <h2>{t('aiView.title')}</h2>
              <p>{t('aiView.description')}</p>
            </div>
          </div>
          <div className="sync-subnav" aria-label={t('aiView.sections')}>
            <button type="button" className={`sync-subnav-item ${section === 'answered' ? 'sync-subnav-item-active' : ''}`} onClick={() => setSection('answered')}>
              <span className="sync-subnav-title-row">
                <span className="sync-subnav-icon" aria-hidden="true"><AnsweredIcon /></span>
                <span className="sync-subnav-label">{t('aiView.answered')}</span>
              </span>
              <span className="sync-subnav-detail">{t('aiView.answeredNavDetail')}</span>
            </button>
            <button type="button" className={`sync-subnav-item ${section === 'tokens' ? 'sync-subnav-item-active' : ''}`} onClick={() => setSection('tokens')}>
              <span className="sync-subnav-title-row">
                <span className="sync-subnav-icon" aria-hidden="true"><TokensIcon /></span>
                <span className="sync-subnav-label">{t('aiView.tokens')}</span>
              </span>
              <span className="sync-subnav-detail">{t('aiView.tokensNavDetail')}</span>
            </button>
          </div>
          </div>
        </article>

        <article className={`panel ai-stats-panel ${section === 'tokens' ? 'ai-stats-panel-tokens' : ''}`} aria-label={t('aiView.section')}>
          <SectionHeading
            title={section === 'answered' ? t('aiView.answered') : t('aiView.tokens')}
            subtitle={section === 'answered' ? t('aiView.answeredSubtitle') : t('aiView.tokensSubtitle')}
            subtitleTooltip={t('aiView.sectionHelp')}
          />
          {section === 'answered' ? (
            <AnsweredSection messages={messages} resolveFileHref={resolveFileHref} answeredState={answeredState} />
          ) : (
            <TokensSection aiUsageSummary={aiUsageSummary} tokensView={tokensView} onToggleTokensView={() => setTokensView((v) => v === 'trend' ? 'timeline' : 'trend')} />
          )}
        </article>
      </div>
      {showRightPanel ? (section === 'answered' ? <AnsweredAside answeredState={answeredState} /> : <TokensAside aiUsageSummary={aiUsageSummary} />) : null}
    </section>
  )
}
