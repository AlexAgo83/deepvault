import { useEffect, useRef } from 'react'
import { Pill, SectionHeading, StatCard } from '../app-ui'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { AppModel } from '../../hooks/useAppModel'

function getJobTone(status: string) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'danger'
  }

  return 'accent'
}

export function SyncPanel({
  scopedCorpusSummary,
  scopedSiteSummaries,
  scopedSyncOverview,
  syncOperations,
}: {
  scopedCorpusSummary: AppModel['scopedCorpusSummary']
  scopedSiteSummaries: AppModel['scopedSiteSummaries']
  scopedSyncOverview: AppModel['scopedSyncOverview']
  syncOperations: AppModel['syncOperations']
}) {
  const consoleRef = useRef<HTMLDivElement | null>(null)
  const currentJob = syncOperations.activeJob
  const currentLines = currentJob?.lines || []

  useEffect(() => {
    const node = consoleRef.current
    if (!node) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, [currentJob?.id, currentLines.length])

  return (
    <section className="sync-stack">
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

      <article className="panel sync-ops-panel">
        <SectionHeading
          title="Operations console"
          subtitleTooltip="Launch sync commands and follow the streamed execution log."
          actions={
            <>
              <button
                type="button"
                className="secondary-button secondary-button-sm"
                title="Refresh the current sync snapshot"
                onClick={syncOperations.startRefresh}
                disabled={syncOperations.isRunning}
              >
                Refresh status
              </button>
              <button
                type="button"
                className="secondary-button secondary-button-sm"
                title="Run local ingestion for the current corpus snapshot"
                onClick={syncOperations.startIngest}
                disabled={syncOperations.isRunning}
              >
                Run ingest
              </button>
              <button
                type="button"
                className="secondary-button secondary-button-sm"
                title="Run the evaluation pipeline against the current snapshot"
                onClick={syncOperations.startEvaluate}
                disabled={syncOperations.isRunning}
              >
                Run evaluate
              </button>
              {syncOperations.isRunning ? (
                <button
                  type="button"
                  className="secondary-button secondary-button-sm"
                  title="Cancel the running operation"
                  onClick={syncOperations.cancelActiveJob}
                >
                  Cancel job
                </button>
              ) : null}
            </>
          }
        />

        <div className="sync-ops-summary">
          <div className="detail-row">
            <span>Status</span>
            <strong>{currentJob?.status || 'idle'}</strong>
          </div>
          <div className="detail-row">
            <span>Command</span>
            <strong>{currentJob?.command || 'No command running'}</strong>
          </div>
          <div className="detail-row">
            <span>Progress</span>
            <strong>{currentJob ? `${currentJob.progress}%` : '0%'}</strong>
          </div>
        </div>

        <div className="sync-progress" aria-label="Sync operation progress">
          <div className="sync-progress-track">
            <span style={{ width: `${currentJob?.progress || 0}%` }} />
          </div>
          <div className="sync-progress-labels">
            <span>{currentJob?.label || 'Idle'}</span>
            <span>{currentJob?.summary || 'No sync job running yet.'}</span>
          </div>
        </div>

        <div className="sync-console" ref={consoleRef} aria-live="polite" aria-label="Sync console output">
          {currentLines.length ? (
            currentLines.map((line) => (
              <div key={line.id} className={`sync-console-line sync-console-line-${line.tone}`}>
                <span className="sync-console-timestamp">{formatUpdatedAt(line.timestamp)}</span>
                <span className="sync-console-text">{line.text}</span>
              </div>
            ))
          ) : (
            <div className="sync-console-empty">Launch a command to stream the execution log here.</div>
          )}
        </div>

        <SectionHeading title="Recent sync runs" subtitleTooltip="Hover each run for the full note." />
        <div className="sync-list">
          {syncOperations.history.length ? (
            syncOperations.history.map((job) => (
              <article key={job.id} className="sync-card" title={job.summary}>
                <div className="source-card-top">
                  <strong>{job.label}</strong>
                  <Pill tone={getJobTone(job.status)}>{job.status}</Pill>
                </div>
                <div className="source-meta">
                  <span>{job.finishedAt ? formatUpdatedAt(job.finishedAt) : formatUpdatedAt(job.startedAt)}</span>
                  <span>{job.command}</span>
                  <span>{job.progress}%</span>
                </div>
                <p>{job.summary}</p>
              </article>
            ))
          ) : (
            <div className="empty-state">No sync jobs have been launched yet.</div>
          )}
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
      </article>
    </section>
  )
}
