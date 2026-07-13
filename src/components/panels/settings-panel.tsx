import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { EntraSettings } from '../../hooks/useEntraSettings'
import type { BishopSettings } from '../../hooks/useBishopSettings'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { WorkerSettings } from '../../hooks/useWorkerSettings'
import type { WorkerHealthState } from '../../hooks/useWorkerHealth'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'
import { downloadTextFile } from '../../lib/file-download'
import {
  buildSettingsTransferPayload,
  parseSettingsTransferPayload,
  type SettingsTransferPayload,
} from '../../lib/settings-transfer'
import { Pill } from '../app-ui'
import { ConfirmModal } from '../confirm-modal'
import { SettingsChangelogPanel } from './settings-changelog-panel'
import { t } from '../../i18n'

type SettingsView = 'runtime' | 'assistant-context' | 'sharepoint' | 'ai-providers' | 'worker'

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string; detail: string }> = [
  { id: 'worker', label: t('settings.worker'), detail: t('settings.workerDetail') },
  { id: 'runtime', label: t('settings.runtime'), detail: t('settings.runtimeDetail') },
  { id: 'sharepoint', label: t('settings.sharePoint'), detail: t('settings.sharePointDetail') },
  { id: 'assistant-context', label: t('settings.assistantContext'), detail: t('settings.assistantContextDetail') },
  { id: 'ai-providers', label: t('settings.aiProviders'), detail: t('settings.aiProvidersDetail') },
]

function RuntimeSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 4v2.2M10 13.8V16M4 10h2.2M13.8 10H16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AgentSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="5.25" y="4.5" width="9.5" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 8.25h4M8 11.25h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SharePointSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.75 5.5h10.5v9h-10.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8.25h6M7 11.25h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function AIProvidersSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="7" cy="10" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="7" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13.5" cy="13" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.9 8.9 11.2 7.8M8.95 11.05l2.5 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function WorkerSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4.5" y="5.25" width="11" height="9.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 8.5h5M7.5 11.5h3.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function getSettingsViewIcon(view: SettingsView) {
  if (view === 'runtime') return <RuntimeSettingsIcon />
  if (view === 'assistant-context') return <AgentSettingsIcon />
  if (view === 'sharepoint') return <SharePointSettingsIcon />
  if (view === 'ai-providers') return <AIProvidersSettingsIcon />
  return <WorkerSettingsIcon />
}

const DEFAULT_WORKER_HEALTH: WorkerHealthState = {
  status: 'local',
  label: t('settings.localWorker'),
  detail: t('settings.localWorkerDetail'),
  tone: 'neutral',
}

