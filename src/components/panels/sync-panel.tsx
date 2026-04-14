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
import type { WorkerSettings } from '../../hooks/useWorkerSettings'

type OpsKey = 'ingest' | 'evaluate' | 'refresh' | 'exportLive' | 'exportLiveResume'
export type SyncView = 'status' | 'operations' | 'history' | 'config' | 'recovery'

const SYNC_VIEW_PARAM = 'sync'

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
    label: 'Refresh',
    tooltip: 'Reload corpus state in the app',
    description: 'Reloads the corpus state in the app and updates site coverage, freshness, and provider readiness signals. No files are written.',
    confirmLabel: 'Refresh',
  },
  exportLive: {
    label: 'Start Sync',
    tooltip: 'Full SharePoint export via Microsoft Graph',
    description: 'Connects to SharePoint via Microsoft Graph and exports the full corpus from all configured sites. The existing checkpoint will be overwritten.',
    warning: 'Full sync — may take several minutes depending on corpus size. Requires Entra credentials configured in Settings.',
    confirmLabel: 'Start Sync',
  },
  exportLiveResume: {
    label: 'Resume Sync',
    tooltip: 'Delta sync from last checkpoint',
    description: 'Resumes from the last checkpoint and only fetches documents modified since the previous export. Faster than a full export and preserves unchanged documents.',
    warning: 'Requires a valid checkpoint on disk. If no checkpoint exists the export will fall back to a full run.',
    confirmLabel: 'Resume Sync',
  },
}

const SYNC_VIEWS: { id: SyncView; label: string; detail: string }[] = [
  { id: 'status', label: 'Status', detail: 'Coverage, freshness, and scope signals' },
  { id: 'operations', label: 'Operations', detail: 'Launch ingest, evaluate, refresh, or sync' },
  { id: 'history', label: 'History', detail: 'Recent runs and evaluation prep' },
  { id: 'config', label: 'Config', detail: 'Worker mode, fallback, and timeout' },
  { id: 'recovery', label: 'Recovery', detail: 'Failed runs and recovery guidance' },
]

function parseSyncView(hash: string): SyncView {
  const search = hash.startsWith('#') ? hash.slice(1) : hash
  const value = new URLSearchParams(search).get(SYNC_VIEW_PARAM)
  if (value === 'operations' || value === 'history' || value === 'config' || value === 'recovery') {
    return value
  }
  return 'status'
}

