import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { useLiveCorpus } from '../src/hooks/useLiveCorpus'

function LiveCorpusProbe({ mode }: { mode: string }) {
  const { corpusBundle, liveState } = useLiveCorpus(mode)

  return (
    <div>
      <span data-testid="mode">{corpusBundle.mode}</span>
      <span data-testid="label">{liveState.label}</span>
      <span data-testid="detail">{liveState.detail}</span>
    </div>
  )
}

describe('useLiveCorpus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('promotes a valid live corpus to live mode', async () => {
    const { corpus } = getMockCorpusBundle()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => corpus,
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<LiveCorpusProbe mode="live" />)

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('live'))
    expect(screen.getByTestId('label')).toHaveTextContent('Live')
    expect(screen.getByTestId('detail')).toHaveTextContent('Live corpus loaded')
  })

  it('falls back to mock data when the live corpus payload is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        defaultUserRole: 'invalid',
        providers: [],
        sites: [],
        syncRuns: [],
        documents: [],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<LiveCorpusProbe mode="live" />)

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('mock'))
    expect(screen.getByTestId('label')).toHaveTextContent('Live error')
    expect(screen.getByTestId('detail')).toHaveTextContent('not a valid corpus')
  })

  it('falls back to mock data with an offline indicator when the live corpus request fails offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })

    render(<LiveCorpusProbe mode="live" />)

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('mock'))
    expect(screen.getByTestId('label')).toHaveTextContent('Offline — corpus mock')
    expect(screen.getByTestId('detail')).toHaveTextContent('Hors-ligne — corpus mock actif')
  })

  it('resets to mock data immediately when live mode is not requested', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<LiveCorpusProbe mode="mock" />)

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('mock'))
    expect(screen.getByTestId('label')).toHaveTextContent('Mock data')
    expect(screen.getByTestId('detail')).toHaveTextContent('Mock corpus selected')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
