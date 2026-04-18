import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { EntraSettings } from '../../hooks/useEntraSettings'
import type { BishopSettings } from '../../hooks/useBishopSettings'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { WorkerSettings } from '../../hooks/useWorkerSettings'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'
import { downloadTextFile } from '../../lib/file-download'
import {
  buildSettingsTransferPayload,
  parseSettingsTransferPayload,
  type SettingsTransferPayload,
} from '../../lib/settings-transfer'
import { ConfirmModal } from '../confirm-modal'
import { SettingsChangelogPanel } from './settings-changelog-panel'

type SettingsView = 'runtime' | 'assistant-context' | 'sharepoint' | 'ai-providers' | 'worker'

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string; detail: string }> = [
  { id: 'worker', label: 'Worker', detail: 'Worker mode, endpoint, timeout, and fallback' },
  { id: 'runtime', label: 'Runtime', detail: 'Role, site scope, provider, and data mode' },
  { id: 'sharepoint', label: 'SharePoint', detail: 'Entra app, tenant, secret, and target sites' },
  { id: 'assistant-context', label: 'Assistant context', detail: 'Grounded source count, candidate pool, and reused history' },
  { id: 'ai-providers', label: 'AI providers', detail: 'Browser-scoped model keys and provider readiness' },
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

export function SettingsPanel({
  bishopSettings,
  conversationContextEnabled,
  corpusProviders,
  entraSettings,
  providerSecrets,
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
  conversationContextEnabled: boolean
  corpusProviders: AppModel['corpusProviders']
  entraSettings: EntraSettings
  providerSecrets: ProviderSecrets
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

  useEffect(() => {
    if (!requestedView) {
      return
    }

    setSettingsView(requestedView)
  }, [requestedView])

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
      setImportError(error instanceof Error ? error.message : 'Configuration import failed.')
    }
  }

  return (
    <section className={`settings-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <div className="settings-main-column">
        <article className="panel settings-view-switcher" aria-label="Settings View">
          <div className="sync-view-switcher-head">
            <div>
              <h2>Settings</h2>
              <p>Switch between runtime controls, a dedicated assistant-context screen, SharePoint credentials, AI provider keys, and worker configuration from one screen.</p>
            </div>
          </div>

          <nav className="settings-subnav" aria-label="Settings View">
            {SETTINGS_VIEWS.map(({ id, label, detail }) => (
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

        <article className="panel settings-panel settings-main-panel" aria-label="Settings section">
          <div className="settings-main-scroll">
            {settingsView === 'runtime' ? (
              <section id="settings-runtime-panel" className="settings-section settings-runtime-panel">
                <h3 className="sr-only">Runtime</h3>

                <div className="settings-form-grid settings-runtime-form">
                  <label className="settings-field">
                    <span>Role</span>
                    <select value={role} title="Select the active access role" onChange={(event) => onRoleChange(event.target.value as UserRole)}>
                      <option value="analyst">analyst</option>
                      <option value="admin">admin</option>
                      <option value="guest">guest</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Data mode</span>
                    <select
                      value={entraSettings.dataMode}
                      title="Override the app corpus mode and DEEPVAULT_DATA_MODE for ops scripts"
                      onChange={(event) => onEntraChange('dataMode', event.target.value)}
                    >
                      <option value="">env default</option>
                      <option value="mock">mock</option>
                      <option value="live">live</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Provider</span>
                    <select value={provider} title="Select the Bishop provider" onChange={(event) => onProviderChange(event.target.value as ProviderId)}>
                      {corpusProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="settings-field settings-scope-field">
                    <span>Site scope</span>
                    <div className="site-list">
                      <button
                        type="button"
                        className={`site-chip ${siteFilter === 'all' ? 'site-chip-active' : ''}`}
                        title="Show all sites"
                        onClick={() => onSiteFilterChange('all')}
                      >
                        All sites
                      </button>
                      {siteSummaries.map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          className={`site-chip ${siteFilter === site.id ? 'site-chip-active' : ''}`}
                          title={`Filter to ${site.name}`}
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
                    <span>Keep conversation context</span>
                    <select
                      value={conversationContextEnabled ? 'enabled' : 'disabled'}
                      title="Reuse previous Bishop turns in the prompt"
                      onChange={(event) => onConversationContextEnabledChange(event.target.value === 'enabled')}
                    >
                      <option value="enabled">enabled</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>Grounded sources</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={bishopSettings.sourceLimit}
                      onChange={(event) => onBishopChange('sourceLimit', Number(event.target.value) || 1)}
                    />
                    <small>The final number of sources injected into the grounded prompt.</small>
                  </label>

                  <label className="settings-field">
                    <span>Candidate pool</span>
                    <input
                      type="number"
                      min={bishopSettings.sourceLimit}
                      max={20}
                      value={bishopSettings.candidateLimit}
                      onChange={(event) => onBishopChange('candidateLimit', Number(event.target.value) || bishopSettings.sourceLimit)}
                    />
                    <small>How many candidate documents are ranked before trimming to the final grounded sources.</small>
                  </label>

                  <label className="settings-field">
                    <span>History turns</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={bishopSettings.historyTurnLimit}
                      onChange={(event) => onBishopChange('historyTurnLimit', Number(event.target.value) || 0)}
                    />
                    <small>The number of previous Bishop turns reused when conversation context is enabled.</small>
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title="Reset Bishop context settings to their defaults" onClick={onClearBishop}>
                    Reset assistant context
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'sharepoint' ? (
              <section className="settings-section">
                <h3 className="sr-only">SharePoint / Entra ID</h3>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>App ID</span>
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
                    <span>Tenant ID</span>
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
                    <span>Client secret</span>
                    <input
                      type="password"
                      value={entraSettings.secretValue}
                      onChange={(event) => onEntraChange('secretValue', event.target.value)}
                      placeholder="Secret value"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Site URLs</span>
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
                    <span>Site names</span>
                    <input
                      type="text"
                      value={entraSettings.siteNames}
                      onChange={(event) => onEntraChange('siteNames', event.target.value)}
                      placeholder="Site Alpha,Site Beta"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title="Remove stored Entra settings from this browser" onClick={onClearEntra}>
                    Clear Entra settings
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'ai-providers' ? (
              <section id="settings-ai-providers-panel" className="settings-section settings-ai-providers-panel">
                <h3 className="sr-only">AI providers</h3>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>OpenAI API key</span>
                    <input
                      type="password"
                      value={providerSecrets.openaiApiKey}
                      onChange={(event) => onKeyChange('openai', event.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Gemini API key</span>
                    <input
                      type="password"
                      value={providerSecrets.geminiApiKey}
                      onChange={(event) => onKeyChange('gemini', event.target.value)}
                      placeholder="AIza..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Anthropic API key</span>
                    <input
                      type="password"
                      value={providerSecrets.anthropicApiKey}
                      onChange={(event) => onKeyChange('anthropic', event.target.value)}
                      placeholder="sk-ant-..."
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title="Remove stored provider API keys from this browser" onClick={onClear}>
                    Clear stored keys
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}

            {settingsView === 'worker' ? (
              <section className="settings-section">
                <h3 className="sr-only">Worker</h3>

                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Worker mode</span>
                    <select
                      value={workerSettings.workerMode}
                      title="Local uses the embedded Vite ops server. Remote connects to a dedicated worker endpoint."
                      onChange={(event) => onWorkerChange('workerMode', event.target.value as WorkerSettings['workerMode'])}
                    >
                      <option value="local">local</option>
                      <option value="remote">remote</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>Worker URL</span>
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
                    <span>Worker token</span>
                    <input
                      type="password"
                      value={workerSettings.workerToken}
                      disabled={workerSettings.workerMode === 'local'}
                      onChange={(event) => onWorkerChange('workerToken', event.target.value)}
                      placeholder="Bearer token for remote worker"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Timeout (s)</span>
                    <input
                      type="number"
                      value={workerSettings.workerTimeoutSeconds}
                      min={5}
                      max={300}
                      onChange={(event) => onWorkerChange('workerTimeoutSeconds', Math.max(5, Number(event.target.value)))}
                    />
                  </label>

                  <label className="settings-field">
                    <span>Fallback mode</span>
                    <select
                      value={workerSettings.workerFallbackMode}
                      title="Behavior when the worker is unreachable. read_only: use last published corpus. block: prevent ops. none: no fallback."
                      onChange={(event) => onWorkerChange('workerFallbackMode', event.target.value as WorkerSettings['workerFallbackMode'])}
                    >
                      <option value="read_only">read_only</option>
                      <option value="block">block</option>
                      <option value="none">none</option>
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>Analyze budget</span>
                    <input
                      type="number"
                      value={workerSettings.analyzeLimit}
                      min={1}
                      max={5000}
                      onChange={(event) => onWorkerChange('analyzeLimit', Math.max(1, Number(event.target.value) || 1))}
                    />
                    <small>Maximum number of documents `Analyze` will enrich in a single run before remaining candidates are marked stale.</small>
                  </label>
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title="Reset worker settings to defaults" onClick={onClearWorker}>
                    Reset worker settings
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>

                <div className="settings-transfer-card">
                  <div className="settings-transfer-copy">
                    <h4>Configuration transfer</h4>
                    <p>Export your local configuration to a JSON file or import a previously exported file to overwrite the current browser settings.</p>
                    <p className="settings-transfer-warning">
                      Warning: exported configuration files contain secrets in plaintext and must be handled as sensitive files.
                    </p>
                    {importError ? (
                      <p className="settings-transfer-error" role="alert">
                        {importError}
                      </p>
                    ) : null}
                  </div>

                  <div className="settings-actions settings-transfer-actions">
                    <button type="button" className="secondary-button" onClick={handleExportConfiguration}>
                      Export configuration
                    </button>
                    <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                      Import configuration
                    </button>
                    <input
                      ref={fileInputRef}
                      hidden
                      type="file"
                      accept="application/json,.json"
                      aria-label="Import configuration file"
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
          title="Import configuration"
          description="This will overwrite the current browser-stored settings, API keys, Entra values, worker settings, and runtime preferences."
          warning="The imported file is applied only after confirmation. Existing local values will be replaced."
          confirmLabel="Import and overwrite"
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
      reader.onerror = () => reject(new Error('Configuration import failed: could not read the selected file.'))
      reader.readAsText(file)
    })
