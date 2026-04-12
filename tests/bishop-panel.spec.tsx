import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
        conversationContextEnabled={true}
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={messages}
        question=""
        onConversationContextChange={vi.fn()}
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
        conversationContextEnabled={true}
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={[...messages, createMessage('3', 'Latest')]}
        question=""
        onConversationContextChange={vi.fn()}
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
        conversationContextEnabled={true}
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={messages}
        question=""
        onConversationContextChange={vi.fn()}
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
        conversationContextEnabled={true}
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={[...messages, createMessage('3', 'Latest')]}
        question=""
        onConversationContextChange={vi.fn()}
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

describe('BishopPanel confidence trace', () => {
  it('shows the confidence score and reveals the provider trace when clicked', async () => {
    const user = userEvent.setup()

    render(
      <BishopPanel
        conversationContextEnabled={true}
        clearHistory={vi.fn()}
        exportJson={vi.fn()}
        exportMarkdown={vi.fn()}
        messages={[createMessage('seed', 'Seed'), createMessage('assistant-1', 'Answer')]}
        question=""
        onConversationContextChange={vi.fn()}
        onQuestionChange={vi.fn()}
        isAsking={false}
        onSubmit={vi.fn()}
        provider="openai"
        role="analyst"
        selectedMessage={{
          id: 'assistant-1',
          status: 'answered',
          provider: 'openai',
          orchestrationMode: 'remote',
          sources: [],
          confidenceScore: 84,
          providerTracePreview: 'openai response: This is a truncated answer preview from the provider.',
        } as never}
        resolveFileHref={vi.fn().mockReturnValue(null)}
      />,
    )

    expect(screen.getByRole('button', { name: '84%' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '84%' }))
    expect(screen.getByText('openai response: This is a truncated answer preview from the provider.')).toBeInTheDocument()
  })
})
