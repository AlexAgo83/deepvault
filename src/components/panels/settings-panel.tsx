import { SectionHeading, StatCard } from '../app-ui'
import type { ProviderSecrets } from '../../hooks/useProviderSecrets'

export function SettingsPanel({
  providerSecrets,
  onClear,
  onKeyChange,
}: {
  providerSecrets: ProviderSecrets
  onClear: () => void
  onKeyChange: (_provider: 'openai' | 'gemini' | 'anthropic', _value: string) => void
}) {
  const configuredCount = [providerSecrets.openaiApiKey, providerSecrets.geminiApiKey, providerSecrets.anthropicApiKey].filter(Boolean).length

  return (
    <section className="content-grid settings-grid">
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

      <aside className="panel">
        <SectionHeading title="How it works" subtitle="The app passes these local keys into Bishop when the matching provider is selected." />
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
