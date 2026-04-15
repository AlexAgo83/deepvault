import { useEffect, useState, type ReactElement } from 'react'
import { ErrorBoundary } from './error-boundary'
import { CompactDateTime, Pill, StatCard } from './app-ui'
import { GettingStartedModal } from './getting-started-modal'
import { useInstallPrompt, useTheme } from '../hooks'
import type { Theme } from '../hooks/useTheme'
import type { AppModel, AppTab } from '../hooks/useAppModel'
import { AIStatsPanel, BishopPanel, createBishopExportHandlers, ExplorerPanel, createExplorerExportHandlers, SettingsPanel, SyncPanel } from './panels'
import { version } from '../../package.json'
import { useRegisterSW } from 'virtual:pwa-register/react'

type NavSection = {
  label: string
  ariaLabel: string
  items: ReadonlyArray<{ id: AppTab; label: string; icon: () => ReactElement }>
}

type RightPanelState = Record<Exclude<AppTab, 'settings' | 'sync'>, boolean>
type TopbarScrollTarget = 'settings-runtime' | 'settings-ai-providers' | 'sync-status'
type StatsHeaderState = Record<Extract<AppTab, 'settings' | 'sync' | 'ai-stats'>, boolean>

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
    'ai-stats': true,
  }

  try {
    const raw = localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<RightPanelState>
    return {
      explorer: typeof parsed.explorer === 'boolean' ? parsed.explorer : defaultState.explorer,
      bishop: typeof parsed.bishop === 'boolean' ? parsed.bishop : defaultState.bishop,
      'ai-stats': typeof parsed['ai-stats'] === 'boolean' ? parsed['ai-stats'] : defaultState['ai-stats'],
    }
  } catch {
    return defaultState
  }
}

