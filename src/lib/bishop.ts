import Anthropic from '@anthropic-ai/sdk'
import {
  answerQuestion,
  type BishopArtifact,
  type BishopArtifactFormat,
  type BishopArtifactStatus,
  groundQuestion as buildGrounding,
  type ChatMessage,
  type AnswerResult,
  type Corpus,
  type GroundingResult,
  type ProviderId,
  type SourceRecord,
  type UserRole,
} from './deepvault'
import { extractMeaningfulTokens } from './scoring'

export interface BishopPromptContext {
  query: string
  role: UserRole
  provider: ProviderId
  grounding: GroundingResult
  conversationHistory?: Array<Pick<ChatMessage, 'role' | 'text'>>
  artifactIntent?: ArtifactIntent
}

export const groundQuestion = buildGrounding

export interface BishopOrchestrationOptions {
  role?: UserRole
  provider?: ProviderId
  limit?: number
  candidateLimit?: number
  endpoint?: string | null
  fetchImpl?: typeof fetch
  allowEnvProviderKeys?: boolean
  openaiApiKey?: string | null
  geminiApiKey?: string | null
  anthropicApiKey?: string | null
  bishopModel?: string | null
  anthropicClient?: AnthropicClientLike
  conversationHistory?: Array<Pick<ChatMessage, 'role' | 'text'>>
}

