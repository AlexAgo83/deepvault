import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { BishopPanel } from '../src/components/panels'

function createMessage(id: string, text: string) {
  return {
    id,
    role: 'assistant' as const,
    text,
    status: 'answered',
    sources: [],
    createdAt: '2026-04-12T00:00:00.000Z',
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BishopPanel scroll behavior', () => {
  it('keeps the conversation pinned to the bottom when already at the latest message', () => {
    const messages = [createMessage('seed', 'Seed'), createMessage('1', 'First'), createMessage('2', 'Second')]
    const { container, rerender } = render(
      <BishopPanel
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={messages}
        question=""
        onQuestionChange={vi.fn()}
        isAsking={false}
        onSubmit={vi.fn()}
        provider="openai"
        role="analyst"
        selectedMessage={{ status: 'answered', provider: 'openai', orchestrationMode: 'fallback', sources: [] } as never}
        resolveFileHref={vi.fn().mockReturnValue(null)}
      />,
    )

    const messageList = container.querySelector('.message-list') as HTMLDivElement
    Object.defineProperty(messageList, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(messageList, 'scrollHeight', { configurable: true, value: 260 })
    Object.defineProperty(messageList, 'scrollTop', { configurable: true, writable: true, value: 60 })

    Object.defineProperty(messageList, 'scrollHeight', { configurable: true, value: 340 })
    rerender(
      <BishopPanel
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={[...messages, createMessage('3', 'Latest')]}
        question=""
        onQuestionChange={vi.fn()}
        isAsking={false}
        onSubmit={vi.fn()}
        provider="openai"
        role="analyst"
        selectedMessage={{ status: 'answered', provider: 'openai', orchestrationMode: 'fallback', sources: [] } as never}
        resolveFileHref={vi.fn().mockReturnValue(null)}
      />,
    )

    expect(messageList.scrollTop).toBe(140)
  })

  it('does not force the view back down when the user has scrolled away from the bottom', () => {
    const messages = [createMessage('seed', 'Seed'), createMessage('1', 'First'), createMessage('2', 'Second')]
    const { container, rerender } = render(
      <BishopPanel
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={messages}
        question=""
        onQuestionChange={vi.fn()}
        isAsking={false}
        onSubmit={vi.fn()}
        provider="openai"
        role="analyst"
        selectedMessage={{ status: 'answered', provider: 'openai', orchestrationMode: 'fallback', sources: [] } as never}
        resolveFileHref={vi.fn().mockReturnValue(null)}
      />,
    )

    const messageList = container.querySelector('.message-list') as HTMLDivElement
    Object.defineProperty(messageList, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(messageList, 'scrollHeight', { configurable: true, value: 260 })
    Object.defineProperty(messageList, 'scrollTop', { configurable: true, writable: true, value: 20 })

    Object.defineProperty(messageList, 'scrollHeight', { configurable: true, value: 340 })
    fireEvent.scroll(messageList)
    rerender(
      <BishopPanel
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={[...messages, createMessage('3', 'Latest')]}
        question=""
        onQuestionChange={vi.fn()}
        isAsking={false}
        onSubmit={vi.fn()}
        provider="openai"
        role="analyst"
        selectedMessage={{ status: 'answered', provider: 'openai', orchestrationMode: 'fallback', sources: [] } as never}
        resolveFileHref={vi.fn().mockReturnValue(null)}
      />,
    )

    expect(messageList.scrollTop).toBe(20)
  })
})