function readStatsHeaderState(): StatsHeaderState {
  const defaultState: StatsHeaderState = {
    settings: true,
    sync: true,
    'ai-stats': true,
  }

  try {
    const raw = localStorage.getItem(STATS_HEADER_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<StatsHeaderState>
    return {
      settings: typeof parsed.settings === 'boolean' ? parsed.settings : defaultState.settings,
      sync: typeof parsed.sync === 'boolean' ? parsed.sync : defaultState.sync,
      'ai-stats': typeof parsed['ai-stats'] === 'boolean' ? parsed['ai-stats'] : defaultState['ai-stats'],
    }
  } catch {
    return defaultState
  }
}

const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    label: 'Navigation',
    ariaLabel: 'Primary navigation',
    items: [
      { id: 'explorer', label: 'Explorer', icon: ExplorerIcon },
      { id: 'bishop', label: 'Bishop', icon: BishopIcon },
    ],
  },
  {
    label: 'Application',
    ariaLabel: 'Application panels',
    items: [
      { id: 'sync', label: 'Knowledge', icon: SyncIcon },
      { id: 'ai-stats', label: 'AI View', icon: StatsIcon },
      { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="m12.3 12.3 3.7 3.7" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function BishopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="8.2" cy="8.9" r="0.65" fill="currentColor" />
      <circle cx="11.8" cy="8.9" r="0.65" fill="currentColor" />
      <path d="M8.2 11.6c.45.58 1.1.9 1.8.9s1.35-.32 1.8-.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <ellipse cx="10" cy="4.75" rx="4.75" ry="1.75" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.25 4.75v4.5c0 .97 2.13 1.75 4.75 1.75s4.75-.78 4.75-1.75v-4.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.25 9.25v4.5c0 .97 2.13 1.75 4.75 1.75s4.75-.78 4.75-1.75v-4.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M8.3 4.4 10 3.5l1.7.9 1.9-.2.8 1.8 1.6 1.1-.4 1.9.4 1.9-1.6 1.1-.8 1.8-1.9-.2-1.7.9-1.7-.9-1.9.2-.8-1.8-1.6-1.1.4-1.9-.4-1.9 1.6-1.1.8-1.8z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 15.25V9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 15.25V5.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 15.25V11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 15.25h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3.5v1.2M10 15.3v1.2M3.5 10h1.2M15.3 10h1.2M5.45 5.45l.85.85M13.7 13.7l.85.85M14.55 5.45l-.85.85M6.3 13.7l-.85.85" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M14.5 12.5A6 6 0 0 1 7.5 5.5a6.04 6.04 0 0 0-.5 2.4 6 6 0 0 0 6 6c.84 0 1.65-.17 2.38-.47A5.98 5.98 0 0 1 14.5 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function PwaInstallIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 4v8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.5 8.5 10 12l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PwaUpdateIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 7.75A6 6 0 0 1 10 5.75c2.05 0 3.88 1 5 2.55" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 5.75v2.7h-2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 12.25A6 6 0 0 1 10 14.25c-2.05 0-3.88-1-5-2.55" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 14.25v-2.7h2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 8.3v4.35" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="10" cy="6.2" r="0.75" fill="currentColor" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M8.35 7.25a1.75 1.75 0 0 1 3.3.85c0 1.4-1.55 1.8-2.1 2.7-.16.27-.25.58-.25.95v.45" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="14.45" r="0.75" fill="currentColor" />
    </svg>
  )
}

function StatsToggleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 14.75V9.25" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M9.5 14.75V6.75" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M13.75 14.75V11" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M4.5 14.75h11" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 9.25 10 4.75l5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 8.9v6.35h7V8.9" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15.25v-3h2v3" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AppSidebar({
  activeTab,
  canInstall,
  hasPendingUpdate,
  install,
  isStandalone,
  isCollapsed,
  isMobileViewport,
  isMobileMenuOpen,
  theme,
  update,
  onToggleSidebar,
  onTabChange,
  onToggleTheme,
  onRequestCloseMobileMenu,
}: {
  activeTab: AppTab
  canInstall: boolean
  hasPendingUpdate: boolean
  install: () => Promise<void>
  isStandalone: boolean
  isCollapsed: boolean
  isMobileViewport: boolean
  isMobileMenuOpen: boolean
  theme: Theme
  onToggleSidebar: () => void
  onTabChange: (_tab: AppTab) => void
  onToggleTheme: () => void
  onRequestCloseMobileMenu: () => void
  update: () => Promise<void>
}) {
  return (
    <aside
      id="app-sidebar"
      className={`sidebar ${!isMobileViewport && isCollapsed ? 'sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'sidebar-mobile-open' : ''}`}
      aria-label="App sidebar"
      aria-expanded={!isMobileViewport && !isCollapsed ? true : isMobileMenuOpen}
    >
      <div className="sidebar-brandline">
        <span className="sidebar-brand">Nexus</span>
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-label={isMobileMenuOpen ? 'Close menu' : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={isMobileMenuOpen ? true : isCollapsed}
          aria-controls="app-sidebar"
          title={isMobileMenuOpen ? 'Close menu' : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={isMobileMenuOpen ? onRequestCloseMobileMenu : onToggleSidebar}
        >
          <MenuIcon />
        </button>
      </div>

      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="sidebar-section">
          <div className="sidebar-label">{section.label}</div>
          <nav className="nav-list" aria-label={section.ariaLabel}>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${activeTab === item.id ? 'nav-item-active' : ''}`}
                aria-current={activeTab === item.id ? 'page' : undefined}
                title={`Open ${item.label.toLowerCase()}`}
                onClick={() => onTabChange(item.id)}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <item.icon />
                </span>
                <span className="nav-item-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      ))}

      {!isStandalone && (canInstall || hasPendingUpdate) ? (
        <div className="sidebar-section">
          <nav className="nav-list" aria-label="App actions">
            {!isStandalone && canInstall ? (
              <button
                type="button"
                className="nav-item nav-item-action pwa-action-button"
                title="Install the app as a standalone application"
                onClick={() => void install()}
              >
                <span className="pwa-action-icon" aria-hidden="true">
                  <PwaInstallIcon />
                </span>
                <span className="nav-item-label">Installer l'app</span>
              </button>
            ) : null}
            {hasPendingUpdate ? (
              <button
                type="button"
                className="nav-item nav-item-action pwa-action-button"
                title="Apply the latest app update"
                onClick={() => void update()}
              >
                <span className="pwa-action-icon" aria-hidden="true">
                  <PwaUpdateIcon />
                </span>
                <span className="nav-item-label">Mettre à jour</span>
              </button>
            ) : null}
          </nav>
        </div>
      ) : null}

      <div className="theme-toggle">
        <span className="theme-toggle-label">Theme</span>
        <button
          type="button"
          className="theme-toggle-button"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </aside>
  )
}

function AppTopbar({
  activeScopeLabel,
  liveStateLabel,
  liveStateTone,
  liveStateDetail,
  hasRightPanel,
  isMobileViewport,
  isMobileMenuOpen,
  showRightPanel,
  showStatsHeaders,
  showStatsToggle,
  onToggleStatsHeader,
  provider,
  role,
  onOpenAiProviders,
  onOpenSettings,
  onOpenSyncStatus,
  onToggleRightPanel,
  onToggleMobileMenu,
}: {
  activeScopeLabel: string
  liveStateLabel: string
  liveStateTone: AppModel['liveState']['tone']
  liveStateDetail: string
  hasRightPanel: boolean
  isMobileViewport: boolean
  isMobileMenuOpen: boolean
  showRightPanel: boolean
  showStatsHeaders: boolean
  showStatsToggle: boolean
  onToggleStatsHeader: () => void
  provider: string
  role: string
  onOpenAiProviders: () => void
  onOpenSettings: () => void
  onOpenSyncStatus: () => void
  onToggleRightPanel: () => void
  onToggleMobileMenu: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <header className="topbar">
      <div className="topbar-actions">
        <div className="topbar-badges">
          {isExpanded ? (
            <>
              <div className="topbar-badge-group topbar-badge-group-status" aria-label="Knowledge">
                <button
                  type="button"
                  className="topbar-pill-button"
                  title={liveStateDetail}
                  aria-label={`${liveStateLabel}. Open Settings and scroll to the Settings panel`}
                  onClick={onOpenSettings}
                >
                  <Pill tone={liveStateTone} title={liveStateDetail}>
                    {liveStateLabel}
                  </Pill>
                </button>
                <button
                  type="button"
                  className="topbar-pill-button"
                  title="Open Knowledge View and jump to Status"
                  aria-label="Synced. Open Knowledge View and jump to Status"
                  onClick={onOpenSyncStatus}
                >
                  <Pill tone="success">Synced</Pill>
                </button>
              </div>
              <span className="topbar-badge-divider" aria-hidden="true" />
              <div id="topbar-context" className="topbar-badge-group topbar-badge-group-context" aria-label="Active context">
                <button
                  type="button"
                  className="topbar-pill-button"
                  title="Open Settings and scroll to the Settings panel"
                  aria-label={`${activeScopeLabel}. Open Settings and scroll to the Settings panel`}
                  onClick={onOpenSettings}
                >
                  <Pill tone="neutral">{activeScopeLabel}</Pill>
                </button>
                <button
                  type="button"
                  className="topbar-pill-button"
                  title="Open Settings and scroll to AI providers"
                  aria-label={`${provider}. Open Settings and scroll to AI providers`}
                  onClick={onOpenAiProviders}
                >
                  <Pill tone="neutral">{provider}</Pill>
                </button>
                <button
                  type="button"
                  className="topbar-pill-button"
                  title="Open Settings and scroll to the Settings panel"
                  aria-label={`${role}. Open Settings and scroll to the Settings panel`}
                  onClick={onOpenSettings}
                >
                  <Pill tone="accent">{role}</Pill>
                </button>
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="topbar-info-button"
            aria-expanded={isExpanded}
            aria-controls="topbar-context"
            aria-label={isExpanded ? 'Hide topbar details' : 'Show topbar details'}
            title={isExpanded ? 'Hide details' : 'Show details'}
            onClick={() => setIsExpanded((value) => !value)}
          >
            <InfoIcon />
          </button>
          {showStatsToggle ? (
            <button
              type="button"
              className={`topbar-info-button topbar-stats-button ${showStatsHeaders ? '' : 'topbar-button-muted'}`}
              aria-pressed={showStatsHeaders}
              aria-label={showStatsHeaders ? 'Hide stats headers' : 'Show stats headers'}
              title={showStatsHeaders ? 'Hide stats headers' : 'Show stats headers'}
              onClick={onToggleStatsHeader}
            >
              <StatsToggleIcon />
            </button>
          ) : null}
          {hasRightPanel ? (
            <button
              type="button"
              className={`topbar-info-button topbar-help-button ${showRightPanel ? '' : 'topbar-button-muted'}`}
              aria-expanded={showRightPanel}
              aria-controls="panel-right"
              aria-label={showRightPanel ? 'Hide right panel' : 'Show right panel'}
              title={showRightPanel ? 'Hide right panel' : 'Show right panel'}
              onClick={onToggleRightPanel}
            >
              <QuestionIcon />
            </button>
          ) : null}
          {isMobileViewport ? (
            <button
              type="button"
              className="topbar-info-button topbar-menu-button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="app-sidebar"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              title={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={onToggleMobileMenu}
            >
              <MenuIcon />
            </button>
          ) : null}
        </div>
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
    clearEntraSettings,
    clearProviderSecrets,
    clearWorkerSettings,
    entraSettings,
    explorerRows,
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
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false)
  const [gettingStartedOpen, setGettingStartedOpen] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('deepvault_sidebar_collapsed') === 'true')
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => readIsMobileViewport())
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [rightPanelState, setRightPanelState] = useState<RightPanelState>(() => readRightPanelState())
  const [pendingScrollTarget, setPendingScrollTarget] = useState<TopbarScrollTarget | null>(null)
  const [statsHeaderState, setStatsHeaderState] = useState<StatsHeaderState>(() => readStatsHeaderState())

  useEffect(() => {
    if (!hasPendingUpdate) {
      setUpdateBannerDismissed(false)
    }
  }, [hasPendingUpdate])

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
    if (!pendingScrollTarget) {
      return
    }

    const selectors: Record<TopbarScrollTarget, string> = {
      'settings-runtime': '#settings-runtime-panel',
      'settings-ai-providers': '#settings-ai-providers-panel',
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

  const updateApp = async () => {
    await updateServiceWorker(true)
    setUpdateBannerDismissed(true)
  }

  const closeGettingStarted = () => {
    setGettingStartedOpen(false)
  }

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
  const showKpiGrid = (activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats') ? statsHeaderState[activeTab] : false
  const showStatsToggle = activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats'
  const toggleSidebar = () => setIsSidebarCollapsed((value) => !value)
  const toggleMobileMenu = () => {
    if (isMobileViewport) {
      setIsMobileMenuOpen((value) => !value)
      return
    }
    setIsSidebarCollapsed((value) => !value)
  }
  const closeMobileMenu = () => setIsMobileMenuOpen(false)
  const hasRightPanel = activeTab === 'explorer' || activeTab === 'bishop' || activeTab === 'ai-stats'
  const showRightPanel = hasRightPanel ? rightPanelState[activeTab] : false
  const toggleRightPanel = () => {
    if (!hasRightPanel) return
    setRightPanelState((current) => ({ ...current, [activeTab]: !current[activeTab] }))
  }
  const openSettingsPanel = (target: TopbarScrollTarget) => {
    setActiveTab('settings')
    setPendingScrollTarget(target)
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
    if (activeTab !== 'settings' && activeTab !== 'sync' && activeTab !== 'ai-stats') {
      return
    }
    setStatsHeaderState((current) => ({ ...current, [activeTab]: !current[activeTab] }))
  }
  const currentStatsHeadersVisible = activeTab === 'settings' || activeTab === 'sync' || activeTab === 'ai-stats' ? statsHeaderState[activeTab] : false

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
        hasPendingUpdate={hasPendingUpdate}
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
        update={updateApp}
      />

      <main className="main-content">
        <AppTopbar
          activeScopeLabel={activeScopeLabel}
          hasRightPanel={hasRightPanel}
          isMobileViewport={isMobileViewport}
          isMobileMenuOpen={isMobileMenuOpen}
          liveStateDetail={liveState.detail}
          liveStateLabel={liveState.label}
          liveStateTone={liveState.tone}
          onOpenAiProviders={() => openSettingsPanel('settings-ai-providers')}
          onOpenSettings={() => openSettingsPanel('settings-runtime')}
          onOpenSyncStatus={openSyncStatus}
          onToggleStatsHeader={toggleStatsHeader}
          onToggleRightPanel={toggleRightPanel}
          onToggleMobileMenu={toggleMobileMenu}
          provider={provider}
          role={role}
          showRightPanel={showRightPanel}
          showStatsHeaders={currentStatsHeadersVisible}
          showStatsToggle={showStatsToggle}
        />

        {hasPendingUpdate && !updateBannerDismissed ? (
          <section className="update-banner" aria-live="polite">
            <div className="update-banner-copy">
              <strong>Une nouvelle version est disponible</strong>
              <span>Le bouton de mise à jour se trouve dans le menu.</span>
            </div>
          </section>
        ) : null}

        {showKpiGrid ? (
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
        ) : null}

        {activeTab === 'settings' ? (
          <ErrorBoundary fallback={<div className="empty-state">Settings panel failed to render.</div>}>
            <SettingsPanel
              activeScopeLabel={activeScopeLabel}
              corpusProviders={corpusProviders}
              entraSettings={entraSettings}
              providerSecrets={providerSecrets}
              workerSettings={workerSettings}
              onClear={clearProviderSecrets}
              onClearEntra={clearEntraSettings}
              onClearWorker={clearWorkerSettings}
              onEntraChange={setEntraSetting}
              onKeyChange={setProviderSecret}
              onProviderChange={(value) => setProvider(value)}
              onRoleChange={(value) => setRole(value)}
              onSiteFilterChange={setSiteFilter}
              onWorkerChange={setWorkerSetting}
              provider={provider}
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
              role={role}
              selectedMessage={selectedMessage}
              showRightPanel={showRightPanel}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'sync' ? (
          <ErrorBoundary fallback={<div className="empty-state">Sync panel failed to render.</div>}>
            <SyncPanel
              scopedCorpusSummary={scopedCorpusSummary}
              scopedSiteSummaries={scopedSiteSummaries}
              scopedSyncOverview={scopedSyncOverview}
              syncOperations={syncOperations}
              workerSettings={workerSettings}
            />
          </ErrorBoundary>
        ) : null}

        {activeTab === 'ai-stats' ? (
          <ErrorBoundary fallback={<div className="empty-state">AI View panel failed to render.</div>}>
            <AIStatsPanel messages={messages} showRightPanel={showRightPanel} />
          </ErrorBoundary>
        ) : null}

        <footer className="page-footer" aria-label="Site footer">
          <span>Nexus · v{version} · © {new Date().getFullYear()}</span>
        </footer>
      </main>

      <GettingStartedModal onClose={closeGettingStarted} open={gettingStartedOpen} />
    </div>
  )
}