export interface BishopOrchestrationResult extends AnswerResult {
  mode: 'remote' | 'fallback' | 'grounded-only'
  prompt: string
  confidenceScore: number
  providerTracePreview: string
  improvementHint: string
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

interface OpenAIChoiceLike {
  message?: {
    content?: string | null
  }
}

interface OpenAIResponseLike {
  choices?: OpenAIChoiceLike[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

interface GeminiPartLike {
  text?: string
}

interface GeminiContentLike {
  parts?: GeminiPartLike[]
}

interface GeminiResponseLike {
  candidates?: Array<{
    content?: GeminiContentLike
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31'
const SUPPORTED_ARTIFACT_FORMATS: BishopArtifactFormat[] = ['txt', 'md', 'json', 'csv']
const ARTIFACT_MIME_TYPES: Record<BishopArtifactFormat, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
}
const UNSUPPORTED_ARTIFACT_FORMATS = ['pdf', 'docx', 'xlsx', 'pptx']

interface ArtifactIntent {
  requested: boolean
  format?: BishopArtifactFormat
  unsupportedFormat?: string
  filename?: string
}

interface ArtifactOutcome {
  artifact?: BishopArtifact
  artifactStatus: BishopArtifactStatus
  artifactNotice?: string
}

function truncateText(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isSupportedArtifactFormat(value: string): value is BishopArtifactFormat {
  return SUPPORTED_ARTIFACT_FORMATS.includes(value as BishopArtifactFormat)
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ').trim()
  if (/[",]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function slugifyFilenameSegment(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'bishop-artifact'
}

function buildDefaultArtifactFilename(query: string, format: BishopArtifactFormat): string {
  const stem = slugifyFilenameSegment(query).slice(0, 48) || 'bishop-artifact'
  return `${stem}.${format}`
}

function parseRequestedFilename(query: string): string | undefined {
  const match = query.match(/(?:named|called)\s+["']?([a-z0-9._-]+\.[a-z0-9]+)["']?/i)
  return match?.[1]
}

function sanitizeRequestedFilename(filename: string, format: BishopArtifactFormat): string {
  const parts = filename.split('.')
  const requestedStem = parts.slice(0, -1).join('.') || parts[0] || 'bishop-artifact'
  const safeStem = slugifyFilenameSegment(requestedStem)
  return `${safeStem}.${format}`
}

function inferArtifactIntent(query: string): ArtifactIntent {
  const normalizedQuery = query.toLowerCase()
  const explicitVerb = /\b(create|generate|make|prepare|write|produce|export|draft)\b/.test(normalizedQuery)
  const explicitObject = /\b(file|document|artifact|download|report|list|table|template|markdown|json|csv|text)\b/.test(normalizedQuery)
  const extensionMatch = normalizedQuery.match(/\.(txt|md|json|csv|pdf|docx|xlsx|pptx)\b/)
  const namedUnsupportedFormat =
    (/\bpdf\b/.test(normalizedQuery) && 'pdf') ||
    (/\bdocx\b/.test(normalizedQuery) && 'docx') ||
    (/\bxlsx\b/.test(normalizedQuery) && 'xlsx') ||
    (/\bpptx\b/.test(normalizedQuery) && 'pptx') ||
    undefined
  const namedFormat =
    (/\bplain text\b/.test(normalizedQuery) && 'txt') ||
    (/\bmarkdown\b/.test(normalizedQuery) && 'md') ||
    (/\bjson\b/.test(normalizedQuery) && 'json') ||
    (/\bcsv\b/.test(normalizedQuery) && 'csv') ||
    undefined
  const unsupportedFormat =
    (extensionMatch?.[1] && UNSUPPORTED_ARTIFACT_FORMATS.includes(extensionMatch[1]) ? extensionMatch[1] : undefined) ||
    namedUnsupportedFormat
  const requested = Boolean(extensionMatch || namedFormat || namedUnsupportedFormat || (explicitVerb && explicitObject))

  if (!requested) {
    return { requested: false }
  }

  const formatCandidate = extensionMatch?.[1] || namedFormat || 'txt'
  const filename = parseRequestedFilename(query)

  if (unsupportedFormat || UNSUPPORTED_ARTIFACT_FORMATS.includes(formatCandidate)) {
    return {
      requested: true,
      unsupportedFormat: unsupportedFormat || formatCandidate,
      filename,
    }
  }

  return {
    requested: true,
    format: isSupportedArtifactFormat(formatCandidate) ? formatCandidate : 'txt',
    filename,
  }
}

function buildMarkdownArtifactContent(query: string, answer: string): string {
  const title = query.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Bishop artifact'
  return `# ${title}\n\n${answer.trim()}\n`
}

function buildJsonArtifactContent(query: string, answer: string, sources: SourceRecord[]): string {
  return `${JSON.stringify(
    {
      query,
      answer: answer.trim(),
      sources: sources.map((source, index) => ({
        index: index + 1,
        title: source.title,
        siteName: source.siteName,
        path: source.path,
        updatedAt: source.updatedAt,
        author: source.author,
        score: source.score,
      })),
    },
    null,
    2,
  )}\n`
}

function buildCsvArtifactContent(answer: string, sources: SourceRecord[]): string {
  const answerLines = answer
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean)

  if (answerLines.length > 1) {
    return ['value', ...answerLines.map((line) => escapeCsvCell(line))].join('\n')
  }

  const rows = [
    ['index', 'title', 'site_name', 'path', 'updated_at', 'author', 'score'],
    ...sources.map((source, index) => [
      String(index + 1),
      source.title,
      source.siteName,
      source.path,
      source.updatedAt,
      source.author,
      String(source.score),
    ]),
  ]

  return rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n')
}

function buildArtifactFromAnswer(
  query: string,
  answer: string,
  sources: SourceRecord[],
  format: BishopArtifactFormat,
  requestedFilename?: string,
): BishopArtifact {
  const filename = requestedFilename ? sanitizeRequestedFilename(requestedFilename, format) : buildDefaultArtifactFilename(query, format)
  const trimmedAnswer = answer.trim()
  const content =
    format === 'txt'
      ? `${trimmedAnswer}\n`
      : format === 'md'
        ? buildMarkdownArtifactContent(query, trimmedAnswer)
        : format === 'json'
          ? buildJsonArtifactContent(query, trimmedAnswer, sources)
          : buildCsvArtifactContent(trimmedAnswer, sources)

  return {
    kind: 'document',
    format,
    filename,
    mimeType: ARTIFACT_MIME_TYPES[format],
    content,
  }
}

function isArtifactLike(value: unknown): value is BishopArtifact {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as BishopArtifact).kind === 'document' &&
    typeof (value as BishopArtifact).filename === 'string' &&
    typeof (value as BishopArtifact).mimeType === 'string' &&
    typeof (value as BishopArtifact).content === 'string' &&
    isSupportedArtifactFormat((value as BishopArtifact).format)
  )
}

function resolveArtifactOutcome(
  query: string,
  result: AnswerResult,
  remotePayload?: {
    artifact?: unknown
    artifactStatus?: BishopArtifactStatus
    artifactNotice?: string
  },
): ArtifactOutcome {
  if (isArtifactLike(remotePayload?.artifact)) {
    return {
      artifact: remotePayload.artifact,
      artifactStatus: 'ready',
      artifactNotice: remotePayload?.artifactNotice || `Artifact ready: ${remotePayload.artifact.filename}`,
    }
  }

  if (remotePayload && 'artifact' in remotePayload && remotePayload.artifact != null && !isArtifactLike(remotePayload.artifact)) {
    return {
      artifactStatus: 'generation_failed',
      artifactNotice: 'Bishop returned an invalid artifact payload.',
    }
  }

  const intent = inferArtifactIntent(query)
  if (!intent.requested) {
    return { artifactStatus: 'none' }
  }

  if (intent.unsupportedFormat) {
    return {
      artifactStatus: 'unsupported_format',
      artifactNotice: `Unsupported format .${intent.unsupportedFormat}. Bishop currently supports .txt, .md, .json, and .csv.`,
    }
  }

  if (!intent.format || result.status !== 'answered' || !result.answer.trim()) {
    return {
      artifactStatus: 'generation_failed',
      artifactNotice: 'No grounded answer was available to package into a downloadable artifact.',
    }
  }

  const artifact = buildArtifactFromAnswer(query, result.answer, result.sources, intent.format, intent.filename)
  return {
    artifact,
    artifactStatus: 'ready',
    artifactNotice: `Artifact ready: ${artifact.filename}`,
  }
}

function withArtifactOutcome(
  query: string,
  result: BishopOrchestrationResult,
  remotePayload?: {
    artifact?: unknown
    artifactStatus?: BishopArtifactStatus
    artifactNotice?: string
  },
): BishopOrchestrationResult {
  const artifactOutcome = resolveArtifactOutcome(query, result, remotePayload)
  return {
    ...result,
    artifact: artifactOutcome.artifact,
    artifactStatus: artifactOutcome.artifactStatus,
    artifactNotice: artifactOutcome.artifactNotice,
  }
}

function buildConfidenceScore(
  result: Pick<AnswerResult, 'status' | 'sources' | 'deniedSources' | 'chunkCount'>,
  mode: BishopOrchestrationResult['mode'],
): number {
  let score = mode === 'remote' ? 76 : mode === 'grounded-only' ? 61 : 54
  score += Math.min(14, result.sources.length * 4)
  score += Math.min(8, Math.round(result.chunkCount / 2))

  if (result.status === 'answered') {
    score += 6
  } else if (result.status === 'no_permitted_sources') {
    score -= 10
  } else {
    score -= 4
  }

  if (result.deniedSources.length > result.sources.length) {
    score -= 2
  }

  return clampConfidence(score)
}

function buildProviderTracePreview(
  mode: BishopOrchestrationResult['mode'],
  provider: ProviderId,
  answer: string,
  errorPreview?: string | null,
): string {
  if (errorPreview) {
    return `${provider} error: ${truncateText(errorPreview, 180)}`
  }

  if (mode === 'remote') {
    return `${provider} response: ${truncateText(answer, 180)}`
  }

  return `Local fallback: ${truncateText(answer, 180)}`
}

function buildImprovementHint(result: Pick<AnswerResult, 'status' | 'sources' | 'deniedSources' | 'chunkCount'>): string {
  if (result.status === 'no_permitted_sources') {
    return 'Use a role with access or broaden the site scope to reach the matching sources.'
  }

  if (result.status === 'no_answer') {
    return 'Add a document title, site name, or exact phrase from the corpus.'
  }

  if (result.sources.length === 0) {
    return 'Add a named source or a clearer document hint to anchor the answer.'
  }

  const topSource = result.sources[0]
  const topAuthor = topSource?.author
  const topFileType = topSource?.fileType
  const specificTerms = buildNeedRefinementTerms(topSource)

  if (result.sources.length === 1) {
    if (topAuthor) {
      return `Add a second source or date range to sharpen the answer. The matching source was authored by ${topAuthor}.`
    }
    return 'Add a second source, a site name, or a date range to sharpen the answer.'
  }

  if (result.chunkCount <= 6) {
    if (specificTerms) {
      return `A more specific document title or site name would improve the response — try refining around ${specificTerms}.`
    }
    if (topFileType) {
      return `A more specific ${topFileType} title or keyword would improve grounding.`
    }
    return 'A more specific document title or keyword would improve grounding.'
  }

  if (specificTerms) {
    return `A more specific document title or site name would improve the response — try refining around ${specificTerms}.`
  }
  return 'A more specific document title or site name would improve the response.'
}

export function buildNeedRefinementTerms(
  source?: Pick<SourceRecord, 'title' | 'siteName' | 'path' | 'summary' | 'tags' | 'sectionHint' | 'author' | 'fileType'>,
): string {
  if (!source) {
    return ''
  }

  const candidates = [
    source.sectionHint || '',
    source.title,
    source.siteName,
    source.summary,
    source.path,
    source.tags.join(' '),
    source.author,
    source.fileType || '',
  ].filter(Boolean)

  const terms = extractMeaningfulTokens(candidates.join(' '))
    .filter((term) => term.length > 1 && !/^\d+$/.test(term))
    .slice(0, 3)

  return terms.join(', ')
}

function formatConversationHistory(conversationHistory: Array<Pick<ChatMessage, 'role' | 'text'>>): string {
  return conversationHistory
    .map((message) => {
      const speaker = message.role === 'assistant' ? 'Bishop' : 'You'
      return `- ${speaker}: ${truncateText(message.text, 240)}`
    })
    .join('\n')
}

function augmentResultWithTrace(
  result: AnswerResult,
  mode: BishopOrchestrationResult['mode'],
  prompt: string,
  errorPreview?: string | null,
): BishopOrchestrationResult {
  return {
    ...result,
    mode,
    prompt,
    confidenceScore: buildConfidenceScore(result, mode),
    providerTracePreview: buildProviderTracePreview(mode, result.provider, result.answer, errorPreview),
    improvementHint: buildImprovementHint(result),
  }
}

interface RemoteAttemptResult {
  result: BishopOrchestrationResult | null
  errorPreview?: string | null
}

function buildSourceLine(source: ReturnType<typeof buildGrounding>['sources'][number], index: number): string {
  const parts: string[] = [source.title, source.siteName, source.path, source.summary]
  if (source.author) parts.push(`by ${source.author}`)
  if (source.sectionHint) parts.push(`§ ${source.sectionHint}`)
  return `${index + 1}. ${parts.join(' | ')}`
}

export function buildBishopPrompt(context: BishopPromptContext): string {
  const sourceLines = context.grounding.sources.map((source, index) => buildSourceLine(source, index))
  const conversationHistory = context.conversationHistory && context.conversationHistory.length > 0
    ? ['Conversation history:', formatConversationHistory(context.conversationHistory)]
    : []
  const artifactInstructions =
    context.artifactIntent?.requested
      ? context.artifactIntent.unsupportedFormat
        ? [
            `Artifact request: unsupported format .${context.artifactIntent.unsupportedFormat}.`,
            'Explain briefly that Bishop currently supports only .txt, .md, .json, and .csv in this app.',
            'Do not claim that the interface cannot create files in general.',
          ]
        : [
            `Artifact request: supported ${context.artifactIntent.format ? `.${context.artifactIntent.format}` : 'text-like'} file.`,
            'Provide the grounded answer content directly and assume the app will package it as a downloadable file.',
            'Do not say that you cannot create, generate, or download files from this interface.',
          ]
      : []

  return [
    'You are Bishop, a grounded assistant.',
    `Role: ${context.role}`,
    `Provider: ${context.provider}`,
    `Question: ${context.query}`,
    ...conversationHistory,
    `Grounding status: ${context.grounding.status}`,
    'Use only the grounded context below.',
    ...artifactInstructions,
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
  const artifactInstructions =
    context.artifactIntent?.requested
      ? context.artifactIntent.unsupportedFormat
        ? [
            'When the user asks for an unsupported file format, explain the supported formats briefly and stay grounded.',
            'Do not say that the interface cannot create files in general.',
          ]
        : [
            'When the user explicitly asks for a supported file, provide the file-ready grounded content in your answer.',
            'Assume the app can attach the downloadable file separately.',
            'Do not say that the interface cannot create, generate, or download files.',
          ]
      : []

  return [
    'You are Bishop, a grounded assistant.',
    `Role: ${context.role}`,
    `Provider: ${context.provider}`,
    'Use the conversation history to preserve follow-up context, but keep factual claims grounded in the corpus context in the user message.',
    ...artifactInstructions,
    'Answer in one concise grounded paragraph.',
  ].join('\n')
}

function buildBishopGroundingContext(grounding: GroundingResult): string {
  const sourceLines = grounding.sources.map((source, index) => buildSourceLine(source, index))

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

function getProviderRuntimeConfig(
  provider: ProviderId,
  options: BishopOrchestrationOptions,
): { apiKey: string; model: string } {
  const allowEnvProviderKeys = options.allowEnvProviderKeys !== false
  const modelOverride = options.bishopModel?.trim() || readEnvValue('VITE_BISHOP_MODEL')

  if (provider === 'openai') {
    return {
      apiKey: options.openaiApiKey?.trim() || (allowEnvProviderKeys ? readEnvValue('OPENAI_API_KEY') : ''),
      model: modelOverride || DEFAULT_OPENAI_MODEL,
    }
  }

  if (provider === 'gemini') {
    return {
      apiKey: options.geminiApiKey?.trim() || (allowEnvProviderKeys ? readEnvValue('GEMINI_API_KEY') : ''),
      model: modelOverride || DEFAULT_GEMINI_MODEL,
    }
  }

  return {
    apiKey: options.anthropicApiKey?.trim() || (allowEnvProviderKeys ? readEnvValue('ANTHROPIC_API_KEY') : ''),
    model: modelOverride || DEFAULT_ANTHROPIC_MODEL,
  }
}

async function runOpenAIRemoteAnswer(
  query: string,
  role: UserRole,
  provider: ProviderId,
  _grounding: GroundingResult,
  prompt: string,
  options: BishopOrchestrationOptions,
  fallback: AnswerResult,
): Promise<RemoteAttemptResult> {
  const { apiKey, model } = getProviderRuntimeConfig('openai', options)
  if (!apiKey) {
    return { result: null, errorPreview: 'OpenAI API key missing' }
  }

  const startedAt = Date.now()
  const systemPrompt = buildBishopSystemPrompt({ role, provider, artifactIntent: inferArtifactIntent(query) })

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        result: null,
        errorPreview: `HTTP ${response.status}${errorText.trim() ? `: ${errorText.trim()}` : ''}`,
      }
    }

    const payload = (await response.json()) as OpenAIResponseLike
    const answer = payload.choices?.[0]?.message?.content?.trim() || fallback.answer
    const usage = payload.usage
    const tokenCount = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)

    return {
      result: augmentResultWithTrace(
        {
      status: fallback.status,
      provider: fallback.provider,
      query: fallback.query,
      answer,
      sources: fallback.sources,
      deniedSources: fallback.deniedSources,
      chunkCount: _grounding.chunkCount,
      tokenCount: tokenCount > 0 ? tokenCount : fallback.tokenCount,
      latencyMs: Date.now() - startedAt,
    },
        'remote',
        prompt,
      ),
    }
  } catch {
    return { result: null, errorPreview: 'OpenAI request failed' }
  }
}

async function runGeminiRemoteAnswer(
  query: string,
  role: UserRole,
  provider: ProviderId,
  grounding: GroundingResult,
  prompt: string,
  options: BishopOrchestrationOptions,
  fallback: AnswerResult,
): Promise<RemoteAttemptResult> {
  const { apiKey, model } = getProviderRuntimeConfig('gemini', options)
  if (!apiKey) {
    return { result: null, errorPreview: 'Gemini API key missing' }
  }

  const startedAt = Date.now()
  const systemPrompt = buildBishopSystemPrompt({ role, provider, artifactIntent: inferArtifactIntent(query) })

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        result: null,
        errorPreview: `HTTP ${response.status}${errorText.trim() ? `: ${errorText.trim()}` : ''}`,
      }
    }

    const payload = (await response.json()) as GeminiResponseLike
    const answer =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text?.trim() || '')
        .filter(Boolean)
        .join('\n')
        .trim() || fallback.answer
    const usage = payload.usageMetadata
    const tokenCount = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0)

