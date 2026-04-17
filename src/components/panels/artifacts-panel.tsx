import { useEffect, useMemo, useRef, useState } from 'react'
import { CompactDateTime, PathLabel, Pill, SectionHeading } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'

type ArtifactGroup = 'all' | 'type' | 'source'
type ArtifactFilter = 'all' | 'processed-file' | 'sync-run' | 'generated-answer' | 'analysis' | 'analysis-report'

type ArtifactRecord = {
  id: string
  type: ArtifactFilter
  title: string
  status: string
  timestamp: string
  sourceLabel: string
  location: string
  siteId?: string
  path?: string
  webUrl?: string
  summary?: string
  analysisStatus?: string
  analysisProvider?: string
  analysisModel?: string
  derivedOutputs?: string[]
  diagnostics?: string[]
}

const ARTIFACT_BATCH_SIZE = 24
const ARTIFACT_MAX_VISIBLE = 240

function getTone(status: string) {
  if (status === 'analyzed' || status === 'completed' || status === 'ready') return 'success'
  if (status === 'failed' || status === 'excluded') return 'danger'
  if (status === 'stale') return 'accent'
  return 'neutral'
}

function buildArtifactRecords(
  corpus: AppModel['scopedCorpus'],
  messages: AppModel['messages'],
  history: AppModel['syncOperations']['history'],
): ArtifactRecord[] {
  const processedFiles = corpus.documents.map((document) => ({
    id: `doc-${document.id}`,
    type: 'processed-file' as const,
    title: document.title,
    status: document.analysis?.status || 'ingested',
    timestamp: document.analysis?.analyzedAt || document.updatedAt,
    sourceLabel: corpus.sites.find((site) => site.id === document.siteId)?.name || document.siteId,
    location: document.path,
    siteId: document.siteId,
    path: document.path,
    webUrl: document.webUrl,
    summary: document.analysis?.summary || document.summary,
    analysisStatus: document.analysis?.status || 'not_analyzed',
    analysisProvider: document.analysis?.provider,
    analysisModel: document.analysis?.model,
    derivedOutputs: [
      document.analysis?.summary ? 'analysis summary' : 'baseline summary',
      document.analysis?.sections?.length ? `${document.analysis.sections.length} sections` : 'local sections',
      document.analysis?.keywords?.length ? `${document.analysis.keywords.length} keywords` : 'tags only',
    ],
    diagnostics: [
      `Kind: ${document.kind}`,
      `File type: ${document.fileType || 'n/a'}`,
      `Source: ${document.source}`,
      document.analysis?.excludedReason ? `Excluded: ${document.analysis.excludedReason}` : '',
      document.analysis?.failureReason ? `Failure: ${document.analysis.failureReason}` : '',
    ].filter(Boolean),
  }))

  const syncRuns = history.map((job) => ({
    id: `job-${job.id}`,
    type: 'sync-run' as const,
    title: job.label,
    status: job.status,
    timestamp: job.finishedAt || job.startedAt,
    sourceLabel: job.kind,
    location: job.command,
    summary: job.summary,
    diagnostics: job.lines.slice(-3).map((line) => line.text),
  }))

  const generatedAnswers = messages
    .filter((message) => message.role === 'assistant' && message.artifact)
    .map((message) => ({
      id: `message-${message.id}`,
      type: 'generated-answer' as const,
      title: message.artifact?.filename || message.id,
      status: message.artifactStatus || 'ready',
      timestamp: message.createdAt || new Date().toISOString(),
      sourceLabel: message.provider || 'local',
      location: message.artifact?.filename || 'generated answer',
      summary: message.artifactNotice || message.text,
      diagnostics: [
        `Format: ${message.artifact?.format || 'n/a'}`,
        `Provider: ${message.provider || 'local'}`,
        `Mode: ${message.orchestrationMode || 'local'}`,
      ],
    }))

  const analysisArtifacts = processedFiles
    .filter((item) => item.analysisStatus && item.analysisStatus !== 'not_analyzed')
    .map((item) => ({
      ...item,
      id: `analysis-${item.id}`,
      type: 'analysis' as const,
      title: `${item.title} analysis`,
      status: item.analysisStatus || item.status,
      sourceLabel: item.sourceLabel,
      location: item.location,
    }))

  const latestAnalyzeRun = history
    .filter((job) => job.kind === 'analyze')
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0]

  const analysisReportArtifacts = latestAnalyzeRun
    ? [
        {
          id: 'analysis-report-latest',
          type: 'analysis-report' as const,
          title: 'Latest analysis report',
          status: latestAnalyzeRun.status,
          timestamp: latestAnalyzeRun.finishedAt || latestAnalyzeRun.startedAt,
          sourceLabel: latestAnalyzeRun.label,
          location: 'data/runtime/analyze-report.json',
          summary: latestAnalyzeRun.summary,
          diagnostics: [
            `Command: ${latestAnalyzeRun.command}`,
            `Started: ${latestAnalyzeRun.startedAt}`,
            latestAnalyzeRun.finishedAt ? `Finished: ${latestAnalyzeRun.finishedAt}` : '',
            `Progress: ${latestAnalyzeRun.progress}%`,
          ].filter(Boolean),
        },
      ]
    : processedFiles.some((item) => item.analysisStatus && item.analysisStatus !== 'not_analyzed')
      ? [
          {
            id: 'analysis-report-latest',
            type: 'analysis-report' as const,
            title: 'Latest analysis report',
            status: 'available',
            timestamp: processedFiles
              .map((item) => item.timestamp)
              .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0],
            sourceLabel: 'analyze',
            location: 'data/runtime/analyze-report.json',
            summary: 'Bounded analysis run summary emitted by the post-ingest analysis command.',
            diagnostics: [
              'Path: data/runtime/analyze-report.json',
              'Includes scanned, analyzed, excluded, reused, stale, and reason rollups.',
            ],
          },
        ]
      : []

  return [...processedFiles, ...analysisArtifacts, ...analysisReportArtifacts, ...syncRuns, ...generatedAnswers].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  )
}

