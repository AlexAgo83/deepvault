import { useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from './error-boundary'
import { CompactDateTime, StatCard } from './app-ui'
import { GettingStartedModal } from './getting-started-modal'
import { AppSidebar, AppToolbar, AppTopbar, type RightPanelState, type SettingsShortcutTarget } from './app-shell-chrome'
import { useInstallPrompt, useTheme } from '../hooks'
import type { AppModel, AppTab } from '../hooks/useAppModel'
import { AIStatsPanel, ArtifactsPanel, BishopPanel, createBishopExportHandlers, ExplorerPanel, createExplorerExportHandlers, SettingsPanel, SyncPanel } from './panels'
import { useRegisterSW } from 'virtual:pwa-register/react'

type TopbarScrollTarget = 'sync-status'
type StatsHeaderState = Record<Extract<AppTab, 'settings' | 'sync' | 'ai-stats' | 'artifacts'>, boolean>

const RIGHT_PANEL_STORAGE_KEY = 'deepvault_right_panel_visibility'
const STATS_HEADER_STORAGE_KEY = 'deepvault_stats_headers_visibility'
const MOBILE_VIEWPORT_QUERY = '(max-width: 900px)'

function readIsMobileViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    : false
}

function readRightPanelState(): RightPanelState {
  const defaultState: RightPanelState = {
    explorer: true,
    bishop: false,
    artifacts: true,
    'ai-stats': true,
    settings: true,
  }

  try {
    const raw = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<RightPanelState>
    return {
      explorer: typeof parsed.explorer === 'boolean' ? parsed.explorer : defaultState.explorer,
      bishop: typeof parsed.bishop === 'boolean' ? parsed.bishop : defaultState.bishop,
      artifacts: typeof parsed.artifacts === 'boolean' ? parsed.artifacts : defaultState.artifacts,
      'ai-stats': typeof parsed['ai-stats'] === 'boolean' ? parsed['ai-stats'] : defaultState['ai-stats'],
      settings: typeof parsed.settings === 'boolean' ? parsed.settings : defaultState.settings,
    }
  } catch {
    return defaultState
  }
}

