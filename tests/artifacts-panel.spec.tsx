import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ArtifactsPanel } from '../src/components/panels/artifacts-panel'
import { getMockCorpusBundle } from '../src/data/corpus'

describe('ArtifactsPanel', () => {
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
})
