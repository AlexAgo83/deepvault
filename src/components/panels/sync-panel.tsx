import { Pill, SectionHeading, StatCard } from '../app-ui'
import { formatUpdatedAt, type ProviderId, type UserRole } from '../../lib/deepvault'
import type { AppModel } from '../../hooks/useAppModel'

export function SyncPanel({
  activeScopeLabel,
  corpusProviders,
  onProviderChange,
  onRoleChange,
  onSiteFilterChange,
  provider,
  role,
  siteFilter,
  siteSummaries,
  scopedCorpusSummary,
  scopedSiteSummaries,
  scopedSyncOverview,
  scopedSyncRuns,
}: {
  activeScopeLabel: string
  corpusProviders: AppModel['corpusProviders']
  onProviderChange: (_value: ProviderId) => void
  onRoleChange: (_value: UserRole) => void
  onSiteFilterChange: (_value: string) => void
  provider: string
  role: string
  siteFilter: string
  siteSummaries: AppModel['siteSummaries']
  scopedCorpusSummary: AppModel['scopedCorpusSummary']
  scopedSiteSummaries: AppModel['scopedSiteSummaries']
  scopedSyncOverview: AppModel['scopedSyncOverview']
  scopedSyncRuns: AppModel['scopedSyncRuns']
}) {
  return (
    <section className="content-grid sync-grid">
      <div className="sync-main-column">
        <article className="panel">
          <SectionHeading title="Sync status" subtitleTooltip="Refresh state, ingestion coverage, and operational signals." />
          <div className="kpi-grid compact">
            <StatCard
              label="Synced sites"
              value={scopedSyncOverview.syncedSites}
              note="Sites currently in a synced state within the active scope."
            />
            <StatCard
              label="Restricted sites"
              value={scopedSyncOverview.restrictedSites}
              note="Sites visible only to privileged roles within the active scope."
            />
            <StatCard
              label="Visible sources"
              value={scopedCorpusSummary.visibleSources}
              note="Sources accessible to the selected role and scope."
            />
            <StatCard
              label="Denied sources"
              value={scopedCorpusSummary.deniedSources}
              note="Sources excluded by permission-aware retrieval in scope."
            />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Chunks</th>
                  <th>Last refresh</th>
                </tr>
              </thead>
              <tbody>
                {scopedSiteSummaries.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <strong>{site.name}</strong>
                      <div className="table-subtitle">{site.owner}</div>
                    </td>
                    <td>{site.lastRefreshStatus}</td>
                    <td>{site.permittedDocumentCount}</td>
                    <td>{site.chunkCount}</td>
                    <td>{site.lastRefresh ? formatUpdatedAt(site.lastRefresh) : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel runtime-panel">
          <SectionHeading title="Runtime" subtitleTooltip="Execution context shared by Explorer, Bishop, and Sync status." />
          <Pill tone="accent">{activeScopeLabel}</Pill>
          <div className="runtime-stack runtime-stack-grid">
            <div className="runtime-row">
              <span>Role</span>
              <select value={role} onChange={(event) => onRoleChange(event.target.value as UserRole)}>
                <option value="analyst">analyst</option>
                <option value="admin">admin</option>
                <option value="guest">guest</option>
              </select>
            </div>
            <div className="runtime-row">
              <span>Provider</span>
              <select value={provider} onChange={(event) => onProviderChange(event.target.value as ProviderId)}>
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
        <SectionHeading title="Recent sync runs" subtitleTooltip="Hover each run for the full note." />
        <div className="sync-list">
          {scopedSyncRuns.map((run) => (
            <article key={run.id} className="sync-card" title={run.notes}>
              <div className="source-card-top">
                <strong>{run.status}</strong>
                <Pill tone={run.status === 'synced' ? 'success' : 'neutral'}>{run.scope}</Pill>
              </div>
              <div className="source-meta">
                <span>{formatUpdatedAt(run.finishedAt)}</span>
                <span>{run.documentsSynced} docs</span>
                <span>{run.chunksWritten} chunks</span>
              </div>
              <p>{run.notes}</p>
            </article>
          ))}
        </div>
        <div className="checklist">
          <h3>Evaluation prep</h3>
          <ul>
            <li>
              Run <code>npm run ingest</code> to write the local sync snapshot.
            </li>
            <li>
              Run <code>npm run evaluate</code> to generate the V1 baseline report.
            </li>
            <li>Keep OpenAI as the baseline provider when comparing retrieval quality.</li>
          </ul>
        </div>
      </aside>
    </section>
  )
}