function readStatsHeaderState(): StatsHeaderState {
  const defaultState: StatsHeaderState = {
    settings: false,
    sync: false,
    'ai-stats': false,
    artifacts: false,
  }

  try {
    const raw = localStorage.getItem(STATS_HEADER_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<StatsHeaderState>
    return {
      settings: typeof parsed.settings === 'boolean' ? parsed.settings : defaultState.settings,
      sync: typeof parsed.sync === 'boolean' ? parsed.sync : defaultState.sync,
      'ai-stats': typeof parsed['ai-stats'] === 'boolean' ? parsed['ai-stats'] : defaultState['ai-stats'],
      artifacts: typeof parsed.artifacts === 'boolean' ? parsed.artifacts : defaultState.artifacts,
    }
  } catch {
    return defaultState
  }
}

export function AppShell(model: AppModel) {
  const {
    activeScopeLabel,
    activeTab,
    corpusProviders,
    hostedMode,
    hostedIdentityLabel,
    canSignOutHostedSession,
    signOutHostedSession,
    isOperator,
    bishopSettings,
    clearBishopSettings,
    clearEntraSettings,
    clearProviderSecrets,
    clearWorkerSettings,
    entraSettings,
    explorerRows,
    workerHealth,
    clearBishopHistory,
    handleAsk,
    isAsking,
    conversationContextEnabled,
    liveState,
    messages,
    provider,
    providerSecrets,
    question,
    resolveFileHref,
    role,
    scopedCorpusSummary,
    scopedSiteSummaries,
    scopedSyncOverview,
    search,
    selectedExplorerDoc,
    selectedMessage,
    setActiveTab,
    setBishopSetting,
    setProvider,
    setEntraSetting,
    setProviderSecret,
    setQuestion,
    setConversationContextEnabled,
    setRole,
    setSearch,
    setSelectedDocId,
    setSiteFilter,
    setWorkerSetting,
    siteFilter,
    siteSummaries,
    syncOperations,
    workerSettings,
  } = model
  const installPrompt = useInstallPrompt()
  const { theme, toggleTheme } = useTheme()
  const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true })
  const hasPendingUpdate = needRefresh[0]
  const isApplyingPwaUpdateRef = useRef(false)
  const [gettingStartedOpen, setGettingStartedOpen] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('deepvault_sidebar_collapsed') === 'true')
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => readIsMobileViewport())
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [rightPanelState, setRightPanelState] = useState<RightPanelState>(() => readRightPanelState())
  const [pendingScrollTarget, setPendingScrollTarget] = useState<TopbarScrollTarget | null>(null)
  const [requestedSettingsView, setRequestedSettingsView] = useState<SettingsShortcutTarget>(null)
  const [statsHeaderState, setStatsHeaderState] = useState<StatsHeaderState>(() => readStatsHeaderState())

  useEffect(() => {
    localStorage.setItem('deepvault_sidebar_collapsed', String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches)
    }

    setIsMobileViewport(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileMenuOpen(false)
    }
  }, [isMobileViewport])

  useEffect(() => {
    localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, JSON.stringify(rightPanelState, null, 2))
  }, [rightPanelState])

  useEffect(() => {
    localStorage.setItem(STATS_HEADER_STORAGE_KEY, JSON.stringify(statsHeaderState, null, 2))
  }, [statsHeaderState])

  useEffect(() => {
    if (!hasPendingUpdate || isApplyingPwaUpdateRef.current) {
      return
    }

    isApplyingPwaUpdateRef.current = true
    void Promise.resolve(updateServiceWorker(true)).finally(() => {
      isApplyingPwaUpdateRef.current = false
    })
  }, [hasPendingUpdate, updateServiceWorker])

  useEffect(() => {
    if (!pendingScrollTarget) {
      return
    }

    const selectors: Record<TopbarScrollTarget, string> = {
      'sync-status': '#sync-status-panel',
    }

    const target = document.querySelector(selectors[pendingScrollTarget])
    if (!target) {
      return
    }

    if ('scrollIntoView' in target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    setPendingScrollTarget(null)
  }, [pendingScrollTarget, activeTab])

  const closeGettingStarted = () => {
    setGettingStartedOpen(false)
  }

  useEffect(() => {
    if (activeTab !== 'explorer' && gettingStartedOpen) {
      setGettingStartedOpen(false)
    }
  }, [activeTab, gettingStartedOpen])

  const explorerExportHandlers = createExplorerExportHandlers({
    activeScopeLabel,
    explorerRows,
    search,
    selectedExplorerDoc,
  })
  const bishopExportHandlers = createBishopExportHandlers({ messages, question })
  const responses = messages.filter(
    (message) => message.role === 'assistant' && message.id !== 'seed' && message.status !== 'draft' && message.status !== 'answering',
  )
  const confidenceValues = responses.map((message) => message.confidenceScore).filter((value): value is number => typeof value === 'number')
  const confidenceAverage = confidenceValues.length
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : null
  const answeredCount = responses.filter((message) => message.status === 'answered').length
  const needHints = responses.filter((message) => Boolean(message.improvementHint))
  const showKpiGrid = (activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats' || activeTab === 'artifacts') ? statsHeaderState[activeTab] : false
  const showStatsToggle = activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats' || activeTab === 'artifacts'
  const isKnowledgeTab = activeTab === 'sync'
  const canAccessArtifacts = !hostedMode || isOperator
  useEffect(() => {
    if (activeTab === 'artifacts' && !canAccessArtifacts) {
      setActiveTab('sync')
    }
  }, [activeTab, canAccessArtifacts, setActiveTab])
  const toggleSidebar = () => setIsSidebarCollapsed((value) => !value)
  const toggleMobileMenu = () => {
    if (isMobileViewport) {
      setIsMobileMenuOpen((value) => !value)
      return
    }
    setIsSidebarCollapsed((value) => !value)
  }
  const closeMobileMenu = () => setIsMobileMenuOpen(false)
  const hasRightPanel = activeTab === 'explorer' || activeTab === 'bishop' || activeTab === 'artifacts' || activeTab === 'ai-stats' || activeTab === 'settings'
  const showRightPanel = hasRightPanel ? rightPanelState[activeTab] : false
  const toggleRightPanel = () => {
    if (!hasRightPanel) return
    setRightPanelState((current) => ({ ...current, [activeTab]: !current[activeTab] }))
  }
  const openSettingsPanel = (target: Exclude<SettingsShortcutTarget, null>) => {
    setActiveTab('settings')
    setRequestedSettingsView(target)
  }
  const openSyncStatus = () => {
    setActiveTab('sync')
    setPendingScrollTarget('sync-status')
    const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
    params.set('tab', 'sync')
    params.set('sync', 'status')
    window.location.hash = `#${params.toString()}`
  }
  const toggleStatsHeader = () => {
    if (activeTab !== 'settings' && activeTab !== 'sync' && activeTab !== 'ai-stats' && activeTab !== 'artifacts') {
      return
    }
    setStatsHeaderState((current) => ({ ...current, [activeTab]: !current[activeTab] }))
  }
  const currentStatsHeadersVisible = activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats' || activeTab === 'artifacts' ? statsHeaderState[activeTab] : false
  const analyzedDocCount = model.scopedCorpus.documents.filter((d) => d.analysis?.status === 'analyzed').length
  const kpiGridSection = showKpiGrid ? (
    <section className="kpi-grid">
      {activeTab === 'ai-stats' ? (
        <>
          <StatCard label="Responses" value={responses.length} note="Completed Bishop responses in the current session." />
          <StatCard label="Answered" value={answeredCount} note="Responses that were grounded enough to answer." />
          <StatCard
            label="Avg confidence"
            value={confidenceAverage === null ? 'n/a' : `${confidenceAverage}%`}
            note="Average confidence across completed responses with a numeric score."
          />
          <StatCard label="Need hints" value={needHints.length} note="Responses that surfaced a brief hint about better input." />
        </>
      ) : activeTab === 'artifacts' ? (
        <>
          <StatCard label="Documents" value={model.scopedCorpus.documents.length} note="Corpus documents available in the current site scope." />
          <StatCard label="Analyzed" value={analyzedDocCount} note="Documents with additive AI analysis blocks from npm run analyze." />
          <StatCard label="Sync runs" value={syncOperations.history.length} note="Recent sync and analyze run records in the retained history window." />
          <StatCard label="Generated" value={responses.filter((m) => Boolean(m.artifact)).length} note="Bishop responses that produced artifact outputs." />
        </>
      ) : (
        <>
          <StatCard
            label="Sites in scope"
            value={scopedSyncOverview.siteSummaries.length}
            note="Site scope is shared across Explorer, Bishop, and Knowledge."
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
        </>
      )}
    </section>
  ) : null

  return (
    <div className={`app-shell ${!isMobileViewport && isSidebarCollapsed ? 'app-shell-sidebar-collapsed' : ''}`}>
      {isMobileViewport && isMobileMenuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={closeMobileMenu}
        />
      ) : null}

      <AppSidebar
        activeTab={activeTab}
        canInstall={installPrompt.canInstall}
        install={installPrompt.install}
        isStandalone={installPrompt.isStandalone}
        isCollapsed={isSidebarCollapsed}
        isMobileViewport={isMobileViewport}
        isMobileMenuOpen={isMobileMenuOpen}
        theme={theme}
        onToggleSidebar={toggleSidebar}
        onTabChange={(tab) => {
          setActiveTab(tab)
          closeMobileMenu()
        }}
        onRequestCloseMobileMenu={closeMobileMenu}
        onToggleTheme={toggleTheme}
        showArtifactsTab={canAccessArtifacts}
      />

      <main className={`main-content ${isKnowledgeTab ? 'main-content-knowledge' : ''}`}>
        <AppTopbar
          activeScopeLabel={activeScopeLabel}
          hasRightPanel={hasRightPanel}
          isMobileViewport={isMobileViewport}
          isMobileMenuOpen={isMobileMenuOpen}
          liveStateDetail={liveState.detail}
          liveStateLabel={liveState.label}
          liveStateTone={liveState.tone}
          onOpenAiProviders={() => openSettingsPanel('ai-providers')}
          onOpenSettings={() => openSettingsPanel('runtime')}
          onOpenSyncStatus={openSyncStatus}
          onToggleStatsHeader={toggleStatsHeader}
          onToggleRightPanel={toggleRightPanel}
          onToggleMobileMenu={toggleMobileMenu}
          provider={provider}
          role={role}
          hostedIdentityLabel={hostedMode ? hostedIdentityLabel : null}
          showRightPanel={showRightPanel}
          showStatsHeaders={currentStatsHeadersVisible}
          showStatsToggle={showStatsToggle}
        />

        {isKnowledgeTab ? (
          <div className="knowledge-body">
            {kpiGridSection}
            <div className="knowledge-scroll-region">
              <ErrorBoundary fallback={<div className="empty-state">Sync panel failed to render.</div>}>
                <SyncPanel
                  canManageJobs={!hostedMode || isOperator}
                  scopedCorpusSummary={scopedCorpusSummary}
                  scopedSiteSummaries={scopedSiteSummaries}
                  scopedSyncOverview={scopedSyncOverview}
                  syncOperations={syncOperations}
                  workerSettings={workerSettings}
                />
              </ErrorBoundary>
            </div>
          </div>
        ) : (
          kpiGridSection
        )}

        {activeTab === 'settings' ? (
          <ErrorBoundary fallback={<div className="empty-state">Settings panel failed to render.</div>}>
            <SettingsPanel
              corpusProviders={corpusProviders}
              bishopSettings={bishopSettings}
              canSignOutHostedSession={canSignOutHostedSession}
              conversationContextEnabled={conversationContextEnabled}
              entraSettings={entraSettings}
              hostedIdentityLabel={hostedIdentityLabel}
              hostedMode={hostedMode}
              isOperator={isOperator}
              providerSecrets={providerSecrets}
              workerHealth={workerHealth}
              workerSettings={workerSettings}
              onBishopChange={setBishopSetting}
              onClear={clearProviderSecrets}
              onClearBishop={clearBishopSettings}
              onClearEntra={clearEntraSettings}
              onClearWorker={clearWorkerSettings}
              onEntraChange={setEntraSetting}
              onKeyChange={setProviderSecret}
              onProviderChange={(value) => setProvider(value)}
              onRoleChange={(value) => setRole(value)}
              onSignOutHostedSession={signOutHostedSession}
              onSiteFilterChange={setSiteFilter}
              onConversationContextEnabledChange={setConversationContextEnabled}
              onWorkerChange={setWorkerSetting}
              showRightPanel={showRightPanel}
              provider={provider}
              requestedView={requestedSettingsView}
              role={role}
              siteFilter={siteFilter}
              siteSummaries={siteSummaries}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'explorer' ? (
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
              showRightPanel={showRightPanel}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'bishop' ? (
          <ErrorBoundary fallback={<div className="empty-state">Bishop panel failed to render.</div>}>
            <BishopPanel
              clearHistory={clearBishopHistory}
              exportJson={bishopExportHandlers.exportJson}
              exportMarkdown={bishopExportHandlers.exportMarkdown}
              conversationContextEnabled={conversationContextEnabled}
              isAsking={isAsking}
              messages={messages}
              onQuestionChange={setQuestion}
              onConversationContextChange={setConversationContextEnabled}
              onSubmit={handleAsk}
              provider={provider}
              question={question}
              resolveFileHref={resolveFileHref}
              selectedMessage={selectedMessage}
              showRightPanel={showRightPanel}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'ai-stats' ? (
          <ErrorBoundary fallback={<div className="empty-state">AI View panel failed to render.</div>}>
            <AIStatsPanel aiUsageSummary={model.aiUsageSummary} messages={messages} resolveFileHref={resolveFileHref} showRightPanel={showRightPanel} />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'artifacts' && canAccessArtifacts ? (
          <ErrorBoundary fallback={<div className="empty-state">Artifacts panel failed to render.</div>}>
            <ArtifactsPanel
              corpus={model.scopedCorpus}
              messages={messages}
              resolveFileHref={resolveFileHref}
              showRightPanel={showRightPanel}
              syncOperations={syncOperations}
            />
          </ErrorBoundary>
        ) : null}
      </main>

      <GettingStartedModal onClose={closeGettingStarted} open={gettingStartedOpen} />
    </div>
  )
}