    return {
      result: augmentResultWithTrace(
        {
      status: fallback.status,
      provider: fallback.provider,
      query: fallback.query,
      answer,
      sources: fallback.sources,
      deniedSources: fallback.deniedSources,
      chunkCount: grounding.chunkCount,
      tokenCount: tokenCount > 0 ? tokenCount : fallback.tokenCount,
      latencyMs: Date.now() - startedAt,
    },
        'remote',
        prompt,
      ),
    }
  } catch {
    return { result: null, errorPreview: 'Gemini request failed' }
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
): Promise<RemoteAttemptResult> {
  const { apiKey, model } = getProviderRuntimeConfig('anthropic', options)
  if (!apiKey) {
    return { result: null, errorPreview: 'Anthropic API key missing' }
  }

  const client = options.anthropicClient || new Anthropic({ apiKey })
  const startedAt = Date.now()
  const systemPrompt = buildBishopSystemPrompt({ role, provider, artifactIntent: inferArtifactIntent(query) })
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
      result: augmentResultWithTrace(
        {
      status: fallback.status,
      provider: fallback.provider,
      query: fallback.query,
      answer,
      sources: fallback.sources,
      deniedSources: fallback.deniedSources,
      chunkCount: grounding.chunkCount,
      tokenCount: tokenCount > 0 ? tokenCount : fallback.tokenCount,
      latencyMs: Date.now() - startedAt,
    },
        'remote',
        prompt,
      ),
    }
  } catch {
    return { result: null, errorPreview: 'Anthropic request failed' }
  }
}

