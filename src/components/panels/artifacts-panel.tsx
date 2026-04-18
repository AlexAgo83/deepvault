import { useEffect, useMemo, useRef, useState } from 'react'
import { CompactDateTime, PathLabel, Pill, SectionHeading } from '../app-ui'
import type { AppModel } from '../../hooks/useAppModel'
import { warnInvalidStoredValue } from '../../lib/storage-schema'

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
const ARTIFACT_FILTER_STORAGE_KEY = 'deepvault_artifacts_filter'
const ARTIFACT_GROUP_STORAGE_KEY = 'deepvault_artifacts_group'
const ARTIFACT_ANALYZED_ONLY_STORAGE_KEY = 'deepvault_artifacts_analyzed_only'

function readStoredArtifactFilter(): ArtifactFilter {
  if (typeof window === 'undefined') {
    return 'processed-file'
  }

  const stored = window.localStorage.getItem(ARTIFACT_FILTER_STORAGE_KEY)
  const validated = stored === 'all'
    || stored === 'processed-file'
    || stored === 'sync-run'
    || stored === 'generated-answer'
    || stored === 'analysis'
    || stored === 'analysis-report'
    ? stored
    : null
  if (stored && !validated) {
    warnInvalidStoredValue({ storageKey: ARTIFACT_FILTER_STORAGE_KEY }, 'Expected a known artifact filter value.', stored)
  }
  return validated ?? 'processed-file'
}

function readStoredArtifactGroup(): ArtifactGroup {
  if (typeof window === 'undefined') {
    return 'all'
  }

  const stored = window.localStorage.getItem(ARTIFACT_GROUP_STORAGE_KEY)
  const validated = stored === 'all' || stored === 'type' || stored === 'source'
    ? stored
    : null
  if (stored && !validated) {
    warnInvalidStoredValue({ storageKey: ARTIFACT_GROUP_STORAGE_KEY }, 'Expected a known artifact group value.', stored)
  }
  return validated ?? 'all'
}

function readStoredAnalyzedOnly(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(ARTIFACT_ANALYZED_ONLY_STORAGE_KEY) === 'true'
}

function getTone(status: string) {
  if (status === 'analyzed' || status === 'completed' || status === 'ready') return 'success'
  if (status === 'failed' || status === 'excluded') return 'danger'
  if (status === 'stale') return 'accent'
  return 'neutral'
}

function flattenDiagnosticLines(lines: string[]): string[] {
  return lines.flatMap((item) =>
    item
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function buildFailurePresentation(fallback: string, diagnostics: string[]): { summary: string; diagnostics: string[] } {
  const flattened = flattenDiagnosticLines(diagnostics)
  const commandBlocks = diagnostics.filter((item) => item.trim().startsWith('$ '))

  if (flattened.some((line) => /invalid_client|AADSTS7000215/i.test(line))) {
    return {
      summary: 'Microsoft Entra authentication failed: invalid client secret.',
      diagnostics: [
        ...commandBlocks,
        'Action required\nUse the client secret value, not the secret ID, in DEEPVAULT_ENTRA_SECRET_VALUE.',
        'Provider response\nAADSTS7000215: Invalid client secret provided.',
      ],
    }
  }

  const explicitError = flattened.find((line) => /^Error:\s+/i.test(line))
  if (explicitError) {
    return {
      summary: explicitError.replace(/^Error:\s*/i, '').trim() || fallback,
      diagnostics: [
        ...commandBlocks,
        `Error\n${explicitError.replace(/^Error:\s*/i, '').trim() || fallback}`,
      ],
    }
  }

  const authFailure = flattened.find((line) => /auth request failed/i.test(line))
  if (authFailure) {
    return {
      summary: authFailure,
      diagnostics: [
        ...commandBlocks,
        `Error\n${authFailure}`,
      ],
    }
  }

  const genericFailure = flattened.find((line) => /failed to start job/i.test(line))
    || flattened.find((line) => /failed|error/i.test(line) && line !== 'Operation failed.')

  return {
    summary: genericFailure || fallback,
    diagnostics: commandBlocks,
  }
}

function normalizeDiagnostics(diagnostics: string[], summary?: string): string[] {
  const informativeEntries = diagnostics.filter((item) => {
    const flattened = flattenDiagnosticLines([item])
    return flattened.some((line) => line !== 'Operation failed.')
  })

  if (informativeEntries.length === 0) {
    return []
  }

  const source = informativeEntries
  const seen = new Set<string>()

  return source.filter((item) => {
    const key = item.trim()
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  }).map((item) => {
    if (!summary || !item.trim().startsWith('$ ')) {
      return item
    }

    const lines = item.split('\n')
    const command = lines[0]
    const rest = lines.slice(1)
    const metadataLines = rest.filter(isMetadataLine)
    const trailingLines = rest.filter((line) => !isMetadataLine(line))
    const normalizedSummary = summary.trim().toLowerCase()
    const filteredTrailingLines = trailingLines.filter((line) => line.trim().toLowerCase() !== normalizedSummary)

    return [command, ...metadataLines, ...filteredTrailingLines].join('\n')
  })
}

function splitDetailBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isMetadataLine(line: string): boolean {
  return /^[A-Za-z][A-Za-z0-9 /_-]*:\s+.+$/.test(line)
}

function isTimestampValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value))
}

