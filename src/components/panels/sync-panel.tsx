import { useEffect, useRef, useState } from 'react'

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
import { Pill, SectionHeading, StatCard } from '../app-ui'
import { ConfirmModal } from '../confirm-modal'
import { formatUpdatedAt } from '../../lib/deepvault'
import type { AppModel } from '../../hooks/useAppModel'

type OpsKey = 'ingest' | 'evaluate' | 'refresh' | 'exportLive' | 'exportLiveResume'

const OPS_CONFIG: Record<OpsKey, {
  label: string
  tooltip: string
  description: string
  warning?: string
  confirmLabel: string
}> = {
  ingest: {
    label: 'Run ingest',
    tooltip: 'Write sync snapshot from current corpus',
    description: 'Reads the current corpus and writes a new sync state snapshot to data/runtime/sync-state.json. Fast, local operation — no network calls.',
    confirmLabel: 'Run ingest',
  },
  evaluate: {
    label: 'Run evaluate',
    tooltip: 'Score retrieval quality against expected answers',
    description: 'Runs the evaluation pipeline and scores retrieval quality against a set of expected answers. Writes a baseline report to data/eval/.',
    warning: 'This makes API calls to OpenAI and may incur usage costs.',
    confirmLabel: 'Run evaluate',
  },
  refresh: {
    label: 'Refresh status',
    tooltip: 'Reload corpus state in the app',
    description: 'Reloads the corpus state in the app and updates site coverage, freshness, and provider readiness signals. No files are written.',
    confirmLabel: 'Refresh',
  },
  exportLive: {
    label: 'Run live export',
    tooltip: 'Full SharePoint export via Microsoft Graph',
    description: 'Connects to SharePoint via Microsoft Graph and exports the full corpus from all configured sites. The existing checkpoint will be overwritten.',
    warning: 'Full export — may take several minutes depending on corpus size. Requires Entra credentials configured in Settings.',
    confirmLabel: 'Run live export',
  },
  exportLiveResume: {
    label: 'Resume live export',
    tooltip: 'Delta sync from last checkpoint',
    description: 'Resumes from the last checkpoint and only fetches documents modified since the previous export. Faster than a full export and preserves unchanged documents.',
    warning: 'Requires a valid checkpoint on disk. If no checkpoint exists the export will fall back to a full run.',
    confirmLabel: 'Resume export',
  },
}

function getJobTone(status: string) {
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'danger'
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
  const [pendingOp, setPendingOp] = useState<OpsKey | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)

  useEffect(() => {
    if (currentJob?.status !== 'running') {
      setElapsed(0)
      return
    }
    const start = new Date(currentJob.startedAt).getTime()
    setElapsed(Date.now() - start)
    const id = window.setInterval(() => setElapsed(Date.now() - start), 1000)
    return () => window.clearInterval(id)
  }, [currentJob?.id, currentJob?.status, currentJob?.startedAt])

  useEffect(() => {
    const node = consoleRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [currentJob?.id, currentLines.length])

  function confirm(op: OpsKey) {
    setPendingOp(null)
    if (op === 'ingest') syncOperations.startIngest()
    else if (op === 'evaluate') syncOperations.startEvaluate()
    else if (op === 'refresh') syncOperations.startRefresh()
    else if (op === 'exportLive') syncOperations.startExportLive()
    else if (op === 'exportLiveResume') syncOperations.startExportLiveResume()
  }

  const pending = pendingOp ? OPS_CONFIG[pendingOp] : null

  return (
    <section className="sync-stack">
      {pending ? (
        <ConfirmModal
          title={pending.label}
          description={pending.description}
          warning={pending.warning}
          confirmLabel={pending.confirmLabel}
          onConfirm={() => confirm(pendingOp!)}
          onCancel={() => setPendingOp(null)}
        />
      ) : null}

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

      <article className="panel sync-controls-panel">
        <div className="sync-controls-group">
          <span className="sync-controls-label">Local pipeline</span>
          <div className="sync-controls-actions">
            {(['ingest', 'evaluate'] as OpsKey[]).map((op) => (
              <button
                key={op}
                type="button"
                className="secondary-button secondary-button-sm"
                data-tooltip={OPS_CONFIG[op].tooltip}
                onClick={() => setPendingOp(op)}
                disabled={syncOperations.isRunning}
              >
                {OPS_CONFIG[op].label}
              </button>
            ))}
          </div>
        </div>

        <div className="sync-controls-divider" />

        <div className="sync-controls-group">
          <span className="sync-controls-label">SharePoint sync</span>
          <div className="sync-controls-actions">
            {(['refresh', 'exportLive', 'exportLiveResume'] as OpsKey[]).map((op) => (
              <button
                key={op}
                type="button"
                className="secondary-button secondary-button-sm"
                data-tooltip={OPS_CONFIG[op].tooltip}
                onClick={() => setPendingOp(op)}
                disabled={syncOperations.isRunning}
              >
                {OPS_CONFIG[op].label}
              </button>
            ))}
          </div>
        </div>
      </article>

      <article className="panel sync-ops-panel">
        <SectionHeading
          title="Operations console"
          subtitleTooltip="Follow the streamed execution log for the active operation."
          actions={
            syncOperations.isRunning ? (
              <button
                type="button"
                className="secondary-button secondary-button-sm danger-button"
                data-tooltip="Stop the running operation"
                onClick={syncOperations.cancelActiveJob}
              >
                Cancel job
              </button>
            ) : null
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
          <div className="detail-row">
            <span>Duration</span>
            <strong>
              {currentJob?.status === 'running'
                ? formatDuration(elapsed)
                : currentJob?.durationMs != null
                  ? formatDuration(currentJob.durationMs)
                  : '—'}
            </strong>
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
                  {job.durationMs != null ? <span>{formatDuration(job.durationMs)}</span> : null}
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
