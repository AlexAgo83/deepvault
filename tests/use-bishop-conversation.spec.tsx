import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { orchestrateBishopAnswer } from '../src/lib/bishop'
import {
  BISHOP_CONTEXT_STORAGE_KEY,
  BISHOP_HISTORY_STORAGE_KEY,
  useBishopConversation,
} from '../src/hooks/useBishopConversation'

vi.mock('../src/lib/bishop', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/bishop')>('../src/lib/bishop')
  return {
    ...actual,
    orchestrateBishopAnswer: vi.fn(actual.orchestrateBishopAnswer),
  }
})

function BishopProbe() {
  const { conversationContextEnabled, messages, setConversationContextEnabled } = useBishopConversation({
    corpus: getMockCorpusBundle().corpus,
    role: 'analyst',
    provider: 'openai',
  })

  return (
    <div>
      <span data-testid="count">{messages.length}</span>
      <span data-testid="first">{messages[0]?.id || ''}</span>
      <span data-testid="last">{messages[messages.length - 1]?.id || ''}</span>
      <input
        aria-label="Keep context"
        type="checkbox"
        checked={conversationContextEnabled}
        onChange={(event) => setConversationContextEnabled(event.target.checked)}
      />
    </div>
  )
}

function BishopAskProbe() {
  const { question, setQuestion, handleAsk } = useBishopConversation({
    corpus: getMockCorpusBundle().corpus,
    role: 'analyst',
    provider: 'openai',
    bishopSettings: {
      sourceLimit: 5,
      candidateLimit: 14,
      historyTurnLimit: 2,
    },
  })

  return (
    <form onSubmit={handleAsk}>
      <input aria-label="Question" value={question} onChange={(event) => setQuestion(event.target.value)} />
      <button type="submit">Ask</button>
    </form>
  )
}

describe('useBishopConversation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('loads an array payload from local storage and restores the seeded history', async () => {
    window.localStorage.setItem(
      BISHOP_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'user-1',
          role: 'user',
          text: 'Question',
          status: '',
          sources: [],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Answer',
          status: 'answered',
          sources: [],
        },
      ]),
    )

    render(<BishopProbe />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    expect(screen.getByTestId('first')).toHaveTextContent('seed')
    expect(screen.getByTestId('last')).toHaveTextContent('assistant-1')
  })

  it('falls back to the seed message when no stored history exists', async () => {
    render(<BishopProbe />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('first')).toHaveTextContent('seed')
  })

  it('loads an object payload from storage and trims the history limit', async () => {
    const messages = Array.from({ length: 60 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `Message ${index}`,
      status: 'answered',
      sources: [],
    }))

    window.localStorage.setItem(
      BISHOP_HISTORY_STORAGE_KEY,
      JSON.stringify({
        messages,
      }),
    )

    render(<BishopProbe />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('50'))
    expect(screen.getByTestId('first')).toHaveTextContent('seed')
    expect(screen.getByTestId('last')).toHaveTextContent('message-59')
  })

  it('falls back to the seeded history when storage JSON is invalid', async () => {
    window.localStorage.setItem(BISHOP_HISTORY_STORAGE_KEY, '{"invalid":')

    render(<BishopProbe />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('first')).toHaveTextContent('seed')
  })

  it('migrates legacy bishop history from sessionStorage into localStorage', async () => {
    window.sessionStorage.setItem(
      BISHOP_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Legacy answer',
          status: 'answered',
          sources: [],
        },
      ]),
    )

    render(<BishopProbe />)

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
    expect(window.sessionStorage.getItem(BISHOP_HISTORY_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(BISHOP_HISTORY_STORAGE_KEY)).toContain('Legacy answer')
  })

  it('keeps conversation context enabled by default and persists the toggle', async () => {
    const user = userEvent.setup()
    render(<BishopProbe />)

    const checkbox = screen.getByRole('checkbox', { name: 'Keep context' })
    expect(checkbox).toBeChecked()
    expect(window.localStorage.getItem(BISHOP_CONTEXT_STORAGE_KEY)).toBe('true')

    await user.click(checkbox)

    expect(checkbox).not.toBeChecked()
    expect(window.localStorage.getItem(BISHOP_CONTEXT_STORAGE_KEY)).toBe('false')
  })

  it('passes the configured context settings into bishop orchestration', async () => {
    const user = userEvent.setup()
    const orchestrateMock = vi.mocked(orchestrateBishopAnswer)

    orchestrateMock.mockResolvedValueOnce({
      status: 'answered',
      provider: 'openai',
      query: 'What is the budget for Q3 2025?',
      answer: 'Configured answer',
      sources: [],
      deniedSources: [],
      chunkCount: 6,
      tokenCount: 120,
      latencyMs: 50,
      mode: 'fallback',
      prompt: 'prompt',
      confidenceScore: 60,
      providerTracePreview: 'trace',
      improvementHint: 'hint',
    })

    render(<BishopAskProbe />)

    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(orchestrateMock).toHaveBeenCalledTimes(1))
    expect(orchestrateMock.mock.calls[0]?.[2]).toMatchObject({
      limit: 5,
      candidateLimit: 14,
      conversationHistory: [],
    })
  })
})
