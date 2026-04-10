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
}

export interface BishopOrchestrationResult extends AnswerResult {
  mode: 'remote' | 'fallback' | 'grounded-only'
  prompt: string
}

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

  if (!endpoint) {
    return {
      ...fallback,
      mode: 'fallback',
      prompt,
    }
  }

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
