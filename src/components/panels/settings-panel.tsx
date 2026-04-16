import { SectionHeading, StatCard } from '../app-ui'
import type { EntraSettings } from '../../hooks/useEntraSettings'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { WorkerSettings } from '../../hooks/useWorkerSettings'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'
import { SettingsChangelogPanel } from './settings-changelog-panel'

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
  role: string
  siteFilter: string
  siteSummaries: AppModel['siteSummaries']
}) {
  const configuredCount = [providerSecrets.openaiApiKey, providerSecrets.geminiApiKey, providerSecrets.anthropicApiKey].filter(Boolean).length

  return (
    <section className={`settings-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <article className="panel settings-panel settings-main-panel" aria-label="Settings">
        <h2 className="sr-only">Settings</h2>

        <div className="settings-main-scroll">
          <section id="settings-runtime-panel" className="settings-section settings-runtime-panel">
            <SectionHeading
              title="Runtime"
              subtitleTooltip="Controls shared by Explorer, Bishop, and Knowledge. Use the topbar shortcuts to jump here."
            />

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

          <section className="settings-section">
            <SectionHeading
              title="SharePoint / Entra ID"
              subtitleTooltip="Browser-scoped local settings persisted on this device for worker jobs and live export. Treat them as local development credentials, not server-side secrets."
            />

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
            </div>
          </section>

          <section id="settings-ai-providers-panel" className="settings-section settings-ai-providers-panel">
            <SectionHeading
              title="AI providers"
              subtitleTooltip="Browser-scoped local keys persisted on this device and used directly by Bishop for provider calls and by evaluate jobs when needed."
            />

            <div className="kpi-grid compact settings-summary-grid">
              <StatCard label="Configured providers" value={configuredCount} note="Browser-persisted keys for local development." />
              <StatCard label="OpenAI" value={providerSecrets.openaiApiKey ? 'Set' : 'Missing'} note="Used when provider is openai." />
              <StatCard label="Gemini" value={providerSecrets.geminiApiKey ? 'Set' : 'Missing'} note="Used when provider is gemini." />
              <StatCard label="Anthropic" value={providerSecrets.anthropicApiKey ? 'Set' : 'Missing'} note="Used when provider is anthropic." />
            </div>

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
            </div>
          </section>

          <section className="settings-section">
            <SectionHeading
              title="Worker"
              subtitleTooltip="Connection settings for the execution worker. Local mode uses the Vite dev server. Remote mode points to a dedicated worker endpoint."
            />

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
            </div>
          </section>
        </div>
      </article>

      {showRightPanel ? <SettingsChangelogPanel /> : null}

    </section>
  )
}
