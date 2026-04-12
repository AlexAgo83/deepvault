import Anthropic from '@anthropic-ai/sdk'
import {
  answerQuestion,
  groundQuestion as buildGrounding,
  type AnswerResult,
  type Corpus,
  type GroundingResult,
  type ProviderId,
  type UserRole,
} from './deepvault'

export interface BishopPromptContext {
  query: string
  role: UserRole
  provider: ProviderId
  grounding: GroundingResult
}

export const groundQuestion = buildGrounding

export interface BishopOrchestrationOptions {
  role?: UserRole
  provider?: ProviderId
  limit?: number
  endpoint?: string | null
  fetchImpl?: typeof fetch
  anthropicApiKey?: string | null
  bishopModel?: string | null
  anthropicClient?: AnthropicClientLike
}

export interface BishopOrchestrationResult extends AnswerResult {
  mode: 'remote' | 'fallback' | 'grounded-only'
  prompt: string
}

interface AnthropicUsageLike {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface AnthropicTextBlockLike {
  type?: string
  text?: string
}

interface AnthropicResponseLike {
  content?: AnthropicTextBlockLike[]
  usage?: AnthropicUsageLike
}

interface AnthropicClientLike {
  beta: {
    messages: {
      create: (_params: Record<string, unknown>) => Promise<AnthropicResponseLike>
    }
  }
}

const DEFAULT_BISHOP_MODEL = 'claude-sonnet-4-6'
const PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31'

export function buildBishopPrompt(context: BishopPromptContext): string {
  const sourceLines = context.grounding.sources.map(
    (source, index) =>
      `${index + 1}. ${source.title} | ${source.siteName} | ${source.path} | ${source.summary}`,
  )

  return [
    'You are Bishop, a grounded assistant.',
    `Role: ${context.role}`,
    `Provider: ${context.provider}`,
    `Question: ${context.query}`,
    `Grounding status: ${context.grounding.status}`,
    'Use only the grounded context below.',
    'Sources:',
    sourceLines.length ? sourceLines.join('\n') : '- none',
    'Denied sources:',
    context.grounding.deniedSources.length
      ? context.grounding.deniedSources.map((source) => `- ${source.title} | ${source.siteName} | ${source.path}`).join('\n')
      : '- none',
    'Answer in one concise grounded paragraph.',
  ].join('\n')
}

function buildBishopSystemPrompt(context: Omit<BishopPromptContext, 'query' | 'grounding'>): string {
  return [
    'You are Bishop, a grounded assistant.',
    `Role: ${context.role}`,
    `Provider: ${context.provider}`,
    'Use only the grounded corpus context in the user message.',
    'Answer in one concise grounded paragraph.',
  ].join('\n')
}

function buildBishopGroundingContext(grounding: GroundingResult): string {
  const sourceLines = grounding.sources.map(
    (source, index) =>
      `${index + 1}. ${source.title} | ${source.siteName} | ${source.path} | ${source.summary}`,
  )

  const deniedLines = grounding.deniedSources.map((source) => `- ${source.title} | ${source.siteName} | ${source.path}`)

  return [
    `Grounding status: ${grounding.status}`,
    'Sources:',
    sourceLines.length ? sourceLines.join('\n') : '- none',
    'Denied sources:',
    deniedLines.length ? deniedLines.join('\n') : '- none',
  ].join('\n')
}

function extractAnthropicText(response: AnthropicResponseLike): string {
  const text = (response.content || [])
    .filter(
      (block): block is AnthropicTextBlockLike & { text: string } => block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n')

  return text.trim()
}

function readEnvValue(name: string): string {
  const importMetaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const fromImportMeta = importMetaEnv?.[name]
  const fromProcess = typeof globalThis.process !== 'undefined' ? globalThis.process.env?.[name] : undefined
  return (fromImportMeta || fromProcess || '').trim()
}

function getAnthropicRuntimeConfig(options: BishopOrchestrationOptions): { apiKey: string; model: string } {
  return {
    apiKey: options.anthropicApiKey?.trim() || readEnvValue('ANTHROPIC_API_KEY'),
    model: options.bishopModel?.trim() || readEnvValue('VITE_BISHOP_MODEL') || DEFAULT_BISHOP_MODEL,
  }
}

async function runAnthropicRemoteAnswer(
  query: string,
  role: UserRole,
  provider: ProviderId,
  grounding: GroundingResult,
  prompt: string,
  options: BishopOrchestrationOptions,
  fallback: AnswerResult,
): Promise<BishopOrchestrationResult | null> {
  const { apiKey, model } = getAnthropicRuntimeConfig(options)
  if (!apiKey) {
    return null
  }

  const client = options.anthropicClient || new Anthropic({ apiKey })
  const startedAt = Date.now()
  const systemPrompt = buildBishopSystemPrompt({ role, provider })
  const groundingContext = buildBishopGroundingContext(grounding)
  const createMessage = client.beta.messages.create as (_params: Record<string, unknown>) => Promise<AnthropicResponseLike>

  try {
    const response = await createMessage({
      model,
      max_tokens: 512,
      temperature: 0,
      betas: [PROMPT_CACHING_BETA],
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Question: ${query}` },
            {
              type: 'text',
              text: groundingContext,
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
    }) as AnthropicResponseLike

    const answer = extractAnthropicText(response) || fallback.answer
    const usage = response.usage
    const tokenCount = (usage?.input_tokens || 0) + (usage?.output_tokens || 0)

    return {
      status: fallback.status,
      provider: fallback.provider,
      query: fallback.query,
      answer,
      sources: fallback.sources,
      deniedSources: fallback.deniedSources,
      chunkCount: grounding.chunkCount,
      tokenCount: tokenCount > 0 ? tokenCount : fallback.tokenCount,
      latencyMs: Date.now() - startedAt,
      mode: 'remote',
      prompt,
    }
  } catch {
    return null
  }
}

export async function orchestrateBishopAnswer(
  corpus: Corpus,
  query: string,
  options: BishopOrchestrationOptions = {},
): Promise<BishopOrchestrationResult> {
  const role = options.role || 'analyst'
  const provider = options.provider || 'openai'
  const grounding = buildGrounding(corpus, query, { role, provider, limit: options.limit })
  const prompt = buildBishopPrompt({ query, role, provider, grounding })
  const fallback = answerQuestion(corpus, query, { role, provider, limit: options.limit })
  const endpoint = options.endpoint?.trim() || ''
  const fetchImpl = options.fetchImpl || fetch

  if (grounding.status !== 'answered') {
    return {
      ...fallback,
      mode: 'grounded-only',
      prompt,
    }
  }

  if (endpoint) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          role,
          provider,
          prompt,
          grounding,
        }),
      })

      if (!response.ok) {
        throw new Error(`Bishop orchestration failed with status ${response.status}`)
      }

      const payload = (await response.json()) as Partial<AnswerResult> & { answer?: string }
      const answer = typeof payload.answer === 'string' && payload.answer.trim() ? payload.answer.trim() : fallback.answer

      return {
        status: fallback.status,
        provider: payload.provider || fallback.provider,
        query: fallback.query,
        answer,
        sources: fallback.sources,
        deniedSources: fallback.deniedSources,
        chunkCount: payload.chunkCount ?? fallback.chunkCount,
        tokenCount: payload.tokenCount ?? fallback.tokenCount,
        latencyMs: payload.latencyMs ?? fallback.latencyMs,
        mode: 'remote',
        prompt,
      }
    } catch {
      return {
        ...fallback,
        mode: 'fallback',
        prompt,
      }
    }
  }

  const remoteAnswer = await runAnthropicRemoteAnswer(query, role, provider, grounding, prompt, options, fallback)
  if (remoteAnswer) {
    return remoteAnswer
  }

  return {
    ...fallback,
    mode: 'fallback',
    prompt,
  }
}
