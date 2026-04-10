import { useEffect, useRef, useState, type FormEvent } from 'react'
import { orchestrateBishopAnswer } from '../lib/bishop'
import { type ChatMessage, type Corpus, type ProviderId, type UserRole } from '../lib/deepvault'

export interface UseBishopConversationOptions {
  corpus: Corpus
  role: UserRole
  provider: ProviderId
  endpoint?: string | null
  onActivateTab?: () => void
}

export function useBishopConversation({
  corpus,
  role,
  provider,
  endpoint,
  onActivateTab,
}: UseBishopConversationOptions) {
  const answerTimers = useRef<number[]>([])
  const [question, setQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'seed',
      role: 'assistant',
      text: 'Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.',
      status: 'ready',
      sources: [],
    },
  ])

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isAsking) {
      return
    }

    const assistantId = `${Date.now()}-assistant`
    const startedAt = Date.now()
    setIsAsking(true)
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text: trimmed, status: '', sources: [] },
      {
        id: assistantId,
        role: 'assistant',
        text: 'Bishop is drafting the answer from grounded sources.',
        status: 'draft',
        sources: [],
      },
    ])
    setQuestion('')
    onActivateTab?.()

    const answerDelay = window.setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: 'Bishop is thinking through the grounded sources.',
                status: 'answering',
              }
            : message,
        ),
      )
    }, 220)

    answerTimers.current.push(answerDelay)

    try {
      const result = await orchestrateBishopAnswer(corpus, trimmed, {
        role,
        provider,
        limit: 3,
        endpoint,
      })

      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, 560 - elapsed)
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const finishDelay = window.setTimeout(resolve, remaining)
          answerTimers.current.push(finishDelay)
        })
      }

      window.clearTimeout(answerDelay)
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: result.answer,
                status: result.status,
                sources: result.sources,
                provider: result.provider,
                orchestrationMode: result.mode,
                chunkCount: result.chunkCount,
                tokenCount: result.tokenCount,
                latencyMs: result.latencyMs,
              }
            : message,
        ),
      )
    } finally {
      setIsAsking(false)
      answerTimers.current = answerTimers.current.filter((timer) => timer !== answerDelay)
    }
  }

  useEffect(
    () => () => {
      for (const timer of answerTimers.current) {
        window.clearTimeout(timer)
      }
      answerTimers.current = []
    },
    [],
  )

  const selectedMessage = messages[messages.length - 1]

  return {
    question,
    setQuestion,
    isAsking,
    messages,
    selectedMessage,
    handleAsk,
  }
}
