import { Pill, SectionHeading, StatCard } from '../app-ui'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'
import type { AppModel } from '../../hooks/useAppModel'
import { type ProviderId, type UserRole } from '../../lib/deepvault'

export function SettingsPanel({
  activeScopeLabel,
  corpusProviders,
  providerSecrets,
  onClear,
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
  providerSecrets: ProviderSecrets
  onClear: () => void
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
    <section className="content-grid settings-grid">
      <div className="settings-main-column">
        <article className="panel settings-panel">
          <SectionHeading
            title="Settings"
            subtitleTooltip="Configure provider API keys locally in this browser. Bishop will use them when a remote provider is selected."
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

        <article className="panel runtime-panel settings-runtime-panel">
          <SectionHeading title="Runtime" subtitleTooltip="Execution context shared by Explorer, Bishop, and Sync status." />
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
      </div>

      <aside className="panel">
        <SectionHeading
          title="How it works"
          subtitleTooltip="The app passes these local keys into Bishop when the matching provider is selected."
        />
        <div className="detail-stack">
          <div className="detail-row">
            <span>Storage</span>
            <strong>Browser localStorage</strong>
          </div>
          <div className="detail-row">
            <span>Reload</span>
            <strong>Not required</strong>
          </div>
          <div className="detail-row">
            <span>Scope</span>
            <strong>Current browser only</strong>
          </div>
        </div>
      </aside>
    </section>
  )
}
