import { Pill, SectionHeading, StatCard } from '../app-ui'
import type { EntraSettings } from '../../hooks/useEntraSettings'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'

export function SettingsPanel({
  activeScopeLabel,
  corpusProviders,
  entraSettings,
  providerSecrets,
  onClear,
  onClearEntra,
  onEntraChange,
  onKeyChange,
  onProviderChange,
  onRoleChange,
  onSiteFilterChange,
  provider,
  role,
  siteFilter,
  siteSummaries,
}: {
  activeScopeLabel: string
  corpusProviders: AppModel['corpusProviders']
  entraSettings: EntraSettings
  providerSecrets: ProviderSecrets
  onClear: () => void
  onClearEntra: () => void
  onEntraChange: (_key: keyof EntraSettings, _value: string) => void
  onKeyChange: (_provider: 'openai' | 'gemini' | 'anthropic', _value: string) => void
  onProviderChange: (_value: ProviderId) => void
  onRoleChange: (_value: UserRole) => void
  onSiteFilterChange: (_value: string) => void
  provider: string
  role: string
  siteFilter: string
  siteSummaries: AppModel['siteSummaries']
}) {
  const configuredCount = [providerSecrets.openaiApiKey, providerSecrets.geminiApiKey, providerSecrets.anthropicApiKey].filter(Boolean).length

  return (
    <section className="settings-grid">
      <div className="settings-main-column">
        <article className="panel runtime-panel settings-runtime-panel">
          <SectionHeading title="Settings" subtitleTooltip="Execution context shared by Explorer, Bishop, and Sync status." />
          <Pill tone="accent">{activeScopeLabel}</Pill>
          <div className="runtime-stack runtime-stack-grid">
            <div className="runtime-row">
              <span>Role</span>
              <select value={role} title="Select the active access role" onChange={(event) => onRoleChange(event.target.value as UserRole)}>
                <option value="analyst">analyst</option>
                <option value="admin">admin</option>
                <option value="guest">guest</option>
              </select>
            </div>
            <div className="runtime-row">
              <span>Data mode</span>
              <select
                value={entraSettings.dataMode}
                title="Override DEEPVAULT_DATA_MODE for ops scripts"
                onChange={(event) => onEntraChange('dataMode', event.target.value)}
              >
                <option value="">env default</option>
                <option value="mock">mock</option>
                <option value="live">live</option>
              </select>
            </div>
            <div className="runtime-row">
              <span>Provider</span>
              <select value={provider} title="Select the Bishop provider" onChange={(event) => onProviderChange(event.target.value as ProviderId)}>
                {corpusProviders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="runtime-row runtime-row-scope">
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
        </article>

        <article className="panel settings-panel">
          <SectionHeading
            title="SharePoint / Entra ID"
            subtitleTooltip="Credentials passed as env vars to ops console scripts (ingest, evaluate, live export). Stored locally in this browser only."
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
        </article>

        <article className="panel settings-panel">
          <SectionHeading
            title="AI providers"
            subtitleTooltip="Provider API keys stored locally in this browser. Bishop uses them when a remote provider is selected."
          />

          <div className="kpi-grid compact settings-summary-grid">
            <StatCard label="Configured providers" value={configuredCount} note="Keys stored in this browser only." />
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
        </article>
      </div>

    </section>
  )
}
