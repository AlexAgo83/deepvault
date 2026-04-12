import { useEffect, useRef, useState, type FormEvent } from 'react'
import { orchestrateBishopAnswer } from '../lib/bishop'
import { type ChatMessage, type Corpus, type ProviderId, type SourceRecord, type UserRole } from '../lib/deepvault'

export const BISHOP_HISTORY_STORAGE_KEY = 'deepvault_bishop_history'
export const BISHOP_CONTEXT_STORAGE_KEY = 'deepvault_bishop_context_enabled'
export const BISHOP_HISTORY_LIMIT = 50
const BISHOP_PROMPT_HISTORY_LIMIT = 12

export interface BishopExportPayload {
  exportedAt: string
  messages: ChatMessage[]
}

export interface UseBishopConversationOptions {
  corpus: Corpus
  role: UserRole
  provider: ProviderId
  endpoint?: string | null
  openaiApiKey?: string | null
  geminiApiKey?: string | null
  anthropicApiKey?: string | null
  onActivateTab?: () => void
}

function createBishopSeedMessage(): ChatMessage {
  return {
    id: 'seed',
    role: 'assistant',
    text: 'Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.',
    status: 'ready',
    sources: [],
    createdAt: new Date().toISOString(),
  }
}

function isSourceRecordLike(value: unknown): value is SourceRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SourceRecord).id === 'string' &&
    typeof (value as SourceRecord).title === 'string' &&
    typeof (value as SourceRecord).siteId === 'string' &&
    typeof (value as SourceRecord).siteName === 'string' &&
    typeof (value as SourceRecord).path === 'string' &&
    typeof (value as SourceRecord).updatedAt === 'string' &&
    typeof (value as SourceRecord).author === 'string' &&
    typeof (value as SourceRecord).score === 'number' &&
    typeof (value as SourceRecord).summary === 'string' &&
    typeof (value as SourceRecord).snippet === 'string' &&
    typeof (value as SourceRecord).source === 'string'
  )
}

function isChatMessageLike(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ChatMessage).id === 'string' &&
    ((value as ChatMessage).role === 'user' || (value as ChatMessage).role === 'assistant') &&
    typeof (value as ChatMessage).text === 'string' &&
    typeof (value as ChatMessage).status === 'string' &&
    Array.isArray((value as ChatMessage).sources) &&
    (value as ChatMessage).sources.every(isSourceRecordLike)
  )
}

function normalizeBishopMessages(messages: ChatMessage[]): ChatMessage[] {
  const seed = messages.find((message) => message.id === 'seed') || createBishopSeedMessage()
  const tail = messages.filter((message) => message.id !== seed.id)
  return [seed, ...tail.slice(-(BISHOP_HISTORY_LIMIT - 1))]
}

function loadBishopMessages(): ChatMessage[] | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(BISHOP_HISTORY_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const messages = parsed.filter(isChatMessageLike)
      return messages.length ? normalizeBishopMessages(messages) : null
    }

    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { messages?: unknown }).messages)) {
      const messages = ((parsed as { messages: unknown[] }).messages).filter(isChatMessageLike)
      return messages.length ? normalizeBishopMessages(messages) : null
    }
  } catch {
    return null
  }

  return null
}

function loadBishopConversationContextEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  const raw = window.localStorage.getItem(BISHOP_CONTEXT_STORAGE_KEY)
  if (raw === null) {
    return true
  }

  return raw !== 'false'
}

function persistBishopMessages(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') {
    return
  }

  const payload: BishopExportPayload = {
    exportedAt: new Date().toISOString(),
    messages: normalizeBishopMessages(messages),
  }
  window.localStorage.setItem(BISHOP_HISTORY_STORAGE_KEY, JSON.stringify(payload, null, 2))
}

function persistBishopConversationContextEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(BISHOP_CONTEXT_STORAGE_KEY, enabled ? 'true' : 'false')
}

