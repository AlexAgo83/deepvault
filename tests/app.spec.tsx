import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { downloadTextFile } from '../src/lib/file-download'

vi.mock('../src/lib/file-download', () => ({
  downloadTextFile: vi.fn(),
}))

describe('DeepVault app', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.body.removeAttribute('data-theme')
    window.location.hash = ''
  })

  it('renders the explorer shell', async () => {
    render(<App />)

    await waitFor(() => expect(document.title).toBe('Nexus'))
    expect(screen.getByRole('dialog', { name: /getting started/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bishop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Knowledge' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Artifacts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(document.querySelectorAll('.nav-item-icon svg')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: 'Ask Bishop' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Version 1\.0\.0/)).not.toBeInTheDocument()
    expect(screen.queryByText('State')).not.toBeInTheDocument()
    expect(screen.queryByText('Pilot sites')).not.toBeInTheDocument()
  })

  it('opens the getting started modal on app load and dismisses it', async () => {
    const user = userEvent.setup()
    render(<App />)

    const dialog = screen.getByRole('dialog', { name: /getting started/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/DeepVault is a local-first command center/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start exploring' }))

    expect(screen.queryByRole('dialog', { name: /getting started/i })).not.toBeInTheDocument()
  })

  it('closes the getting started modal when switching away from Explorer', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('dialog', { name: /getting started/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.queryByRole('dialog', { name: /getting started/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('returns to Bishop after asking a question', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    expect(screen.getByRole('checkbox', { name: 'Keep context' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()
    expect(screen.getByText('Bishop is drafting the answer from grounded sources.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show right panel' }))
    expect(await screen.findByText('Orchestration')).toBeInTheDocument()
    expect(await screen.findByText('fallback')).toBeInTheDocument()
    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('submits Bishop from the keyboard when Enter is pressed', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    const questionField = screen.getByLabelText('Ask a question')
    await user.type(questionField, 'What is the budget for Q3 2025?')
    await user.click(questionField)
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()
    expect(screen.getByText('Bishop is drafting the answer from grounded sources.')).toBeInTheDocument()
    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('lets the bishop context toggle be changed from the conversation header', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))

    const toggle = screen.getByRole('checkbox', { name: 'Keep context' })
    expect(toggle).toBeChecked()

    await user.click(toggle)

    expect(toggle).not.toBeChecked()
    expect(localStorage.getItem('deepvault_bishop_context_enabled')).toBe('false')
  })

  it('lets Settings tune the assistant context payload', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Assistant context' }))

    expect(screen.getByRole('button', { name: 'Assistant context' })).toHaveAttribute('aria-current', 'page')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Keep conversation context' }), 'disabled')
    const [sourceLimitInput, candidatePoolInput, historyTurnsInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(sourceLimitInput, { target: { value: '5' } })
    fireEvent.change(candidatePoolInput, { target: { value: '14' } })
    fireEvent.change(historyTurnsInput, { target: { value: '4' } })

    expect(localStorage.getItem('deepvault_bishop_context_enabled')).toBe('false')
    expect(JSON.parse(localStorage.getItem('deepvault_bishop_settings') || '{}')).toEqual({
      sourceLimit: 5,
      candidateLimit: 14,
      historyTurnLimit: 4,
    })
  })

  it('shows the answer trace metrics after bishop responds', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))
    await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')
    await user.click(screen.getByRole('button', { name: 'Show right panel' }))

    const answerTrace = screen.getByText('Answer trace').closest('aside')
    expect(answerTrace).not.toBeNull()
    expect(within(answerTrace as HTMLElement).getByText('Chunk count')).toBeInTheDocument()
    expect(within(answerTrace as HTMLElement).getByText('Token count')).toBeInTheDocument()
    expect(within(answerTrace as HTMLElement).getByText('Latency')).toBeInTheDocument()
    expect(within(answerTrace as HTMLElement).getByRole('button', { name: 'Show' })).toBeInTheDocument()
    await waitFor(() => expect(within(answerTrace as HTMLElement).getByText('answered')).toBeInTheDocument())
  })

  it('shows and hides AI View response details with focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))
    await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')

    await user.click(screen.getByRole('button', { name: 'AI View' }))

    expect(screen.getByRole('heading', { name: 'AI View' })).toBeInTheDocument()
    expect(screen.getByText('Responses')).toBeInTheDocument()
    expect(screen.getByText('What would help next')).toBeInTheDocument()

    const responseCard = screen.getAllByRole('button', { name: /what is the budget for q3 2025\?/i })[0]
    act(() => {
      responseCard.focus()
    })

    expect(document.activeElement).toBe(responseCard)
    expect(screen.getByText('What would help next')).toBeInTheDocument()
    await user.click(within(responseCard).getByRole('button', { name: 'Show what would help next' }))
    expect(screen.getAllByText(/document title|site name|keyword/i).length).toBeGreaterThan(0)

    act(() => {
      fireEvent.blur(responseCard, { relatedTarget: null })
    })
    expect(document.activeElement).not.toBe(responseCard)
    await waitFor(() => expect(responseCard).toHaveAttribute('aria-expanded', 'false'))
  })

  it('keeps explorer search hidden while bishop is active', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))

    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()
  })

  it('hides the KPI strip on explorer and bishop while keeping it on sync', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByText('Sites in scope')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByText('Sites in scope')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    const kpiGrid = document.querySelector('.kpi-grid')
    expect(kpiGrid).not.toBeNull()
    expect(kpiGrid).toHaveTextContent('Sites in scope')
    expect(kpiGrid).toHaveTextContent('Visible docs')
    expect(kpiGrid).toHaveTextContent('Last refresh')
    expect(kpiGrid).toHaveTextContent('Provider readiness')
  })

  it('collapses the sidebar into an icon rail from the sidebar toggle button', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const shell = container.querySelector('.app-shell')
    expect(shell).not.toHaveClass('app-shell-sidebar-collapsed')

    const sidebarToggle = container.querySelector('.sidebar-collapse-button')
    expect(sidebarToggle).not.toBeNull()

    await user.click(sidebarToggle as HTMLElement)

    expect(shell).toHaveClass('app-shell-sidebar-collapsed')
    expect(container.querySelector('.sidebar')).toHaveClass('sidebar-collapsed')
    expect(container.querySelector('.sidebar-collapse-button')).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.topbar-menu-button')).toBeNull()
  })

  it('loads explorer rows progressively as the sentinel enters view', async () => {
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
    render(<App />)

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()
    expect(document.querySelectorAll('.document-row')).toHaveLength(0)
    expect(screen.getByText('No strong matches found.')).toBeInTheDocument()

    await waitFor(() => expect(observerCallback).toBeNull())
  })

  it('marks the active navigation tab for accessibility', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))

    expect(screen.getByRole('button', { name: 'Explorer' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Knowledge' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens settings and persists provider keys for the current browser', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'AI providers' }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI API key')).toBeInTheDocument()

    await user.type(screen.getByLabelText('OpenAI API key'), 'test-openai-key')

    expect(JSON.parse(localStorage.getItem('deepvault_provider_secrets') || '{}')).toMatchObject({
      openaiApiKey: 'test-openai-key',
      geminiApiKey: '',
      anthropicApiKey: '',
    })
  })

  it('persists the selected runtime role for the current browser', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.selectOptions(screen.getByLabelText('Role'), 'guest')

    expect(localStorage.getItem('deepvault_runtime_role')).toBe('guest')
    expect(screen.getByLabelText('Role')).toHaveValue('guest')

    unmount()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByLabelText('Role')).toHaveValue('guest')
  })

  it('stays operable when a live corpus loads without providers or documents', async () => {
    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: '1.1',
        defaultUserRole: 'analyst',
        providers: [],
        sites: [],
        syncRuns: [],
        documents: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/corpus'))).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('Provider')).toHaveValue('openai')
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
  })

  it('derives provider readiness from session keys even when the live corpus snapshot marks providers unavailable', async () => {
    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: '1.1',
        defaultUserRole: 'analyst',
        providers: [
          { id: 'openai', name: 'OpenAI', ready: false },
          { id: 'gemini', name: 'Gemini', ready: false },
          { id: 'anthropic', name: 'Claude', ready: false },
        ],
        sites: [],
        syncRuns: [],
        documents: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/corpus'))).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'AI providers' }))
    await user.type(screen.getByLabelText('OpenAI API key'), 'test-openai-key')
    await user.click(screen.getByRole('button', { name: 'Knowledge' }))

    const kpiGrid = document.querySelector('.kpi-grid')
    expect(kpiGrid).not.toBeNull()
    expect(kpiGrid).toHaveTextContent('Provider readiness')
    expect(kpiGrid).toHaveTextContent('1')
  })

  it('shows the changelog panel in Settings and toggles it from the topbar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Changelogs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide right panel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide right panel' }))
    expect(screen.queryByRole('heading', { name: 'Changelogs' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show right panel' }))
    expect(screen.getByRole('heading', { name: 'Changelogs' })).toBeInTheDocument()
  })

  it('uses the worker bishop proxy when Bishop answers a question', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'answered',
        provider: 'openai',
        answer: 'OpenAI remote answer.',
        chunkCount: 18,
        tokenCount: 133,
        inputTokenCount: 111,
        outputTokenCount: 22,
        latencyMs: 480,
        confidence: 88,
        trace: {
          mode: 'remote',
          providerTracePreview: 'openai response: OpenAI remote answer.',
          prompt: 'prompt',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'AI providers' }))
    await user.type(screen.getByLabelText('OpenAI API key'), 'test-openai-key')
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(await screen.findByText('OpenAI remote answer.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bishop/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
        }),
      }),
    )
  })

  it('shows the live corpus missing badge when live corpus data is missing', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('should not be called')
      },
    })

    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(await screen.findByText('Live corpus missing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Live corpus missing/ })).toBeInTheDocument()
  })

  it('shows the offline worker indicator when live mode is selected without network', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))

    vi.stubEnv('VITE_DEEPVAULT_DATA_MODE', 'live')
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(await screen.findByText('Offline — worker unreachable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Offline — worker unreachable/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    expect(screen.getByText('No permitted sources matched this search.')).toBeInTheDocument()
  })

  it('renders sync run notes and counts in the sync panel', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))

    // Status view is shown by default
    expect(screen.getByText('Synced sites')).toBeInTheDocument()

    // History view contains run history and evaluation prep
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText('Run history')).toBeInTheDocument()
    expect(screen.getByText('Evaluation prep')).toBeInTheDocument()
  })

  it('streams sync operations into the console and tracks recent runs', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-job-1' }),
    }))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))

    // Click opens the confirm modal — confirm to start the operation
    fireEvent.click(screen.getByRole('button', { name: 'Ingest' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Ingest' })
    expect(confirmDialog).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Ingest' }))

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()

    // Flush fetch promise and EventSource setup
    await act(async () => {})

    // Simulate a stdout line from the real process
    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'line', text: 'Starting local ingestion pipeline...' }) } as MessageEvent)
    })

    expect(screen.getAllByText((_, element) => element?.textContent?.includes('Starting local ingestion pipeline...') === true).length).toBeGreaterThan(0)

    // Simulate process exit with success
    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 0 }) } as MessageEvent)
    })

    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ingest').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText('Run history')).toBeInTheDocument()
    expect(screen.getAllByText((_, element) => element?.textContent?.includes('Starting local ingestion pipeline...') === true).length).toBeGreaterThan(0)
  })

  it('marks job as failed when SSE connection errors', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-job-err' }),
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingest' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Ingest' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Ingest' }))

    await act(async () => {})

    await act(async () => {
      mockEs?.onerror?.()
    })

    expect(screen.getAllByText('failed').length).toBeGreaterThan(0)
  })

  it('cancels a running job and sends the cancel request to the server', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }

    let mockEs: MockEventSource | null = null

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-job-cancel' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingest' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Ingest' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Ingest' }))

    // Flush fetch so serverJobId is stored
    await act(async () => {})

    expect(mockEs).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }))

    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).includes('/api/jobs/test-job-cancel/cancel') &&
          typeof options === 'object' &&
          options !== null &&
          'method' in options &&
          (options as RequestInit).method === 'POST',
      ),
    ).toBe(true)
    expect(screen.getAllByText('cancelled').length).toBeGreaterThan(0)
  })

  it('marks job as failed when the ops server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    vi.stubGlobal('EventSource', vi.fn())

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingest' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Ingest' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Ingest' }))

    await act(async () => {})

    expect(screen.getAllByText('failed').length).toBeGreaterThan(0)
  })

  it('confirms and starts refresh from the control panel and completes', async () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Refresh' })
    expect(confirmDialog).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(2000) })

    expect(screen.getAllByText('completed').length).toBeGreaterThan(0)
  })

  it('confirms and starts evaluate from the control panel', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-evaluate' }),
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Evaluate' })
    expect(confirmDialog).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Evaluate' }))

    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()
  })

  it('shows duration in minutes for long-running jobs', async () => {
    type MockEventSource = {
      onmessage: ((_e: MessageEvent) => void) | null
      onerror: (() => void) | null
      close: ReturnType<typeof vi.fn>
    }
    let mockEs: MockEventSource | null = null

    vi.useFakeTimers()
    const startTime = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(startTime)

    vi.stubGlobal('EventSource', vi.fn(() => {
      mockEs = { onmessage: null, onerror: null, close: vi.fn() }
      return mockEs
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'long-job' }),
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ingest' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Ingest' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Ingest' }))

    await act(async () => { vi.runAllTicks() })

    vi.setSystemTime(new Date(startTime.getTime() + 65000))

    await act(async () => {
      mockEs?.onmessage?.({ data: JSON.stringify({ type: 'done', exitCode: 0 }) } as MessageEvent)
    })

    expect(screen.getAllByText((_, el) => el?.textContent?.includes('1m') === true).length).toBeGreaterThan(0)
  })

  it('confirms and starts resume live export from the control panel', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-export-resume' }),
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resume Sync' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Resume Sync' })
    expect(confirmDialog).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Resume Sync' }))

    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()
  })

  it('confirms and starts live export from the control panel', async () => {
    vi.stubGlobal('EventSource', vi.fn(() => ({ onmessage: null, onerror: null, close: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'test-export-live' }),
    }))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Sync' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Start Sync' })
    expect(confirmDialog).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Start Sync' }))

    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument()
  })

  it('keeps the explorer detail pane within the selected site scope', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('No strong matches found.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Pilot Site Beta' }))
    expect(screen.getByText('Site scope')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.getByRole('heading', { name: 'Known SSO implementation issues' })).toBeInTheDocument()
    expect(screen.getByText('No strong matches found.')).toBeInTheDocument()
  })

  it('shows the sync tab without runtime controls and the empty explorer state for an impossible filter', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()

    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText('Run history')).toBeInTheDocument()
    expect(screen.queryByText('AI providers')).not.toBeInTheDocument()
    expect(screen.queryByText('Site scope')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.type(screen.getByLabelText('Explorer search'), 'budget')

    expect(screen.getByText('No visible document')).toBeInTheDocument()
    expect(screen.getByText('No permitted sources match the current site filter.')).toBeInTheDocument()
  })

  it('keeps Bishop answers scoped to the selected site context', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(await screen.findByText('No relevant content was found in the indexed pilot corpus.')).toBeInTheDocument()
  })

  it('restores bishop history from localStorage', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      'deepvault_bishop_history',
      JSON.stringify({
        exportedAt: '2026-04-12T00:00:00.000Z',
        messages: [
          {
            id: 'seed',
            role: 'assistant',
            text: 'Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.',
            status: 'ready',
            sources: [],
            createdAt: '2026-04-12T00:00:00.000Z',
          },
          {
            id: 'saved-answer',
            role: 'assistant',
            text: 'Saved Bishop answer.',
            status: 'answered',
            sources: [],
            createdAt: '2026-04-12T00:01:00.000Z',
          },
        ],
      }),
    )

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.getByText('Saved Bishop answer.')).toBeInTheDocument()
  })

  it('renders the theme toggle button in the sidebar and toggles the theme', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: /switch to dark mode/i })
    expect(toggle).toBeInTheDocument()

    await user.click(toggle)

    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('deepvault_theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: /switch to light mode/i }))

    expect(localStorage.getItem('deepvault_theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('renders leading icons on every sidebar nav item (AC1)', async () => {
    render(<App />)

    const sidebar = document.querySelector('.sidebar')
    expect(sidebar).not.toBeNull()

    const navItems = sidebar!.querySelectorAll('.nav-item')
    expect(navItems).toHaveLength(6)

    for (const item of navItems) {
      const icon = item.querySelector('.nav-item-icon svg')
      expect(icon).not.toBeNull()
    }
  })

  it('provides distinct aria-labels on sidebar nav sections (AC1/AC4)', async () => {
    render(<App />)

    const primaryNav = screen.getByRole('navigation', { name: 'Primary navigation' })
    const appNav = screen.getByRole('navigation', { name: 'Application panels' })

    expect(primaryNav).toBeInTheDocument()
    expect(appNav).toBeInTheDocument()

    expect(within(primaryNav).getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
    expect(within(primaryNav).getByRole('button', { name: 'Bishop' })).toBeInTheDocument()

    expect(within(appNav).getByRole('button', { name: 'Knowledge' })).toBeInTheDocument()
    expect(within(appNav).getByRole('button', { name: 'AI View' })).toBeInTheDocument()
    expect(within(appNav).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('keeps runtime controls in Settings and operations in Sync (AC2/AC5)', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Settings owns runtime controls
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByText('Site scope')).toBeInTheDocument()
    expect(screen.getByText('Data mode')).toBeInTheDocument()

    // Settings does NOT own sync operations
    expect(screen.queryByRole('button', { name: 'Ingest' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()

    // Knowledge owns operations (in Operations sub-view)
    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    await user.click(screen.getByRole('button', { name: 'Operations' }))
    expect(screen.getByRole('button', { name: 'Ingest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()

    // Knowledge does NOT own runtime controls
    expect(screen.queryByText('Site scope')).not.toBeInTheDocument()
    expect(screen.queryByText('Data mode')).not.toBeInTheDocument()
  })

  it('displays runtime context pills in the topbar across all tabs (AC3)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    const topbar = document.querySelector('.topbar')
    expect(topbar).not.toBeNull()
    const infoButton = within(topbar as HTMLElement).getByRole('button', { name: 'Hide topbar details' })

    // Topbar shows runtime pills on default tab (Explorer)
    const badges = topbar!.querySelector('.topbar-badges')
    expect(badges).not.toBeNull()
    expect(within(badges as HTMLElement).getByText('analyst')).toBeInTheDocument()
    expect(within(badges as HTMLElement).getByText('openai')).toBeInTheDocument()
    expect(within(badges as HTMLElement).getByText('All sites')).toBeInTheDocument()

    await user.click(infoButton)
    expect(within(topbar as HTMLElement).queryByText('analyst')).not.toBeInTheDocument()
    expect(within(topbar as HTMLElement).queryByText('openai')).not.toBeInTheDocument()
    expect(within(topbar as HTMLElement).queryByText('All sites')).not.toBeInTheDocument()

    await user.click(within(topbar as HTMLElement).getByRole('button', { name: 'Show topbar details' }))
    expect(within(topbar as HTMLElement).getByText('analyst')).toBeInTheDocument()
    expect(within(topbar as HTMLElement).getByText('openai')).toBeInTheDocument()

    // Topbar pills persist when switching to Bishop
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(within(badges as HTMLElement).getByText('analyst')).toBeInTheDocument()
    expect(within(badges as HTMLElement).getByText('openai')).toBeInTheDocument()

    // Topbar pills persist when switching to Sync
    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(within(badges as HTMLElement).getByText('analyst')).toBeInTheDocument()
    expect(within(badges as HTMLElement).getByText('openai')).toBeInTheDocument()

    await user.click(infoButton)
    expect(within(topbar as HTMLElement).queryByText('analyst')).not.toBeInTheDocument()

    unmount()
    render(<App />)
    const remountedTopbar = document.querySelector('.topbar')
    expect(remountedTopbar).not.toBeNull()
    expect(within(remountedTopbar as HTMLElement).queryByText('analyst')).not.toBeInTheDocument()
  })

  it('opens the matching screen when clicking the topbar pills', async () => {
    const user = userEvent.setup()
    render(<App />)

    const topbar = document.querySelector('.topbar')
    expect(topbar).not.toBeNull()

    const topbarRoot = topbar as HTMLElement

    await user.click(topbarRoot.querySelector('.topbar-badge-group-status .topbar-pill-button') as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()

    await user.click(within(topbarRoot).getByText('openai').closest('button') as HTMLElement)
    expect(screen.getByRole('button', { name: 'AI providers' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('OpenAI API key')).toBeInTheDocument()

    await user.click(within(topbarRoot).getByText('analyst').closest('button') as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()

    await user.click(within(topbarRoot).getByText('All sites').closest('button') as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Site scope')).toBeInTheDocument()

    await user.click(within(topbarRoot).getByText('Synced').closest('button') as HTMLElement)
    expect(screen.getByRole('heading', { name: 'Knowledge View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Status' })).toHaveAttribute('aria-current', 'page')
  })

  it('toggles the stats headers from the topbar stats button', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Hide stats headers' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('button', { name: 'Hide stats headers' })).toBeInTheDocument()
    expect(screen.getByText('Sites in scope')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide stats headers' }))
    expect(screen.queryByText('Sites in scope')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(screen.getByRole('button', { name: 'Hide stats headers' })).toBeInTheDocument()
    expect(screen.getByText('Sites in scope')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'AI View' }))
    expect(screen.getByRole('button', { name: 'Hide stats headers' })).toBeInTheDocument()
    expect(await screen.findByText('Responses')).toBeInTheDocument()
    expect(screen.getByText('Need hints')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('button', { name: 'Show stats headers' })).toBeInTheDocument()
    expect(screen.queryByText('Sites in scope')).not.toBeInTheDocument()
  })

  it('toggles the right panel from the topbar question button', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Hide right panel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByText('Answer trace')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show right panel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show right panel' }))
    expect(screen.getByText('Answer trace')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide right panel' }))
    expect(screen.queryByText('Answer trace')).not.toBeInTheDocument()
  })

  it('keeps the right panel visibility independent per screen and persists it', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Hide right panel' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide right panel' }))
    expect(screen.queryByText('Details')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByText('Answer trace')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show right panel' }))
    expect(screen.getByText('Answer trace')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide right panel' }))
    expect(screen.queryByText('Answer trace')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    expect(screen.getByRole('button', { name: 'Show right panel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show right panel' }))
    expect(screen.getByText('Details')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByText('Answer trace')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('supports keyboard tab navigation through sidebar items (AC4)', async () => {
    const user = userEvent.setup()
    render(<App />)

    const explorerBtn = screen.getByRole('button', { name: 'Explorer' })
    explorerBtn.focus()
    expect(document.activeElement).toBe(explorerBtn)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bishop' }))

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Knowledge' }))

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Artifacts' }))

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'AI View' }))

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }))
  })

  it('restores the sync recovery view from the location hash and keeps it shareable', async () => {
    window.location.hash = '#tab=sync&sync=recovery'

    render(<App />)

    await screen.findByRole('button', { name: 'Worker' })
    expect(screen.getByRole('button', { name: 'Worker' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('heading', { name: 'Recovery' }).length).toBeGreaterThan(0)
    expect(window.location.hash).toBe('#tab=sync&sync=config')
  })

  it('exports Bishop and Explorer data and clears Bishop history', async () => {
    const user = userEvent.setup()
    const mockedDownload = vi.mocked(downloadTextFile)

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.click(screen.getByRole('button', { name: 'Export JSON' }))

    expect(mockedDownload).toHaveBeenCalledWith(
      expect.stringContaining('deepvault-bishop-'),
      expect.stringContaining('"messages"'),
      'application/json',
    )

    await user.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(localStorage.getItem('deepvault_bishop_history')).toBeNull()
    expect(screen.getByText('Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.click(screen.getByRole('button', { name: 'Export MD' }))

    expect(mockedDownload).toHaveBeenCalledWith(
      expect.stringContaining('deepvault-explorer-'),
      expect.stringContaining('# Explorer results export'),
      'text/markdown',
    )
  })
})
