import type { ReactElement } from 'react'
import { ErrorBoundary } from './error-boundary'
import { CompactDateTime, Pill, StatCard } from './app-ui'
import type { AppModel, AppTab } from '../hooks/useAppModel'
import { BishopPanel, createBishopExportHandlers, ExplorerPanel, createExplorerExportHandlers, SyncPanel } from './panels'
import { version } from '../../package.json'

const NAV_ITEMS = [
  { id: 'explorer', label: 'Explorer', icon: ExplorerIcon },
  { id: 'bishop', label: 'Bishop', icon: BishopIcon },
  { id: 'sync', label: 'Sync status', icon: SyncIcon },
] as const satisfies ReadonlyArray<{ id: AppTab; label: string; icon: () => ReactElement }>

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 4.75A1.75 1.75 0 0 1 5.75 3h8.5A1.75 1.75 0 0 1 16 4.75v10.5A1.75 1.75 0 0 1 14.25 17h-8.5A1.75 1.75 0 0 1 4 15.25z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 7.5h7M6.5 10h5.5M6.5 12.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BishopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 3.75c1.15 0 2.08.93 2.08 2.08 0 .7-.35 1.32-.88 1.7.88.67 1.44 1.73 1.44 2.92 0 1.05-.45 2-1.17 2.67l1.03 2.38h-5l1.03-2.38a3.78 3.78 0 0 1-1.17-2.67c0-1.19.56-2.25 1.44-2.92a2.06 2.06 0 0 1-.88-1.7c0-1.15.93-2.08 2.08-2.08Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 16.25h5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 7.25A6.12 6.12 0 0 1 10 5.25c2.12 0 4.02 1.08 5.16 2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 5.75v2.9h-2.9M14.75 12.75A6.12 6.12 0 0 1 10 14.75c-2.12 0-4.02-1.08-5.16-2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 14.25v-2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AppSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab
  onTabChange: (_tab: AppTab) => void
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brandline">
        <span>Nexus</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Navigation</div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeTab === item.id ? 'nav-item-active' : ''}`}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => onTabChange(item.id)}
            >
              <span className="nav-item-icon" aria-hidden="true">
                <item.icon />
              </span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function AppTopbar({
  activeScopeLabel,
  liveStateLabel,
  liveStateTone,
  liveStateDetail,
  provider,
  role,
}: {
  activeScopeLabel: string
  liveStateLabel: string
  liveStateTone: AppModel['liveState']['tone']
  liveStateDetail: string
  provider: string
  role: string
}) {
  return (
    <header className="topbar">
      <div />
      <div className="topbar-badges">
        <Pill tone={liveStateTone} title={liveStateDetail}>
          {liveStateLabel}
        </Pill>
        <Pill tone="success">Synced</Pill>
        <Pill tone="neutral">{activeScopeLabel}</Pill>
        <Pill tone="neutral">{provider}</Pill>
        <Pill tone="accent">{role}</Pill>
      </div>
    </header>
  )
}

function AppToolbar({
  search,
  onSearchChange,
}: {
  search: string
  onSearchChange: (_value: string) => void
}) {
  return (
    <section className="panel panel-toolbar">
      <div className="toolbar">
        <div className="toolbar-search">
          <label htmlFor="search">Explorer search</label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Budget, roadmap, policy, status..."
          />
        </div>
      </div>
    </section>
  )
}

export function AppShell(model: AppModel) {
  const {
    activeScopeLabel,
    activeTab,
    corpusProviders,
    explorerRows,
    clearBishopHistory,
    handleAsk,
    isAsking,
    liveState,
    messages,
    provider,
    question,
    resolveFileHref,
    role,
    scopedCorpusSummary,
    scopedSyncRuns,
    scopedSiteSummaries,
    scopedSyncOverview,
    search,
    selectedExplorerDoc,
    selectedMessage,
    setActiveTab,
    setProvider,
    setQuestion,
    setRole,
    setSearch,
    setSelectedDocId,
    setSiteFilter,
    siteFilter,
    siteSummaries,
  } = model

  const explorerExportHandlers = createExplorerExportHandlers({
    activeScopeLabel,
    explorerRows,
    search,
    selectedExplorerDoc,
  })
  const bishopExportHandlers = createBishopExportHandlers({ messages, question })

  return (
    <div className="app-shell">
      <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        <AppTopbar
          activeScopeLabel={activeScopeLabel}
          liveStateDetail={liveState.detail}
          liveStateLabel={liveState.label}
          liveStateTone={liveState.tone}
          provider={provider}
          role={role}
        />

        <section className="kpi-grid">
          <StatCard
            label="Sites in scope"
            value={scopedSyncOverview.siteSummaries.length}
            note="Site scope is shared across Explorer, Bishop, and Sync status."
          />
          <StatCard
            label="Visible docs"
            value={scopedSyncOverview.documentCount}
            note="Role-filtered corpus entries available in the current site scope."
          />
          <StatCard
            label="Last refresh"
            value={scopedSyncOverview.lastRun ? <CompactDateTime value={scopedSyncOverview.lastRun.finishedAt} /> : 'n/a'}
            note={scopedSyncOverview.refreshPolicy}
            valueClassName="stat-value-compact stat-value-datetime"
          />
          <StatCard
            label="Provider readiness"
            value={corpusProviders.filter((item) => item.ready).length}
            note="OpenAI, Gemini, and Claude are available in the local abstraction."
          />
        </section>

        {activeTab !== 'bishop' ? (
          <AppToolbar search={search} onSearchChange={setSearch} />
        ) : null}

        {activeTab === 'explorer' ? (
          <ErrorBoundary fallback={<div className="empty-state">Explorer panel failed to render.</div>}>
            <ExplorerPanel
              explorerRows={explorerRows}
              onSelectDocument={(document) => {
                setSelectedDocId(document.id)
                setActiveTab('explorer')
              }}
              onExportJson={explorerExportHandlers.exportJson}
              onExportMarkdown={explorerExportHandlers.exportMarkdown}
              resolveFileHref={resolveFileHref}
              selectedExplorerDoc={selectedExplorerDoc}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'bishop' ? (
          <ErrorBoundary fallback={<div className="empty-state">Bishop panel failed to render.</div>}>
            <BishopPanel
              clearHistory={clearBishopHistory}
              exportJson={bishopExportHandlers.exportJson}
              exportMarkdown={bishopExportHandlers.exportMarkdown}
              isAsking={isAsking}
              messages={messages}
              onQuestionChange={setQuestion}
              onSubmit={handleAsk}
              provider={provider}
              question={question}
              resolveFileHref={resolveFileHref}
              role={role}
              selectedMessage={selectedMessage}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'sync' ? (
          <ErrorBoundary fallback={<div className="empty-state">Sync panel failed to render.</div>}>
            <SyncPanel
              activeScopeLabel={activeScopeLabel}
              corpusProviders={corpusProviders}
              onProviderChange={(value) => setProvider(value)}
              onRoleChange={(value) => setRole(value)}
              onSiteFilterChange={setSiteFilter}
              provider={provider}
              role={role}
              siteFilter={siteFilter}
              siteSummaries={siteSummaries}
              scopedCorpusSummary={scopedCorpusSummary}
              scopedSiteSummaries={scopedSiteSummaries}
              scopedSyncOverview={scopedSyncOverview}
              scopedSyncRuns={scopedSyncRuns}
            />
          </ErrorBoundary>
        ) : null}

        <footer className="page-footer" aria-label="Site footer">
          <span>Nexus · v{version} · © {new Date().getFullYear()}</span>
        </footer>
      </main>
    </div>
  )
}
