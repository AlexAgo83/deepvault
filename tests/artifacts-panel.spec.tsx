import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { ArtifactsPanel } from '../src/components/panels/artifacts-panel'
import { getMockCorpusBundle } from '../src/data/corpus'

afterEach(() => {
  window.localStorage.clear()
})

describe('ArtifactsPanel', () => {
  it('defaults the artifact filter to processed files', () => {
    const corpus = getMockCorpusBundle().corpus

    render(
      <ArtifactsPanel
        corpus={corpus}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={false}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getByLabelText('Artifact filter')).toHaveValue('processed-file')
  })

  it('persists artifact filter and grouping selections', async () => {
    const user = userEvent.setup()
    const corpus = getMockCorpusBundle().corpus

    const props = {
      corpus,
      messages: [] as never,
      resolveFileHref: () => null,
      showRightPanel: false,
      syncOperations: {
        activeJob: null,
        cancelActiveJob: () => undefined,
        history: [],
        isRunning: false,
        lastCompletedJob: null,
        startAnalyze: () => undefined,
        startPublishAnalysis: () => undefined,
        startEvaluate: () => undefined,
        startExportLive: () => undefined,
        startExportLiveResume: () => undefined,
        startIngest: () => undefined,
        startRefresh: () => undefined,
      },
    }

    const { unmount } = render(<ArtifactsPanel {...props} />)

    await user.selectOptions(screen.getByLabelText('Artifact filter'), 'analysis')
    await user.selectOptions(screen.getByLabelText('Artifact grouping'), 'source')
    await user.click(screen.getByLabelText('Reviewed'))

    expect(window.localStorage.getItem('deepvault_artifacts_filter')).toBe('analysis')
    expect(window.localStorage.getItem('deepvault_artifacts_group')).toBe('source')
    expect(window.localStorage.getItem('deepvault_artifacts_analyzed_only')).toBe('true')

    unmount()

    render(<ArtifactsPanel {...props} />)

    expect(screen.getByLabelText('Artifact filter')).toHaveValue('analysis')
    expect(screen.getByLabelText('Artifact grouping')).toHaveValue('source')
    expect(screen.getByLabelText('Reviewed')).toBeChecked()
  })

  it('filters processed files down to already analyzed documents', async () => {
    const user = userEvent.setup()
    const corpus = getMockCorpusBundle().corpus

    render(
      <ArtifactsPanel
        corpus={{
          ...corpus,
          documents: [
            {
              ...corpus.documents[0],
              id: 'doc-analyzed',
              title: 'Analyzed budget note',
              analysis: {
                status: 'analyzed',
                version: '1.0',
                analyzedAt: '2026-04-17T10:00:00.000Z',
                summary: 'Analyzed summary',
              },
            },
            {
              ...corpus.documents[1],
              id: 'doc-stale',
              title: 'Stale budget note',
              analysis: {
                status: 'stale',
                version: '1.0',
                analyzedAt: '2026-04-17T11:00:00.000Z',
                summary: 'Stale summary',
              },
            },
            {
              ...corpus.documents[2],
              id: 'doc-raw',
              title: 'Raw budget note',
              analysis: undefined,
            },
          ],
        }}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={false}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: /analyzed budget note/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stale budget note/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /raw budget note/i })).toBeInTheDocument()

    await user.click(screen.getByLabelText('Reviewed'))

    expect(screen.getByRole('button', { name: /analyzed budget note/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /stale budget note/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /raw budget note/i })).not.toBeInTheDocument()
  })

  it('renders processed files and shows a detail record', async () => {
    const user = userEvent.setup()
    const corpus = getMockCorpusBundle().corpus

    render(
      <ArtifactsPanel
        corpus={{
          ...corpus,
          documents: [
            {
              ...corpus.documents[0],
              analysis: {
                status: 'analyzed',
                version: '1.0',
                provider: 'local',
                model: 'heuristic-v1',
                analyzedAt: '2026-04-17T10:00:00.000Z',
                summary: 'Enriched summary',
                keywords: ['budget', 'q3'],
                sections: [{ heading: 'Overview', content: 'Enriched section' }],
              },
            },
          ],
        }}
        messages={[] as never}
        resolveFileHref={() => 'https://example.test/doc'}
        showRightPanel={true}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /q3 2025 budget approval/i })[0])
    expect(screen.getByText('Processed record')).toBeInTheDocument()
    expect(screen.getByText('Enriched summary')).toBeInTheDocument()
    expect(screen.getByText('analysis summary')).toBeInTheDocument()
  })

  it('loads more artifacts when the lazy sentinel intersects', async () => {
    let observerCallback: IntersectionObserverCallback | null = null
    const observe = vi.fn()
    const disconnect = vi.fn()

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }

      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
      takeRecords = vi.fn(() => [])
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    const corpus = getMockCorpusBundle().corpus
    const documents = Array.from({ length: 40 }, (_, index) => ({
      ...corpus.documents[index % corpus.documents.length],
      id: `artifact-${index}`,
      title: `Artifact ${index}`,
      updatedAt: `2026-04-${String((index % 20) + 1).padStart(2, '0')}T10:00:00.000Z`,
    }))

    const { container } = render(
      <ArtifactsPanel
        corpus={{ ...corpus, documents }}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={false}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(container.querySelectorAll('.artifacts-row').length).toBe(24)
    expect(observerCallback).not.toBeNull()

    act(() => {
      observerCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    await waitFor(() => expect(container.querySelectorAll('.artifacts-row').length).toBeGreaterThan(24))
  })

  it('shows the analysis report artifact when analysis data exists', () => {
    const corpus = getMockCorpusBundle().corpus
    window.localStorage.setItem('deepvault_artifacts_filter', 'all')

    render(
      <ArtifactsPanel
        corpus={{
          ...corpus,
          documents: [
            {
              ...corpus.documents[0],
              analysis: {
                status: 'analyzed',
                version: '1.0',
                analyzedAt: '2026-04-17T10:00:00.000Z',
                summary: 'Enriched summary',
              },
            },
          ],
        }}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={false}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: /latest analysis report/i })).toBeInTheDocument()
  })

  it('keeps successful ingest records focused on the outcome instead of showing raw execution text', async () => {
    const user = userEvent.setup()
    const corpus = getMockCorpusBundle().corpus
    window.localStorage.setItem('deepvault_artifacts_filter', 'all')

    render(
      <ArtifactsPanel
        corpus={corpus}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={true}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [
            {
              id: 'ingest-1',
              kind: 'ingest',
              label: 'Ingest',
              command: 'npm run ingest',
              status: 'completed',
              progress: 100,
              startedAt: '2026-04-17T06:38:56.549Z',
              finishedAt: '2026-04-17T06:38:56.576Z',
              summary: 'Wrote a new local sync snapshot.',
              lines: [
                {
                  id: 'line-1',
                  timestamp: '2026-04-17T06:38:56.549Z',
                  tone: 'muted',
                  text: '$ npm run ingest\nScope: All sites\nRole: admin | Provider: openai\nVisible docs: 27662 | Synced sites: 2 | Restricted sites: 0\nRefresh policy: Incremental daily refresh with manual refresh on demand\nWorker mode: local | Fallback: read_only',
                },
                {
                  id: 'line-2',
                  timestamp: '2026-04-17T06:38:56.576Z',
                  tone: 'success',
                  text: 'Wrote a new local sync snapshot.',
                },
              ],
            },
          ],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: /ingest/i })[0])

    expect(screen.getAllByText('Wrote a new local sync snapshot.')).toHaveLength(1)
    expect(screen.queryByText('$ npm run ingest')).not.toBeInTheDocument()
    expect(screen.queryByText('All sites')).not.toBeInTheDocument()
    expect(screen.queryByText('admin | Provider: openai')).not.toBeInTheDocument()
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-04-17T06:38:56.549Z')).not.toBeInTheDocument()
    expect(screen.getByText('17 Apr 2026')).toBeInTheDocument()
  })

  it('keeps successful refresh records focused on the outcome instead of showing raw execution text', () => {
    const corpus = getMockCorpusBundle().corpus
    window.localStorage.setItem('deepvault_artifacts_filter', 'all')

    render(
      <ArtifactsPanel
        corpus={corpus}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={true}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [
            {
              id: 'refresh-1',
              kind: 'refresh',
              label: 'Refresh',
              command: 'refresh',
              status: 'completed',
              progress: 100,
              startedAt: '2026-04-17T00:02:45.000Z',
              finishedAt: '2026-04-17T00:02:46.000Z',
              summary: 'Refreshed the current corpus snapshot.',
              lines: [
                {
                  id: 'line-1',
                  timestamp: '2026-04-17T00:02:45.000Z',
                  tone: 'muted',
                  text: '$ refresh\nScope: All sites\nRole: admin | Provider: openai\nVisible docs: 27662 | Synced sites: 2 | Restricted sites: 0\nRefresh policy: Incremental daily refresh with manual refresh on demand\nWorker mode: local | Fallback: read_only\nRefreshing the current corpus snapshot...\nReading the latest live corpus state and scope filters...\nUpdating site coverage, freshness, and readiness signals...\nRefresh completed successfully.',
                },
              ],
            },
          ],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getAllByText('Refreshed the current corpus snapshot.')).toHaveLength(1)
    expect(screen.queryByText('Execution')).not.toBeInTheDocument()
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument()
    expect(screen.queryByText('Refreshing the current corpus snapshot...')).not.toBeInTheDocument()
    expect(screen.queryByText('Reading the latest live corpus state and scope filters...')).not.toBeInTheDocument()
    expect(screen.queryByText('Updating site coverage, freshness, and readiness signals...')).not.toBeInTheDocument()
    expect(screen.queryByText('Refresh completed successfully.')).not.toBeInTheDocument()
  })

  it('uses the real worker error as the failed run summary and removes duplicate generic failures', () => {
    const corpus = getMockCorpusBundle().corpus
    window.localStorage.setItem('deepvault_artifacts_filter', 'all')

    render(
      <ArtifactsPanel
        corpus={corpus}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={true}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [
            {
              id: 'export-live-1',
              kind: 'export-live',
              label: 'Start Sync',
              command: 'npm run export:live',
              status: 'failed',
              progress: 0,
              startedAt: '2026-04-17T00:02:45.000Z',
              finishedAt: '2026-04-17T00:02:46.000Z',
              summary: 'Start Sync failed.',
              lines: [
                { id: 'line-1', timestamp: '2026-04-17T00:02:45.000Z', tone: 'danger', text: 'Operation failed.' },
                { id: 'line-2', timestamp: '2026-04-17T00:02:45.100Z', tone: 'danger', text: 'Operation failed.' },
                {
                  id: 'line-3',
                  timestamp: '2026-04-17T00:02:45.200Z',
                  tone: 'muted',
                  text: '$ npm run export:live\nScope: All sites\nRole: admin | Provider: openai',
                },
                {
                  id: 'line-4',
                  timestamp: '2026-04-17T00:02:45.300Z',
                  tone: 'danger',
                  text: 'Error: Auth request failed (401): {"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided."}',
                },
              ],
            },
          ],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getAllByText(/invalid client secret/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Use the client secret value, not the secret ID/i)).toBeInTheDocument()
    expect(screen.getByText(/AADSTS7000215/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Start Sync failed\.$/)).not.toBeInTheDocument()
    expect(screen.queryAllByText(/^Operation failed\.$/)).toHaveLength(0)
    expect(screen.queryByText(/throw new Error/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/deepvault-graph\.ts:234/i)).not.toBeInTheDocument()
  })

  it('hides diagnostics when a failed run only contains generic failure spam', () => {
    const corpus = getMockCorpusBundle().corpus
    window.localStorage.setItem('deepvault_artifacts_filter', 'all')

    render(
      <ArtifactsPanel
        corpus={corpus}
        messages={[] as never}
        resolveFileHref={() => null}
        showRightPanel={true}
        syncOperations={{
          activeJob: null,
          cancelActiveJob: () => undefined,
          history: [
            {
              id: 'failed-generic-1',
              kind: 'export-live',
              label: 'Start Sync',
              command: 'npm run export:live',
              status: 'failed',
              progress: 0,
              startedAt: '2026-04-17T00:02:45.000Z',
              finishedAt: '2026-04-17T00:02:46.000Z',
              summary: 'Start Sync failed.',
              lines: [
                { id: 'line-1', timestamp: '2026-04-17T00:02:45.000Z', tone: 'danger', text: 'Operation failed.' },
                { id: 'line-2', timestamp: '2026-04-17T00:02:45.100Z', tone: 'danger', text: 'Operation failed.' },
                { id: 'line-3', timestamp: '2026-04-17T00:02:45.200Z', tone: 'danger', text: 'Operation failed.' },
              ],
            },
          ],
          isRunning: false,
          lastCompletedJob: null,
          startAnalyze: () => undefined,
          startPublishAnalysis: () => undefined,
          startEvaluate: () => undefined,
          startExportLive: () => undefined,
          startExportLiveResume: () => undefined,
          startIngest: () => undefined,
          startRefresh: () => undefined,
        }}
      />,
    )

    expect(screen.getByText('Start Sync failed.')).toBeInTheDocument()
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument()
    expect(screen.queryAllByText(/^Operation failed\.$/)).toHaveLength(0)
  })
})