export async function orchestrateBishopAnswer(
  corpus: Corpus,
  query: string,
  options: BishopOrchestrationOptions = {},
): Promise<BishopOrchestrationResult> {
  const role = options.role || 'analyst'
  const provider = options.provider || 'openai'
  const artifactIntent = inferArtifactIntent(query)
  const grounding = buildGrounding(corpus, query, {
    role,
    provider,
    limit: options.limit,
    candidateLimit: options.candidateLimit,
  })
  const prompt = buildBishopPrompt({
    query,
    role,
    provider,
    grounding,
    conversationHistory: options.conversationHistory,
    artifactIntent,
  })
  const fallback = answerQuestion(corpus, query, {
    role,
    provider,
    limit: options.limit,
    candidateLimit: options.candidateLimit,
  })
  const endpoint = options.endpoint?.trim() || ''
  const fetchImpl = options.fetchImpl || fetch

  if (grounding.status !== 'answered') {
    return withArtifactOutcome(query, {
      ...fallback,
      mode: 'grounded-only',
      prompt,
      confidenceScore: buildConfidenceScore(fallback, 'grounded-only'),
      providerTracePreview: buildProviderTracePreview('grounded-only', fallback.provider, fallback.answer),
      improvementHint: buildImprovementHint(fallback),
    })
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
        const errorText = await response.text().catch(() => '')
        throw new Error(`Bishop orchestration failed with status ${response.status}${errorText.trim() ? `: ${errorText.trim()}` : ''}`)
      }

      const payload = (await response.json()) as Partial<AnswerResult> & {
        answer?: string
        artifact?: unknown
        artifactStatus?: BishopArtifactStatus
        artifactNotice?: string
      }
      const answer = typeof payload.answer === 'string' && payload.answer.trim() ? payload.answer.trim() : fallback.answer

      const result = augmentResultWithTrace(
        {
          status: fallback.status,
          provider: payload.provider || fallback.provider,
          query: fallback.query,
          answer,
          sources: fallback.sources,
          deniedSources: fallback.deniedSources,
          chunkCount: payload.chunkCount ?? fallback.chunkCount,
          tokenCount: payload.tokenCount ?? fallback.tokenCount,
          latencyMs: payload.latencyMs ?? fallback.latencyMs,
        },
        'remote',
        prompt,
      )

      return withArtifactOutcome(query, result, payload)
    } catch (error) {
      const errorPreview = error instanceof Error ? error.message : 'Remote orchestration endpoint failed'
      return withArtifactOutcome(query, {
        ...fallback,
        mode: 'fallback',
        prompt,
        confidenceScore: buildConfidenceScore(fallback, 'fallback'),
        providerTracePreview: buildProviderTracePreview('fallback', fallback.provider, fallback.answer, errorPreview),
        improvementHint: buildImprovementHint(fallback),
      })
    }
  }

  const remoteAnswer =
    provider === 'openai'
      ? await runOpenAIRemoteAnswer(query, role, provider, grounding, prompt, options, fallback)
      : provider === 'gemini'
      ? await runGeminiRemoteAnswer(query, role, provider, grounding, prompt, options, fallback)
        : await runAnthropicRemoteAnswer(query, role, provider, grounding, prompt, options, fallback)
  if (remoteAnswer.result) {
    return withArtifactOutcome(query, remoteAnswer.result)
  }

  return withArtifactOutcome(query, {
    ...fallback,
    mode: 'fallback',
    prompt,
    confidenceScore: buildConfidenceScore(fallback, 'fallback'),
    providerTracePreview: buildProviderTracePreview('fallback', fallback.provider, fallback.answer, remoteAnswer.errorPreview),
    improvementHint: buildImprovementHint(fallback),
  })
}
