import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { useBishopConversation, BISHOP_HISTORY_STORAGE_KEY } from '../src/hooks/useBishopConversation'

function BishopProbe() {
  const { messages } = useBishopConversation({
    corpus: getMockCorpusBundle().corpus,
    role: 'analyst',
    provider: 'openai',
  })

  return (
    <div>
      <span data-testid="count">{messages.length}</span>
      <span data-testid="first">{messages[0]?.id || ''}</span>
      <span data-testid="last">{messages[messages.length - 1]?.id || ''}</span>
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
})