function renderMetadataList(lines: string[], key: string) {
  return (
    <dl key={key} className="artifacts-detail-meta-list">
      {lines.map((line) => {
        const separatorIndex = line.indexOf(':')
        const label = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()

        return (
          <div key={`${key}-${label}-${value}`} className="artifacts-detail-meta-row">
            <dt>{label}</dt>
            <dd>{isTimestampValue(value) ? <CompactDateTime value={value} /> : value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function shouldRenderTerminalProgressList(lines: string[]): boolean {
  return lines.length > 0
    && lines.every((line) => line.length <= 160)
    && lines.every((line) => !line.startsWith('at '))
    && lines.every((line) => !line.startsWith('/'))
    && lines.every((line) => !/^Error:\s+/i.test(line))
}

function renderTerminalTrailingContent(lines: string[], key: string) {
  if (shouldRenderTerminalProgressList(lines)) {
    return (
      <ul key={key} className="artifacts-detail-progress-list">
        {lines.map((line, index) => {
          const toneClass = /completed successfully|wrote|ready|generated/i.test(line)
            ? 'artifacts-detail-progress-item-success'
            : /failed|error/i.test(line)
              ? 'artifacts-detail-progress-item-danger'
              : ''

          return (
            <li key={`${key}-${index}`} className={`artifacts-detail-progress-item ${toneClass}`.trim()}>
              <span className="artifacts-detail-progress-marker" aria-hidden="true" />
              <span>{line}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <pre key={key} className="artifacts-detail-preformatted">
      <code>{lines.join('\n')}</code>
    </pre>
  )
}

function renderDetailText(text: string, keyPrefix: string) {
  return splitDetailBlocks(text).map((block, blockIndex) => {
    const key = `${keyPrefix}-${blockIndex}`
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)

    if (lines.length === 0) {
      return null
    }

    if (lines[0]?.startsWith('$ ')) {
      const command = lines[0]
      const metadataLines = lines.slice(1).filter(isMetadataLine)
      const trailingLines = lines.slice(1).filter((line) => !isMetadataLine(line))

      return (
        <div key={key} className="artifacts-detail-rich-block artifacts-detail-rich-block-terminal">
          <code>{command}</code>
          {metadataLines.length ? renderMetadataList(metadataLines, `${key}-meta`) : null}
          {trailingLines.length ? renderTerminalTrailingContent(trailingLines, `${key}-trailing`) : null}
        </div>
      )
    }

    if (lines.every(isMetadataLine)) {
      return renderMetadataList(lines, key)
    }

    if (lines.length === 1 && /failed|error/i.test(lines[0])) {
      return (
        <p key={key} className="artifacts-detail-notice artifacts-detail-notice-danger">
          {lines[0]}
        </p>
      )
    }

    if (lines.length === 1 && /completed|generated|wrote|resumed|ready|available/i.test(lines[0])) {
      return (
        <p key={key} className="artifacts-detail-notice artifacts-detail-notice-success">
          {lines[0]}
        </p>
      )
    }

    if (lines.length > 1) {
      return (
        <pre key={key} className="artifacts-detail-preformatted">
          <code>{lines.join('\n')}</code>
        </pre>
      )
    }

    return <p key={key}>{lines[0]}</p>
  })
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

  const syncRuns = history.map((job) => {
    const normalizedDiagnostics = normalizeDiagnostics(job.lines.map((line) => line.text), job.summary)
    const failurePresentation = job.status === 'failed'
      ? buildFailurePresentation(job.summary, normalizedDiagnostics)
      : null

    return {
      id: `job-${job.id}`,
      type: 'sync-run' as const,
      title: job.label,
      status: job.status,
      timestamp: job.finishedAt || job.startedAt,
      sourceLabel: job.kind,
      location: job.command,
      summary: failurePresentation?.summary || job.summary,
      diagnostics: failurePresentation?.diagnostics || [],
    }
  })

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
  const [filter, setFilter] = useState<ArtifactFilter>(() => readStoredArtifactFilter())
  const [group, setGroup] = useState<ArtifactGroup>(() => readStoredArtifactGroup())
  const [analyzedOnly, setAnalyzedOnly] = useState<boolean>(() => readStoredAnalyzedOnly())
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
        if (analyzedOnly && artifact.analysisStatus !== 'analyzed') {
          return false
        }
        const haystack = [artifact.title, artifact.sourceLabel, artifact.location, artifact.summary || ''].join(' ').toLowerCase()
        return haystack.includes(search.trim().toLowerCase())
      }),
    [analyzedOnly, artifactRecords, filter, search],
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
  }, [search, filter, group, analyzedOnly, artifactRecords.length])

  useEffect(() => {
    window.localStorage.setItem(ARTIFACT_FILTER_STORAGE_KEY, filter)
  }, [filter])

  useEffect(() => {
    window.localStorage.setItem(ARTIFACT_GROUP_STORAGE_KEY, group)
  }, [group])

  useEffect(() => {
    window.localStorage.setItem(ARTIFACT_ANALYZED_ONLY_STORAGE_KEY, String(analyzedOnly))
  }, [analyzedOnly])

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
            <option value="generated-answer">Gen. answers</option>
          </select>
          <select aria-label="Artifact grouping" value={group} onChange={(event) => setGroup(event.target.value as ArtifactGroup)}>
            <option value="all">All</option>
            <option value="type">By type</option>
            <option value="source">By source</option>
          </select>
          <label className="artifacts-toolbar-toggle ui-toggle">
            <input
              aria-label="Reviewed"
              type="checkbox"
              checked={analyzedOnly}
              onChange={(event) => setAnalyzedOnly(event.target.checked)}
            />
            <span className="ui-toggle-switch" aria-hidden="true" />
            <span>Reviewed</span>
          </label>
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
                    <div className="detail-stack">{renderDetailText(selectedArtifact.summary, `${selectedArtifact.id}-summary`)}</div>
                    {selectedArtifact.derivedOutputs?.length ? (
                      <div className="artifacts-tag-row">
                        {selectedArtifact.derivedOutputs.map((item) => (
                          <Pill key={item} tone="accent">{item}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedArtifact.diagnostics?.length ? (
                  <div className="artifacts-detail-block">
                    <strong>Diagnostics</strong>
                    <div className="detail-stack">
                      {selectedArtifact.diagnostics.map((item) => (
                        <div key={item} className="artifacts-detail-entry">
                          {renderDetailText(item, `${selectedArtifact.id}-${item}`)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