function serializeSyncView(view: SyncView): string {
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '')
  params.set(SYNC_VIEW_PARAM, view)
  return `#${params.toString()}`
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
  workerSettings,
}: {
  scopedCorpusSummary: AppModel['scopedCorpusSummary']
  scopedSiteSummaries: AppModel['scopedSiteSummaries']
  scopedSyncOverview: AppModel['scopedSyncOverview']
  syncOperations: AppModel['syncOperations']
  workerSettings: WorkerSettings
}) {
  const consoleRef = useRef<HTMLDivElement | null>(null)
  const currentJob = syncOperations.activeJob
  const currentLines = currentJob?.lines || []
  const [pendingOp, setPendingOp] = useState<OpsKey | null>(null)
  const [elapsed, setElapsed] = useState<number>(0)
  const [syncView, setSyncView] = useState<SyncView>(() => parseSyncView(window.location.hash))

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

  // Auto-switch to operations when a job starts
  useEffect(() => {
    if (currentJob?.status === 'running') {
      setSyncView('operations')
    }
  }, [currentJob?.status])

  useEffect(() => {
    const syncFromHash = () => {
      setSyncView(parseSyncView(window.location.hash))
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    const nextHash = serializeSyncView(syncView)
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [syncView])

  function confirm(op: OpsKey) {
    setPendingOp(null)
    if (op === 'ingest') syncOperations.startIngest()
    else if (op === 'evaluate') syncOperations.startEvaluate()
    else if (op === 'refresh') syncOperations.startRefresh()
    else if (op === 'exportLive') syncOperations.startExportLive()
    else if (op === 'exportLiveResume') syncOperations.startExportLiveResume()
  }

  const pending = pendingOp ? OPS_CONFIG[pendingOp] : null

  const failedJobs = syncOperations.history.filter((j) => j.status === 'failed')
  const currentViewMeta = SYNC_VIEWS.find((view) => view.id === syncView) || SYNC_VIEWS[0]

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

      <article className="panel sync-view-switcher" aria-label="Sync views">
        <div className="sync-view-switcher-head">
          <div>
            <h2>Sync views</h2>
            <p>Switch between coverage, execution, history, worker settings, and recovery from one view.</p>
          </div>
          <div className="sync-view-switcher-meta" aria-label="Current sync view summary">
            <div className="sync-view-switcher-meta-card">
              <span>Active view</span>
              <strong>{currentViewMeta.label}</strong>
            </div>
            <div className="sync-view-switcher-meta-card">
              <span>Last job</span>
              <strong>{currentJob ? currentJob.status : 'idle'}</strong>
            </div>
          </div>
        </div>

        <nav className="sync-subnav" aria-label="Sync views">
          {SYNC_VIEWS.map(({ id, label, detail }) => (
            <button
              key={id}
              type="button"
              className={`sync-subnav-item ${syncView === id ? 'sync-subnav-item-active' : ''}`}
              aria-label={label}
              aria-current={syncView === id ? 'page' : undefined}
              title={detail}
              onClick={() => setSyncView(id)}
            >
              <span className="sync-subnav-label">{label}</span>
              <span className="sync-subnav-detail">{detail}</span>
              <span className="sync-subnav-status">
                {id === 'operations' && syncOperations.isRunning ? 'Running' : null}
                {id === 'history' && syncOperations.history.length > 0 ? `${syncOperations.history.length} runs` : null}
                {id === 'status' && currentJob ? currentJob.status : null}
                {id === 'config' ? workerSettings.workerMode : null}
                {id === 'recovery' && failedJobs.length > 0 ? `${failedJobs.length} failed` : null}
              </span>
            </button>
          ))}
        </nav>
      </article>

      {/* Status view — concise summary */}
      {syncView === 'status' ? (
        <article className="panel sync-view-panel" aria-label="Sync status summary">
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

          {/* Quick summary of active/last job */}
          {currentJob ? (
            <div className="sync-status-job-summary">
              <div className="detail-row">
                <span>Last operation</span>
                <strong>{currentJob.label}</strong>
              </div>
              <div className="detail-row">
                <span>Status</span>
                <Pill tone={getJobTone(currentJob.status)}>{currentJob.status}</Pill>
              </div>
              {currentJob.status === 'running' ? (
                <div className="detail-row">
                  <span>Progress</span>
                  <strong>{currentJob.progress}%</strong>
                </div>
              ) : null}
              <button
                type="button"
                className="secondary-button secondary-button-sm"
                onClick={() => setSyncView('operations')}
              >
                View operations
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      {/* Operations view — controls + console */}
      {syncView === 'operations' ? (
        <>
          <article className="panel sync-controls-panel" aria-label="Sync operations controls">
            <SectionHeading title="Operations" subtitleTooltip="Launch, resume, or cancel sync operations." />

            <div className="sync-controls-panel-body">
              <div className="sync-controls-group">
                <span className="sync-controls-label">Knowledge</span>
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

              <div className="sync-controls-divider" />

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
            </div>
          </article>

          <article className="panel sync-ops-panel" aria-label="Operations console">
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
          </article>
        </>
      ) : null}

      {/* History view — run list */}
      {syncView === 'history' ? (
        <article className="panel sync-view-panel" aria-label="Sync run history">
          <SectionHeading title="Run history" subtitleTooltip="Recent sync jobs and their results. Hover each run for the full note." />

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
      ) : null}

      {/* Config view — worker connection read-only + effective config */}
      {syncView === 'config' ? (
        <article className="panel sync-view-panel" aria-label="Worker configuration">
          <SectionHeading title="Worker config" subtitleTooltip="Active worker connection and fallback settings. Edit in Settings → Worker." />

          <div className="kpi-grid compact">
            <StatCard label="Worker mode" value={workerSettings.workerMode} note="local uses the embedded Vite ops server." />
            <StatCard label="Fallback mode" value={workerSettings.workerFallbackMode} note="Behavior when the worker is unreachable." />
            <StatCard label="Timeout" value={`${workerSettings.workerTimeoutSeconds}s`} note="Request timeout for worker API calls." />
          </div>

          {workerSettings.workerMode === 'remote' && workerSettings.workerUrl ? (
            <div className="sync-details-grid">
              <div className="detail-row">
                <span>Worker URL</span>
                <strong className="detail-value-compact">{workerSettings.workerUrl}</strong>
              </div>
              <div className="detail-row">
                <span>Token</span>
                <strong>{workerSettings.workerToken ? '●●●●●●●●' : 'Not set'}</strong>
              </div>
            </div>
          ) : null}

          {workerSettings.workerMode === 'local' ? (
            <div className="sync-callout">
              <p>Running in local mode. Jobs are executed by the embedded Vite ops server at the same origin.</p>
              <p>Switch to remote mode in <strong>Settings → Worker</strong> to point at a dedicated worker endpoint.</p>
            </div>
          ) : (
            <div className="sync-callout">
              <p>Running in remote mode. Jobs are dispatched to <strong>{workerSettings.workerUrl || 'the configured worker URL'}</strong>.</p>
              <p>Update connection settings in <strong>Settings → Worker</strong>.</p>
            </div>
          )}

        </article>
      ) : null}

      {/* Recovery view — failure guidance and last failed operations */}
      {syncView === 'recovery' ? (
        <article className="panel sync-view-panel" aria-label="Recovery guidance">
          <SectionHeading title="Recovery" subtitleTooltip="Guidance for failed operations and unreachable workers." />

          {failedJobs.length > 0 ? (
            <div className="sync-list">
              {failedJobs.map((job) => (
                <article key={job.id} className="sync-card" title={job.summary}>
                  <div className="source-card-top">
                    <strong>{job.label}</strong>
                    <Pill tone="danger">failed</Pill>
                  </div>
                  <div className="source-meta">
                    <span>{job.finishedAt ? formatUpdatedAt(job.finishedAt) : formatUpdatedAt(job.startedAt)}</span>
                    <span>{job.command}</span>
                  </div>
                  <p>{job.summary}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="sync-callout">
              <p>No failed jobs in recent history. Recovery guidance will appear here when a job fails.</p>
            </div>
          )}

          <div className="sync-callout">
            <p>If a sync fails, use <strong>Resume Sync</strong> in Operations to restart from the last checkpoint.</p>
            <p>If the worker is unreachable, check the Worker URL and token in Settings, or switch to local mode.</p>
            <p>If the worker remains unavailable and the fallback mode is <strong>read_only</strong>, continue in the published corpus until the endpoint is restored.</p>
          </div>
        </article>
      ) : null}
    </section>
  )
}
