import type {
  BishopArtifact,
  BishopArtifactStatus,
  Corpus,
  ProviderId,
  SourceRecord,
  UserRole,
} from './deepvault'
import { answerQuestion } from './deepvault'

export interface BishopConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface BishopClientOptions {
  endpoint?: string | null
  fetchImpl?: typeof fetch
  corpus?: Corpus
  role?: UserRole
  provider?: ProviderId
  limit?: number
  candidateLimit?: number
  conversationHistory?: BishopConversationTurn[]
}

export interface BishopClientResult {
  status: 'answered' | 'no_answer' | 'no_permitted_sources'
  provider: ProviderId
  query: string
  answer: string
  model?: string
  sources: SourceRecord[]
  deniedSources: SourceRecord[]
  chunkCount: number
  tokenCount: number
  inputTokenCount?: number
  outputTokenCount?: number
  usageKind?: 'provider' | 'partial' | 'local'
  latencyMs: number
  mode: 'remote' | 'fallback' | 'grounded-only'
  confidenceScore: number
  providerTracePreview: string
  prompt: string
  improvementHint?: string
  artifact?: BishopArtifact
  artifactStatus?: BishopArtifactStatus
  artifactNotice?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSourceRecordLike(value: unknown): value is SourceRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.siteId === 'string' &&
    typeof value.siteName === 'string' &&
    typeof value.path === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.author === 'string' &&
    typeof value.score === 'number' &&
    typeof value.summary === 'string' &&
    Array.isArray(value.tags) &&
    Array.isArray(value.access) &&
    typeof value.snippet === 'string' &&
    typeof value.source === 'string'
  )
}

function fallbackResult(
  query: string,
  provider: ProviderId,
  detail: string,
  options: Pick<BishopClientOptions, 'corpus' | 'role' | 'limit' | 'candidateLimit'> = {},
): BishopClientResult {
  if (options.corpus) {
    const local = answerQuestion(options.corpus, query, {
      role: options.role,
      provider,
      limit: options.limit,
      candidateLimit: options.candidateLimit,
    })
    return {
      ...local,
      mode: local.status === 'answered' ? 'fallback' : 'grounded-only',
      confidenceScore: local.status === 'answered' ? 60 : local.status === 'no_permitted_sources' ? 40 : 16,
      providerTracePreview: `${provider} error: ${detail}`,
      prompt: '',
      improvementHint: buildImprovementHint({
        status: local.status,
        sources: local.sources,
        deniedSources: local.deniedSources,
        chunkCount: local.chunkCount,
      }),
    }
  }

  return {
    status: 'no_answer',
    provider,
    query,
    answer: 'The worker could not complete the Bishop request. Try again or check the worker configuration.',
    sources: [],
    deniedSources: [],
    chunkCount: 0,
    tokenCount: 0,
    latencyMs: 0,
    usageKind: 'local',
    mode: 'fallback',
    confidenceScore: 0,
    providerTracePreview: `${provider} error: ${detail}`,
    prompt: '',
    improvementHint: 'Check the worker URL and provider configuration, then retry the question.',
  }
}

function buildImprovementHint(result: Pick<BishopClientResult, 'status' | 'sources' | 'deniedSources' | 'chunkCount'>): string | undefined {
  if (result.status === 'no_permitted_sources') {
    return 'Use a role with access or broaden the site scope to reach the matching sources.'
  }

  if (result.status === 'no_answer') {
    return 'Add a document title, site name, or exact phrase from the corpus.'
  }

  if (result.sources.length === 0) {
    return 'Add a named source or a clearer document hint to anchor the answer.'
  }

  if (result.sources.length === 1) {
    return 'Add a second source, a site name, or a date range to sharpen the answer.'
  }

  if (result.chunkCount <= 6) {
    return 'A more specific document title, site name, or keyword would improve grounding.'
  }

  return 'A more specific document title or site name would improve the response.'
}

export async function askBishop(
  query: string,
  {
    endpoint,
    fetchImpl,
    corpus,
    role = 'analyst',
    provider = 'openai',
    limit,
    candidateLimit,
    conversationHistory = [],
  }: BishopClientOptions = {},
): Promise<BishopClientResult> {
  const effectiveEndpoint = endpoint?.trim() || '/api/bishop/query'
  const executeFetch = fetchImpl || fetch

  try {
    const response = await executeFetch(effectiveEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        role,
        provider,
        history: conversationHistory,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return fallbackResult(query, provider, `status ${response.status}${errorText ? `: ${errorText}` : ''}`, {
        corpus,
        role,
        limit,
        candidateLimit,
      })
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload)) {
      return fallbackResult(query, provider, 'invalid response payload', { corpus, role, limit, candidateLimit })
    }

    const trace = isRecord(payload.trace) ? payload.trace : {}
    const sources = Array.isArray(payload.sources) ? payload.sources.filter(isSourceRecordLike) : []
    const deniedSources = Array.isArray(payload.deniedSources) ? payload.deniedSources.filter(isSourceRecordLike) : []

    return {
      status:
        payload.status === 'answered' || payload.status === 'no_permitted_sources' || payload.status === 'no_answer'
          ? payload.status
          : 'no_answer',
      provider:
        payload.provider === 'openai' || payload.provider === 'gemini' || payload.provider === 'anthropic'
          ? payload.provider
          : provider,
      query: typeof payload.query === 'string' ? payload.query : query,
      answer: typeof payload.answer === 'string' && payload.answer.trim() ? payload.answer : fallbackResult(query, provider, 'empty answer').answer,
      model: typeof payload.model === 'string' ? payload.model : undefined,
      sources,
      deniedSources,
      chunkCount: typeof payload.chunkCount === 'number' ? payload.chunkCount : 0,
      tokenCount: typeof payload.tokenCount === 'number' ? payload.tokenCount : 0,
      inputTokenCount: typeof payload.inputTokenCount === 'number' ? payload.inputTokenCount : undefined,
      outputTokenCount: typeof payload.outputTokenCount === 'number' ? payload.outputTokenCount : undefined,
      usageKind: payload.usageKind === 'provider' || payload.usageKind === 'partial' || payload.usageKind === 'local' ? payload.usageKind : undefined,
      latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : 0,
      mode: trace.mode === 'remote' || trace.mode === 'grounded-only' || trace.mode === 'fallback' ? trace.mode : 'fallback',
      confidenceScore: typeof payload.confidence === 'number' ? payload.confidence : 0,
      providerTracePreview: typeof trace.providerTracePreview === 'string' ? trace.providerTracePreview : '',
      prompt: typeof trace.prompt === 'string' ? trace.prompt : '',
      improvementHint: buildImprovementHint({
        status:
          payload.status === 'answered' || payload.status === 'no_permitted_sources' || payload.status === 'no_answer'
            ? payload.status
            : 'no_answer',
        sources,
        deniedSources,
        chunkCount: typeof payload.chunkCount === 'number' ? payload.chunkCount : 0,
      }),
      artifactStatus:
        payload.artifactStatus === 'none' ||
        payload.artifactStatus === 'ready' ||
        payload.artifactStatus === 'unsupported_format' ||
        payload.artifactStatus === 'generation_failed'
          ? payload.artifactStatus
          : undefined,
      artifactNotice: typeof payload.artifactNotice === 'string' ? payload.artifactNotice : undefined,
      artifact: isRecord(payload.artifact) ? (payload.artifact as unknown as BishopArtifact) : undefined,
    }
  } catch {
    return fallbackResult(query, provider, 'request failed', { corpus, role, limit, candidateLimit })
  }
}
