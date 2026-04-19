import { useEffect, useState, type ReactElement } from 'react'
import { Pill } from './app-ui'
import type { Theme } from '../hooks/useTheme'
import type { AppModel, AppTab } from '../hooks/useAppModel'

type NavSection = {
  label: string
  ariaLabel: string
  items: ReadonlyArray<{ id: AppTab; label: string; icon: () => ReactElement }>
}

export type RightPanelState = Record<Exclude<AppTab, 'sync'>, boolean>
export type SettingsShortcutTarget = 'runtime' | 'ai-providers' | null

const TOPBAR_DETAILS_STORAGE_KEY = 'deepvault_topbar_details_expanded'

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
      { id: 'artifacts', label: 'Artifacts', icon: ArtifactsIcon },
      { id: 'ai-stats', label: 'AI View', icon: StatsIcon },
      { id: 'settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

function readTopbarDetailsState(): boolean {
  try {
    const raw = localStorage.getItem(TOPBAR_DETAILS_STORAGE_KEY)
    if (raw === null) return true
    return raw === 'true'
  } catch {
    return true
  }
}

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
      <path
        d="M6 14.5c-1.1 0-2-.9-2-2v-5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2H9l-3 2v-2H6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M7.2 8.5h5.6M7.2 11h3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <ellipse cx="10" cy="5.5" rx="4.8" ry="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.2 5.5v9c0 .83 2.15 1.5 4.8 1.5s4.8-.67 4.8-1.5v-9" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.2 10c0 .83 2.15 1.5 4.8 1.5s4.8-.67 4.8-1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.5 6h13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M3.5 10h13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M3.5 14h13" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="7.5" cy="6" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.5" cy="10" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7.5" cy="14" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 14.5h11" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M6.2 13.8V10m3.3 3.8V6.8m3.3 7V8.7m3.3 5.1V5.2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M13.7 13.9a5.6 5.6 0 0 1-7.5-7.6 6 6 0 1 0 7.5 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  )
}

function PwaInstallIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 3.5v7.7" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m7.3 8.8 2.7 2.7 2.7-2.7" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4.5" y="12.3" width="11" height="3.2" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 8.5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 6h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7.5 7.5a2.7 2.7 0 1 1 4.3 2.2c-.8.55-1.3 1.2-1.3 2.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14.8h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function StatsToggleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 13.5h9" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M7 13V10.5m2.5 2.5V7.5m2.5 5.5V9.5m2.5 3.5V6.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function ArtifactsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.5 3.5h7l3 3v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M12.5 3.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.5 10.5h5M7.5 13h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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

export function AppSidebar({
  activeTab,
  canInstall,
  install,
  isStandalone,
  isCollapsed,
  isMobileViewport,
  isMobileMenuOpen,
  theme,
  onToggleSidebar,
  onTabChange,
  onToggleTheme,
  onRequestCloseMobileMenu,
  showArtifactsTab,
}: {
  activeTab: AppTab
  canInstall: boolean
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
  showArtifactsTab: boolean
}) {
  const navSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => (item.id === 'artifacts' ? showArtifactsTab : true)),
  }))

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

      {navSections.map((section) => (
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

      {!isStandalone && canInstall ? (
        <div className="sidebar-section">
          <nav className="nav-list" aria-label="App actions">
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

      <div className="sidebar-version" aria-label="App version">
        <span>Nexus</span>
        <span>v{__APP_VERSION__}</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </aside>
  )
}

export function AppTopbar({
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
  hostedIdentityLabel,
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
  hostedIdentityLabel: string | null
  onOpenAiProviders: () => void
  onOpenSettings: () => void
  onOpenSyncStatus: () => void
  onToggleRightPanel: () => void
  onToggleMobileMenu: () => void
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => readTopbarDetailsState())

  useEffect(() => {
    localStorage.setItem(TOPBAR_DETAILS_STORAGE_KEY, String(isExpanded))
  }, [isExpanded])

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
                {hostedIdentityLabel ? (
                  <button
                    type="button"
                    className="topbar-pill-button"
                    title="Open Settings and view the hosted session"
                    aria-label={`${hostedIdentityLabel}. Open Settings and view the hosted session`}
                    onClick={onOpenSettings}
                  >
                    <Pill tone="neutral">{hostedIdentityLabel}</Pill>
                  </button>
                ) : null}
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

export function AppToolbar({
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