function formatMessageMarkdown(message: ChatMessage): string {
  const timestamp = message.createdAt ? ` (${new Date(message.createdAt).toISOString()})` : ''
  const heading = message.role === 'assistant' ? `### Bishop${timestamp}` : `### You${timestamp}`
  const sources =
    message.sources?.length > 0
      ? message.sources.map((source) => `- ${source.title} | ${source.siteName} | ${source.path}`).join('\n')
      : '- none'

  return [
    heading,
    '',
    `Status: ${message.status || 'ready'}`,
    ...(message.role === 'assistant' && message.improvementHint ? [`Need: ${message.improvementHint}`] : []),
    '',
    message.text,
    '',
    'Sources:',
    sources,
  ].join('\n')
}

export function buildBishopExportJson(messages: ChatMessage[]): string {
  const payload: BishopExportPayload = {
    exportedAt: new Date().toISOString(),
    messages: normalizeBishopMessages(messages),
  }
  return JSON.stringify(payload, null, 2)
}

export function buildBishopExportMarkdown(messages: ChatMessage[]): string {
  const normalizedMessages = normalizeBishopMessages(messages)
  return [
    '# Bishop conversation export',
    '',
    `Exported at ${new Date().toISOString()}`,
    '',
    ...normalizedMessages.flatMap((message) => [formatMessageMarkdown(message), '']),
  ].join('\n')
}

export function useBishopConversation({
  corpus,
  role,
  provider,
  endpoint,
  openaiApiKey,
  geminiApiKey,
  anthropicApiKey,
  onActivateTab,
}: UseBishopConversationOptions) {
  const answerTimers = useRef<number[]>([])
  const persistNextChange = useRef(true)
  const [question, setQuestion] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadBishopMessages() || [createBishopSeedMessage()])
  const [conversationContextEnabled, setConversationContextEnabled] = useState<boolean>(() =>
    loadBishopConversationContextEnabled(),
  )

  useEffect(() => {
    if (!persistNextChange.current) {
      persistNextChange.current = true
      return
    }
    persistBishopMessages(messages)
  }, [messages])

  useEffect(() => {
    persistBishopConversationContextEnabled(conversationContextEnabled)
  }, [conversationContextEnabled])

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isAsking) {
      return
    }

    const conversationHistory = conversationContextEnabled
      ? messages
          .filter((message) => message.id !== 'seed')
          .slice(-BISHOP_PROMPT_HISTORY_LIMIT)
          .map(({ role: messageRole, text }) => ({ role: messageRole, text }))
      : []
    const assistantId = `${Date.now()}-assistant`
    const startedAt = Date.now()
    const askedAt = new Date(startedAt).toISOString()
    setIsAsking(true)
    setMessages((current) =>
      normalizeBishopMessages([
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: trimmed, status: '', sources: [], createdAt: askedAt },
        {
          id: assistantId,
          role: 'assistant',
          text: 'Bishop is drafting the answer from grounded sources.',
          status: 'draft',
          sources: [],
          createdAt: askedAt,
        },
      ]),
    )
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
        openaiApiKey,
        geminiApiKey,
        anthropicApiKey,
        conversationHistory,
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
                confidenceScore: result.confidenceScore,
                providerTracePreview: result.providerTracePreview,
                improvementHint: result.improvementHint,
              }
            : message,
        ),
      )
    } finally {
      setIsAsking(false)
      answerTimers.current = answerTimers.current.filter((timer) => timer !== answerDelay)
    }
  }

  const clearHistory = () => {
    setQuestion('')
    persistNextChange.current = false
    setMessages([createBishopSeedMessage()])
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(BISHOP_HISTORY_STORAGE_KEY)
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
    conversationContextEnabled,
    setConversationContextEnabled,
    clearHistory,
    exportJson: () => buildBishopExportJson(messages),
    exportMarkdown: () => buildBishopExportMarkdown(messages),
  }
}
