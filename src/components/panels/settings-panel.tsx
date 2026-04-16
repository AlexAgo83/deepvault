import { useEffect, useState } from 'react'
import type { EntraSettings } from '../../hooks/useEntraSettings'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { WorkerSettings } from '../../hooks/useWorkerSettings'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'
import { SettingsChangelogPanel } from './settings-changelog-panel'

type SettingsView = 'runtime' | 'sharepoint' | 'ai-providers' | 'worker'

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string; detail: string }> = [
  { id: 'runtime', label: 'Runtime', detail: 'Role, site scope, provider, and data mode' },
  { id: 'sharepoint', label: 'SharePoint', detail: 'Entra app, tenant, secret, and target sites' },
  { id: 'ai-providers', label: 'AI providers', detail: 'Browser-scoped model keys and provider readiness' },
  { id: 'worker', label: 'Worker', detail: 'Worker mode, endpoint, timeout, and fallback' },
]

export function SettingsPanel({
  corpusProviders,
  entraSettings,
  providerSecrets,
  workerSettings,
  onClear,
  onClearEntra,
  onClearWorker,
  onEntraChange,
  onKeyChange,
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
  corpusProviders: AppModel['corpusProviders']
  entraSettings: EntraSettings
  providerSecrets: ProviderSecrets
  workerSettings: WorkerSettings
  onClear: () => void
  onClearEntra: () => void
  onClearWorker: () => void
  onEntraChange: (_key: keyof EntraSettings, _value: string) => void
  onKeyChange: (_provider: 'openai' | 'gemini' | 'anthropic', _value: string) => void
  onProviderChange: (_value: ProviderId) => void
  onRoleChange: (_value: UserRole) => void
  onSiteFilterChange: (_value: string) => void
  onWorkerChange: <K extends keyof WorkerSettings>(_key: K, _value: WorkerSettings[K]) => void
  showRightPanel: boolean
  provider: string
  requestedView?: 'runtime' | 'ai-providers' | null
  role: string
  siteFilter: string
  siteSummaries: AppModel['siteSummaries']
}) {
  const [settingsView, setSettingsView] = useState<SettingsView>('runtime')

  useEffect(() => {
    if (!requestedView) {
      return
    }

    setSettingsView(requestedView)
  }, [requestedView])

  return (
    <section className={`settings-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <div className="settings-main-column">
        <article className="panel settings-view-switcher" aria-label="Settings View">
          <div className="sync-view-switcher-head">
            <div>
              <h2>Settings</h2>
              <p>Switch between runtime controls, SharePoint credentials, AI provider keys, and worker configuration from one screen.</p>
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
                <span className="sync-subnav-label">{label}</span>
                <span className="sync-subnav-detail">{detail}</span>
                <span className="sync-subnav-status">
                  {id === 'runtime' ? role : null}
                  {id === 'sharepoint' ? (entraSettings.appId && entraSettings.tenantId ? 'Configured' : 'Missing fields') : null}
                  {id === 'ai-providers' ? 'Local keys' : null}
                  {id === 'worker' ? workerSettings.workerMode : null}
                </span>
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
                </div>

                <div className="settings-actions">
                  <button type="button" className="secondary-button" title="Reset worker settings to defaults" onClick={onClearWorker}>
                    Reset worker settings
                  </button>
                  <span className="settings-actions-filler" aria-hidden="true" />
                </div>
              </section>
            ) : null}
          </div>
        </article>
      </div>

      {showRightPanel ? <SettingsChangelogPanel /> : null}

    </section>
  )
}
