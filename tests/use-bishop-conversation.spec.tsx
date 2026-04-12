import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import {
  BISHOP_CONTEXT_STORAGE_KEY,
  BISHOP_HISTORY_STORAGE_KEY,
  useBishopConversation,
} from '../src/hooks/useBishopConversation'

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

describe('useBishopConversation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('loads an array payload from storage and restores the seeded history', async () => {
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
})