export function ArtifactsPanel({
  corpus,
  messages,
  resolveFileHref,
  showRightPanel,
  syncOperations,
}: {
  corpus: AppModel['scopedCorpus']
  messages: AppModel['messages']
  resolveFileHref: AppModel['resolveFileHref']
  showRightPanel: boolean
  syncOperations: AppModel['syncOperations']
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ArtifactFilter>('all')
  const [group, setGroup] = useState<ArtifactGroup>('all')
  const [visibleCount, setVisibleCount] = useState(ARTIFACT_BATCH_SIZE)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const artifactsListRef = useRef<HTMLDivElement | null>(null)
  const artifactRecords = useMemo(
    () => buildArtifactRecords(corpus, messages, syncOperations.history),
    [corpus, messages, syncOperations.history],
  )
  const filteredArtifacts = useMemo(
    () =>
      artifactRecords.filter((artifact) => {
        if (filter !== 'all' && artifact.type !== filter) {
          return false
        }
        const haystack = [artifact.title, artifact.sourceLabel, artifact.location, artifact.summary || ''].join(' ').toLowerCase()
        return haystack.includes(search.trim().toLowerCase())
      }),
    [artifactRecords, filter, search],
  )
  const visibleArtifacts = useMemo(
    () => filteredArtifacts.slice(0, Math.min(visibleCount, ARTIFACT_MAX_VISIBLE)),
    [filteredArtifacts, visibleCount],
  )
  const hasMoreArtifacts = filteredArtifacts.length > visibleArtifacts.length
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('')
  const selectedArtifact = visibleArtifacts.find((artifact) => artifact.id === selectedArtifactId) || visibleArtifacts[0] || null

  useEffect(() => {
    setVisibleCount(ARTIFACT_BATCH_SIZE)
  }, [search, filter, group, artifactRecords.length])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !hasMoreArtifacts || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) {
          return
        }

        setVisibleCount((current) => Math.min(ARTIFACT_MAX_VISIBLE, filteredArtifacts.length, current + ARTIFACT_BATCH_SIZE))
      },
      {
        root: artifactsListRef.current,
        rootMargin: '160px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filteredArtifacts.length, hasMoreArtifacts, artifactsListRef])

  useEffect(() => {
    if (selectedArtifactId && !visibleArtifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(visibleArtifacts[0]?.id || '')
    }
  }, [selectedArtifactId, visibleArtifacts])

  const groupedRecords = useMemo(() => {
    if (group === 'all') {
      return [{ label: 'All artifacts', items: visibleArtifacts }]
    }

    const map = new Map<string, ArtifactRecord[]>()
    for (const artifact of visibleArtifacts) {
      const key = group === 'type' ? artifact.type : artifact.sourceLabel
      map.set(key, [...(map.get(key) || []), artifact])
    }
    return [...map.entries()].map(([label, items]) => ({ label, items }))
  }, [visibleArtifacts, group])

  return (
    <section className={`content-grid artifacts-grid ${showRightPanel ? '' : 'content-grid-panel-hidden'}`}>
      <article className="panel artifacts-panel">
        <SectionHeading
          title="Artifacts"
          subtitle="Inspect generated outputs, processed file records, and run provenance."
        />
        <div className="artifacts-toolbar">
          <input
            aria-label="Artifact search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search artifact, run, source..."
          />
          <select aria-label="Artifact filter" value={filter} onChange={(event) => setFilter(event.target.value as ArtifactFilter)}>
            <option value="all">All</option>
            <option value="processed-file">Processed files</option>
            <option value="analysis">Analysis</option>
            <option value="analysis-report">Analysis reports</option>
            <option value="sync-run">Runs</option>
            <option value="generated-answer">Generated answers</option>
          </select>
          <select aria-label="Artifact grouping" value={group} onChange={(event) => setGroup(event.target.value as ArtifactGroup)}>
            <option value="all">All</option>
            <option value="type">By type</option>
            <option value="source">By source</option>
          </select>
        </div>

        <div ref={artifactsListRef} className="artifacts-list">
          {groupedRecords.length && visibleArtifacts.length ? (
            groupedRecords.map((groupRecord) => (
              <div key={groupRecord.label} className="artifacts-group">
                {group !== 'all' ? <h3>{groupRecord.label}</h3> : null}
                {groupRecord.items.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    className={`artifacts-row ${selectedArtifact?.id === artifact.id ? 'artifacts-row-active' : ''}`}
                    onClick={() => setSelectedArtifactId(artifact.id)}
                  >
                    <span className="artifacts-row-main">
                      <strong>{artifact.title}</strong>
                      <span>{artifact.sourceLabel}</span>
                    </span>
                    <span className="artifacts-row-meta">
                      <Pill tone={getTone(artifact.status)}>{artifact.status}</Pill>
                      <span>{artifact.type}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            <div className="empty-state">No artifacts match the current filters.</div>
          )}
          {hasMoreArtifacts ? <div ref={loadMoreSentinelRef} className="document-list-sentinel" aria-hidden="true" /> : null}
        </div>
      </article>

      {showRightPanel ? (
        <aside id="panel-right" className="panel panel-right artifacts-detail-panel">
          <SectionHeading title="Processed record" subtitle="Ingestion, analysis, outputs, and diagnostics for the selected artifact." />
          <div className="artifacts-detail-scroll">
            {selectedArtifact ? (
              <div className="detail-stack artifacts-detail-stack">
                <div className="detail-row">
                  <span>Identity</span>
                  <strong>{selectedArtifact.title}</strong>
                </div>
                <div className="detail-row">
                  <span>Status</span>
                  <Pill tone={getTone(selectedArtifact.status)}>{selectedArtifact.status}</Pill>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong><CompactDateTime value={selectedArtifact.timestamp} /></strong>
                </div>
                <div className="detail-row">
                  <span>Source</span>
                  <strong>{selectedArtifact.sourceLabel}</strong>
                </div>
                <div className="detail-row">
                  <span>Location</span>
                  {selectedArtifact.path ? (
                    <PathLabel
                      value={selectedArtifact.path}
                      href={selectedArtifact.siteId ? resolveFileHref(selectedArtifact.siteId, selectedArtifact.path, selectedArtifact.webUrl) : null}
                    />
                  ) : (
                    <strong>{selectedArtifact.location}</strong>
                  )}
                </div>
                {selectedArtifact.summary ? (
                  <div className="artifacts-detail-block">
                    <strong>Derived outputs</strong>
                    <p>{selectedArtifact.summary}</p>
                    {selectedArtifact.derivedOutputs?.length ? (
                      <div className="artifacts-tag-row">
                        {selectedArtifact.derivedOutputs.map((item) => (
                          <Pill key={item}>{item}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="artifacts-detail-block">
                  <strong>Diagnostics</strong>
                  <div className="detail-stack">
                    {(selectedArtifact.diagnostics || ['No diagnostics available.']).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">Select an artifact to inspect its processed record.</div>
            )}
          </div>
        </aside>
      ) : null}
    </section>
  )
}