export function SettingsPanel({
  bishopSettings,
  canSignOutHostedSession,
  conversationContextEnabled,
  corpusProviders,
  entraSettings,
  hostedIdentityLabel,
  hostedMode,
  isOperator,
  providerSecrets,
  workerHealth = DEFAULT_WORKER_HEALTH,
  workerSettings,
  onClear,
  onClearBishop,
  onClearEntra,
  onClearWorker,
  onBishopChange,
  onEntraChange,
  onKeyChange,
  onConversationContextEnabledChange,
  onProviderChange,
  onRoleChange,
  onSignOutHostedSession,
  onSiteFilterChange,
  onWorkerChange,
  showRightPanel,
  provider,
  requestedView,
  role,
  siteFilter,
  siteSummaries,
}: {
  bishopSettings: BishopSettings
  canSignOutHostedSession: boolean
  conversationContextEnabled: boolean
  corpusProviders: AppModel['corpusProviders']
  entraSettings: EntraSettings
  hostedIdentityLabel: string | null
  hostedMode: boolean
  isOperator: boolean
  providerSecrets: ProviderSecrets
  workerHealth?: WorkerHealthState
  workerSettings: WorkerSettings
  onClear: () => void
  onClearBishop: () => void
  onClearEntra: () => void
  onClearWorker: () => void
  onBishopChange: <K extends keyof BishopSettings>(_key: K, _value: BishopSettings[K]) => void
  onEntraChange: (_key: keyof EntraSettings, _value: string) => void
  onKeyChange: (_provider: 'openai' | 'gemini' | 'anthropic', _value: string) => void
  onConversationContextEnabledChange: (_value: boolean) => void
  onProviderChange: (_value: ProviderId) => void
  onRoleChange: (_value: UserRole) => void
  onSignOutHostedSession: () => Promise<void>
  onSiteFilterChange: (_value: string) => void
  onWorkerChange: <K extends keyof WorkerSettings>(_key: K, _value: WorkerSettings[K]) => void
  showRightPanel: boolean
  provider: string
  requestedView?: 'runtime' | 'assistant-context' | 'ai-providers' | 'worker' | null
  role: string
  siteFilter: string
  siteSummaries: AppModel['siteSummaries']
}) {
  const [settingsView, setSettingsView] = useState<SettingsView>('runtime')
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<SettingsTransferPayload | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const availableSettingsViews = SETTINGS_VIEWS.filter(({ id }) => (hostedMode ? id !== 'ai-providers' : true))

  useEffect(() => {
    if (!requestedView) {
      return
    }

    if (hostedMode && requestedView === 'ai-providers') {
      setSettingsView('runtime')
      return
    }

    setSettingsView(requestedView)
  }, [hostedMode, requestedView])

  useEffect(() => {
    if (hostedMode && settingsView === 'ai-providers') {
      setSettingsView('runtime')
    }
  }, [hostedMode, settingsView])

  const handleExportConfiguration = () => {
    const payload = buildSettingsTransferPayload({
      role: role as UserRole,
      provider: provider as ProviderId,
      siteFilter,
      conversationContextEnabled,
      bishopSettings,
      providerSecrets,
      entraSettings,
      workerSettings,
    })

    downloadTextFile(
      `deepvault-settings-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  const applyImportedConfiguration = (payload: SettingsTransferPayload) => {
    onRoleChange(payload.runtime.role)
    onProviderChange(payload.runtime.provider)
    onSiteFilterChange(payload.runtime.siteFilter || 'all')
    onConversationContextEnabledChange(payload.runtime.conversationContextEnabled)

    onBishopChange('sourceLimit', payload.bishopSettings.sourceLimit)
    onBishopChange('candidateLimit', payload.bishopSettings.candidateLimit)
    onBishopChange('historyTurnLimit', payload.bishopSettings.historyTurnLimit)

    onKeyChange('openai', payload.providerSecrets.openaiApiKey)
    onKeyChange('gemini', payload.providerSecrets.geminiApiKey)
    onKeyChange('anthropic', payload.providerSecrets.anthropicApiKey)

    onEntraChange('appId', payload.entraSettings.appId)
    onEntraChange('tenantId', payload.entraSettings.tenantId)
    onEntraChange('secretValue', payload.entraSettings.secretValue)
    onEntraChange('sites', payload.entraSettings.sites)
    onEntraChange('siteNames', payload.entraSettings.siteNames)
    onEntraChange('dataMode', payload.entraSettings.dataMode)

    onWorkerChange('workerMode', payload.workerSettings.workerMode)
    onWorkerChange('workerUrl', payload.workerSettings.workerUrl)
    onWorkerChange('workerToken', payload.workerSettings.workerToken)
    onWorkerChange('workerTimeoutSeconds', payload.workerSettings.workerTimeoutSeconds)
    onWorkerChange('workerFallbackMode', payload.workerSettings.workerFallbackMode)
    onWorkerChange('analyzeLimit', payload.workerSettings.analyzeLimit)
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await readFileAsText(file)) as unknown
      const payload = parseSettingsTransferPayload(parsed)
      setImportError(null)
      setPendingImport(payload)
    } catch (error) {
      setPendingImport(null)
      setImportError(error instanceof Error ? error.message : t('settings.importFailed'))
    }
  }

  return (
    <section className={`settings-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <div className="settings-main-column">
        <article className="panel settings-view-switcher" aria-label={t('settings.navigation')}>
          <div className="sync-view-switcher-head">
            <div>
              <h2>{t('settings.title')}</h2>
              <p>{t('settings.description')}</p>
            </div>
          </div>

          <nav className="settings-subnav" aria-label={t('settings.navigation')}>
            {availableSettingsViews.map(({ id, label, detail }) => (
              <button
                key={id}
                type="button"
                className={`settings-subnav-item ${settingsView === id ? 'settings-subnav-item-active' : ''}`}
                aria-label={label}
                aria-current={settingsView === id ? 'page' : undefined}
                title={detail}
                onClick={() => setSettingsView(id)}
              >
                <span className="settings-subnav-title-row">
                  <span className="settings-subnav-icon" aria-hidden="true">{getSettingsViewIcon(id)}</span>
                  <span className="sync-subnav-label">{label}</span>
                </span>
                <span className="sync-subnav-detail">{detail}</span>
              </button>
            ))}
          </nav>
        </article>

        <article className="panel settings-panel settings-main-panel" aria-label={t('settings.section')}>
          <div className="settings-main-scroll">
            {settingsView === 'runtime' ? (
              <section id="settings-runtime-panel" className="settings-section settings-runtime-panel">
                <h3 className="sr-only">{t('settings.runtime')}</h3>

                {hostedMode ? (
                  <div className="settings-hosted-banner" aria-label={t('settings.hostedSession')}>
                    <div className="settings-hosted-copy">
                      <div className="settings-hosted-title-row">
                        <strong>{t('settings.hostedSession')}</strong>
                        <Pill tone="accent">{t('settings.shared')}</Pill>
                      </div>
                      <p>{hostedIdentityLabel ? t('settings.signedInAs', { identity: hostedIdentityLabel }) : t('settings.signedInShared')}</p>
                      <p>{isOperator ? t('settings.operatorActive') : t('settings.memberActive')}</p>
                    </div>
                    {canSignOutHostedSession ? (
                      <button type="button" className="secondary-button secondary-button-sm" onClick={() => void onSignOutHostedSession()}>
                        {t('settings.signOut')}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="settings-form-grid settings-runtime-form">
                  <label className="settings-field">
                    <span>{t('settings.role')}</span>
                    <select value={role} title={t('settings.roleTitle')} onChange={(event) => onRoleChange(event.target.value as UserRole)}>
                      <option value="analyst">analyst</option>
                      <option value="admin">admin</option>
                      <option value="guest">guest</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{t('settings.dataMode')}</span>
                    <select
                      value={entraSettings.dataMode}
                      title={t('settings.dataModeTitle')}
                      onChange={(event) => onEntraChange('dataMode', event.target.value)}
                    >
                      <option value="">{t('settings.environmentDefault')}</option>
                      <option value="mock">mock</option>
                      <option value="live">live</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{t('settings.provider')}</span>
                    <select value={provider} title={t('settings.providerTitle')} onChange={(event) => onProviderChange(event.target.value as ProviderId)}>
                      {corpusProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings-field settings-scope-field">
                    <span>{t('settings.siteScope')}</span>
                    <div className="site-list">
                      <button
                        type="button"
                        className={`site-chip ${siteFilter === 'all' ? 'site-chip-active' : ''}`}
                        title={t('settings.allSitesTitle')}
                        onClick={() => onSiteFilterChange('all')}
                      >
                        {t('settings.allSites')}
                      </button>
                      {siteSummaries.map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          className={`site-chip ${siteFilter === site.id ? 'site-chip-active' : ''}`}
                          title={t('settings.filterSite', { site: site.name })}
                          onClick={() => onSiteFilterChange(site.id)}
                        >
                          {site.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-runtime-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'assistant-context' ? (
              <section className="settings-section">
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>{t('settings.keepContext')}</span>
                    <select
                      value={conversationContextEnabled ? 'enabled' : 'disabled'}
                      title={t('settings.keepContextTitle')}
                      onChange={(event) => onConversationContextEnabledChange(event.target.value === 'enabled')}
                    >
                      <option value="enabled">{t('settings.enabled')}</option>
                      <option value="disabled">{t('settings.disabled')}</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.groundedSources')}</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={bishopSettings.sourceLimit}
                      onChange={(event) => onBishopChange('sourceLimit', Number(event.target.value) || 1)}
                    />
                    <small>{t('settings.groundedSourcesHelp')}</small>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.candidatePool')}</span>
                    <input
                      type="number"
                      min={bishopSettings.sourceLimit}
                      max={20}
                      value={bishopSettings.candidateLimit}
                      onChange={(event) => onBishopChange('candidateLimit', Number(event.target.value) || bishopSettings.sourceLimit)}
                    />
                    <small>{t('settings.candidatePoolHelp')}</small>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.historyTurns')}</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={bishopSettings.historyTurnLimit}
                      onChange={(event) => onBishopChange('historyTurnLimit', Number(event.target.value) || 0)}
                    />
                    <small>{t('settings.historyTurnsHelp')}</small>
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title={t('settings.resetContextTitle')} onClick={onClearBishop}>
                    {t('settings.resetContext')}
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'sharepoint' ? (
              <section className="settings-section">
                <h3 className="sr-only">{t('settings.entraTitle')}</h3>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>{t('settings.appId')}</span>
                    <input
                      type="text"
                      value={entraSettings.appId}
                      onChange={(event) => onEntraChange('appId', event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.tenantId')}</span>
                    <input
                      type="text"
                      value={entraSettings.tenantId}
                      onChange={(event) => onEntraChange('tenantId', event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.clientSecret')}</span>
                    <input
                      type="password"
                      value={entraSettings.secretValue}
                      onChange={(event) => onEntraChange('secretValue', event.target.value)}
                      placeholder={t('settings.secretPlaceholder')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.siteUrls')}</span>
                    <input
                      type="text"
                      value={entraSettings.sites}
                      onChange={(event) => onEntraChange('sites', event.target.value)}
                      placeholder="https://tenant.sharepoint.com/sites/A,https://..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.siteNames')}</span>
                    <input
                      type="text"
                      value={entraSettings.siteNames}
                      onChange={(event) => onEntraChange('siteNames', event.target.value)}
                      placeholder={t('settings.siteNamesPlaceholder')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title={t('settings.clearEntraTitle')} onClick={onClearEntra}>
                    {t('settings.clearEntra')}
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'ai-providers' && !hostedMode ? (
              <section id="settings-ai-providers-panel" className="settings-section settings-ai-providers-panel">
                <h3 className="sr-only">{t('settings.aiProviders')}</h3>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>{t('settings.apiKey', { provider: 'OpenAI' })}</span>
                    <input
                      aria-label={t('settings.apiKey', { provider: 'OpenAI' })}
                      type="password"
                      value={providerSecrets.openaiApiKey}
                      onChange={(event) => onKeyChange('openai', event.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small className="settings-warning-text">{t('settings.plaintextWarning')}</small>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.apiKey', { provider: 'Gemini' })}</span>
                    <input
                      aria-label={t('settings.apiKey', { provider: 'Gemini' })}
                      type="password"
                      value={providerSecrets.geminiApiKey}
                      onChange={(event) => onKeyChange('gemini', event.target.value)}
                      placeholder="AIza..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small className="settings-warning-text">{t('settings.plaintextWarning')}</small>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.apiKey', { provider: 'Anthropic' })}</span>
                    <input
                      aria-label={t('settings.apiKey', { provider: 'Anthropic' })}
                      type="password"
                      value={providerSecrets.anthropicApiKey}
                      onChange={(event) => onKeyChange('anthropic', event.target.value)}
                      placeholder="sk-ant-..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small className="settings-warning-text">{t('settings.plaintextWarning')}</small>
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title={t('settings.clearKeysTitle')} onClick={onClear}>
                    {t('settings.clearKeys')}
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'worker' ? (
              <section className="settings-section">
                <h3 className="sr-only">{t('settings.worker')}</h3>

                <div className="settings-worker-health" role="status" aria-live="polite">
                  <div className="settings-worker-health-head">
                    <span>{t('settings.startupHealth')}</span>
                    <Pill tone={workerHealth.tone}>{workerHealth.label}</Pill>
                  </div>
                  <p>{workerHealth.detail}</p>
                </div>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>{t('settings.workerMode')}</span>
                    <select
                      value={workerSettings.workerMode}
                      title={t('settings.workerModeTitle')}
                      onChange={(event) => onWorkerChange('workerMode', event.target.value as WorkerSettings['workerMode'])}
                    >
                      <option value="local">local</option>
                      <option value="remote">remote</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.workerUrl')}</span>
                    <input
                      type="text"
                      value={workerSettings.workerUrl}
                      disabled={workerSettings.workerMode === 'local'}
                      onChange={(event) => onWorkerChange('workerUrl', event.target.value)}
                      placeholder="https://worker.example.com"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.workerToken')}</span>
                    <input
                      type="password"
                      value={workerSettings.workerToken}
                      disabled={workerSettings.workerMode === 'local'}
                      onChange={(event) => onWorkerChange('workerToken', event.target.value)}
                      placeholder={t('settings.workerTokenPlaceholder')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.timeout')}</span>
                    <input
                      type="number"
                      value={workerSettings.workerTimeoutSeconds}
                      min={5}
                      max={300}
                      onChange={(event) => onWorkerChange('workerTimeoutSeconds', Math.max(5, Number(event.target.value)))}
                    />
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.fallbackMode')}</span>
                    <select
                      value={workerSettings.workerFallbackMode}
                      title={t('settings.fallbackModeTitle')}
                      onChange={(event) => onWorkerChange('workerFallbackMode', event.target.value as WorkerSettings['workerFallbackMode'])}
                    >
                      <option value="read_only">read_only</option>
                      <option value="block">block</option>
                      <option value="none">none</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>{t('settings.analyzeBudget')}</span>
                    <input
                      type="number"
                      value={workerSettings.analyzeLimit}
                      min={1}
                      max={5000}
                      onChange={(event) => onWorkerChange('analyzeLimit', Math.max(1, Number(event.target.value) || 1))}
                    />
                    <small>{t('settings.analyzeBudgetHelp')}</small>
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title={t('settings.resetWorkerTitle')} onClick={onClearWorker}>
                    {t('settings.resetWorker')}
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>

                <div className="settings-transfer-card">
                  <div className="settings-transfer-copy">
                    <h4>{t('settings.transferTitle')}</h4>
                    <p>{t('settings.transferDescription')}</p>
                    <p className="settings-transfer-warning">
                      {t('settings.transferWarning')}
                    </p>
                    {importError ? (
                      <p className="settings-transfer-error" role="alert">
                        {importError}
                      </p>
                    ) : null}
                  </div>

                  <div className="settings-actions settings-transfer-actions">
                    <button type="button" className="secondary-button" onClick={handleExportConfiguration}>
                      {t('settings.exportConfiguration')}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                      {t('settings.importConfiguration')}
                    </button>
                    <input
                      ref={fileInputRef}
                      hidden
                      type="file"
                      accept="application/json,.json"
                      aria-label={t('settings.importFileLabel')}
                      onChange={(event) => void handleImportFile(event)}
                    />
                    <span className="settings-actions-filler" aria-hidden="true" />
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </article>
      </div>

      {showRightPanel ? <SettingsChangelogPanel /> : null}
      {pendingImport ? (
        <ConfirmModal
          title={t('settings.importTitle')}
          description={t('settings.importDescription')}
          warning={t('settings.importWarning')}
          confirmLabel={t('settings.importConfirm')}
          onConfirm={() => {
            applyImportedConfiguration(pendingImport)
            setPendingImport(null)
            setImportError(null)
          }}
          onCancel={() => setPendingImport(null)}
        />
      ) : null}

    </section>
  )
}
  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error(t('settings.readFailed')))
      reader.readAsText(file)
    })
