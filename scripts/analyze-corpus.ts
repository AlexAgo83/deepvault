import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Corpus, CorpusDocument, CorpusSection, DocumentAnalysis } from '../src/lib/deepvault'
import { loadCorpus } from './corpus-loader'

const ANALYSIS_VERSION = '1.0'
const DEFAULT_OUTPUT_PATH = 'data/runtime/analyzed-corpus.json'
const DEFAULT_REPORT_PATH = 'data/runtime/analyze-report.json'

export interface AnalysisRunReport {
  schemaVersion: string
  analysisVersion: string
  generatedAt: string
  provider: string
  model: string
  inputPath: string
  outputPath: string
  corpusMode: string
  selectionMode: 'off' | 'necessary' | 'all'
  limit: number
  scanned: number
  selected: number
  analyzed: number
  excluded: number
  failed: number
  reused: number
  stale: number
  exclusionReasons: Record<string, number>
  selectionReasons: Record<string, number>
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedCostUsd: number
  actualInputTokens: number
  actualOutputTokens: number
  tokenCountMode: 'actual' | 'estimated'
  providerAttempts: number
  providerSuccesses: number
  providerFallbacks: number
  providerFailureReasons: Record<string, number>
  elapsedMs: number
  averageDocumentMs: number
}

const PROVIDER_COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  openai: { input: 0.005, output: 0.015 },
  anthropic: { input: 0.004, output: 0.012 },
  gemini: { input: 0.0025, output: 0.0075 },
  local: { input: 0, output: 0 },
}

const ANALYSIS_PROMPT_CONTENT_LIMIT = 600
const ANALYSIS_MAX_OUTPUT_TOKENS = 350
const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  local: 'heuristic-v1',
  openai: 'gpt-5.4-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-sonnet-latest',
}

function buildProviderPrompt(document: CorpusDocument): string {
  const contentSnippet = document.content.slice(0, ANALYSIS_PROMPT_CONTENT_LIMIT).trim()
  return [
    'Analyze the document below and return a JSON object with these exact fields:',
    '- "summary": 1-2 sentence summary (string)',
    '- "keywords": up to 8 relevant keywords (array of strings)',
    '- "sections": up to 4 sections each with "heading" (string) and "content" (string) (array)',
    '- "documentType": document type such as report, policy, spreadsheet, presentation (string)',
    '- "confidence": confidence score 55-95 (number)',
    'Return only the JSON object, no other text.',
    '',
    `Title: ${document.title}`,
    `Tags: ${document.tags.join(', ') || 'none'}`,
    `Content snippet:\n${contentSnippet}`,
  ].join('\n')
}

interface ProviderAnalysisOptions {
  provider: string
  model: string
  apiKey: string
  contentHash: string
  version: string
}

interface AnalyzeProgressSnapshot {
  scanned: number
  analyzed: number
  selected: number
  excluded: number
  reused: number
  stale: number
  providerAttempts: number
  providerSuccesses: number
  providerFallbacks: number
  elapsedMs: number
}

function parseProviderAnalysisResponse(
  rawText: string,
  document: CorpusDocument,
  options: ProviderAnalysisOptions,
): DocumentAnalysis | null {
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    if (!summary) return null

    const keywords = Array.isArray(parsed.keywords)
      ? (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 8)
      : buildKeywords(document)

    const sections: CorpusSection[] = Array.isArray(parsed.sections)
      ? (parsed.sections as unknown[])
          .filter(
            (s): s is { heading: string; content: string } =>
              typeof (s as Record<string, unknown>).heading === 'string' &&
              typeof (s as Record<string, unknown>).content === 'string',
          )
          .slice(0, 4)
      : buildAnalysisSections(document)

    const documentType =
      typeof parsed.documentType === 'string' ? parsed.documentType : inferDocumentType(document)
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(55, Math.min(95, Math.round(parsed.confidence))) : 75

    return {
      status: 'analyzed',
      version: options.version,
      provider: options.provider,
      model: options.model,
      analyzedAt: new Date().toISOString(),
      contentHash: options.contentHash,
      summary,
      keywords,
      sections,
      documentType,
      confidence,
    }
  } catch {
    return null
  }
}

interface ProviderCallResult {
  text: string | null
  inputTokens: number
  outputTokens: number
  failureReason: string | null
}

function buildHttpFailureReason(status: number, details: string | null): string {
  if (!details) {
    return `http_${status}`
  }
  return `http_${status}:${details}`
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string | null; type?: string | null; code?: string | null }
    }
    const message = payload.error?.message?.trim()
    const code = payload.error?.code?.trim()
    const type = payload.error?.type?.trim()
    return [code, type, message].filter(Boolean).join('|') || null
  } catch {
    try {
      const text = (await response.text()).trim()
      return text || null
    } catch {
      return null
    }
  }
}

function extractOpenAIResponsesText(payload: {
  output_text?: string | null
  output?: Array<{
    type?: string
    content?: Array<{ type?: string; text?: string | null }>
  }>
}): string | null {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim()
  }

  const parts = (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)

  return parts.join('\n').trim() || null
}

async function callAnthropicProvider(prompt: string, model: string, apiKey: string): Promise<ProviderCallResult> {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model,
    max_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = response.content
    .filter((block) => block.type === 'text' && 'text' in block && typeof (block as { text: string }).text === 'string')
    .map((block) => (block as { text: string }).text.trim())
    .join('\n')
  return {
    text: text.trim() || null,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    failureReason: null,
  }
}

async function callOpenAIProvider(prompt: string, model: string, apiKey: string): Promise<ProviderCallResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      max_output_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
      input: [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) {
    const details = await readErrorDetail(response)
    return {
      text: null,
      inputTokens: 0,
      outputTokens: 0,
      failureReason: buildHttpFailureReason(response.status, details),
    }
  }
  const payload = (await response.json()) as {
    output_text?: string | null
    output?: Array<{
      type?: string
      content?: Array<{ type?: string; text?: string | null }>
    }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = extractOpenAIResponsesText(payload)
  return {
    text,
    inputTokens: payload.usage?.input_tokens || 0,
    outputTokens: payload.usage?.output_tokens || 0,
    failureReason: text ? null : 'empty_response',
  }
}

async function callGeminiProvider(prompt: string, model: string, apiKey: string): Promise<ProviderCallResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: ANALYSIS_MAX_OUTPUT_TOKENS },
      }),
    },
  )
  if (!response.ok) {
    return {
      text: null,
      inputTokens: 0,
      outputTokens: 0,
      failureReason: `http_${response.status}`,
    }
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text?.trim() || '')
      .filter(Boolean)
      .join('\n') || null
  return {
    text,
    inputTokens: payload.usageMetadata?.promptTokenCount || 0,
    outputTokens: payload.usageMetadata?.candidatesTokenCount || 0,
    failureReason: text ? null : 'empty_response',
  }
}

interface ProviderAnalysisResult {
  analysis: DocumentAnalysis | null
  inputTokens: number
  outputTokens: number
  failureReason: string | null
}

async function runProviderAnalysis(
  document: CorpusDocument,
  options: ProviderAnalysisOptions,
): Promise<ProviderAnalysisResult> {
  const prompt = buildProviderPrompt(document)
  let callResult: ProviderCallResult = { text: null, inputTokens: 0, outputTokens: 0, failureReason: null }

  try {
    if (options.provider === 'anthropic') {
      callResult = await callAnthropicProvider(prompt, options.model, options.apiKey)
    } else if (options.provider === 'openai') {
      callResult = await callOpenAIProvider(prompt, options.model, options.apiKey)
    } else if (options.provider === 'gemini') {
      callResult = await callGeminiProvider(prompt, options.model, options.apiKey)
    }
  } catch (error) {
    return {
      analysis: null,
      inputTokens: 0,
      outputTokens: 0,
      failureReason: error instanceof Error ? error.message : 'provider_request_failed',
    }
  }

  if (!callResult.text) {
    return {
      analysis: null,
      inputTokens: callResult.inputTokens,
      outputTokens: callResult.outputTokens,
      failureReason: callResult.failureReason || 'empty_response',
    }
  }

  const parsedAnalysis = parseProviderAnalysisResponse(callResult.text, document, options)
  if (!parsedAnalysis) {
    return {
      analysis: null,
      inputTokens: callResult.inputTokens,
      outputTokens: callResult.outputTokens,
      failureReason: 'invalid_json_response',
    }
  }

  return {
    analysis: parsedAnalysis,
    inputTokens: callResult.inputTokens,
    outputTokens: callResult.outputTokens,
    failureReason: null,
  }
}

function readCliArg(argv: string[], flag: string): string | null {
  const index = argv.findIndex((value) => value === flag)
  if (index === -1) {
    return null
  }
  return argv[index + 1] || null
}

function normalizeMode(value: string | null | undefined): 'off' | 'necessary' | 'all' {
  if (value === 'off' || value === 'all') {
    return value
  }
  return 'necessary'
}

function buildContentHash(document: CorpusDocument): string {
  return createHash('sha256')
    .update([document.updatedAt, document.summary, document.content, document.directAnswer].join('\n'))
    .digest('hex')
}

function inferDocumentType(document: CorpusDocument): string {
  return document.fileType || document.kind || document.path.split('.').pop() || 'document'
}

function buildAnalysisSections(document: CorpusDocument): CorpusSection[] {
  if (document.sections?.length) {
    return document.sections.slice(0, 4)
  }

  const sentences = document.content
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 3)

  return sentences.map((sentence, index) => ({
    heading: index === 0 ? 'Overview' : `Section ${index + 1}`,
    content: sentence,
  }))
}

function buildKeywords(document: CorpusDocument): string[] {
  const tokens = [document.title, document.summary, ...document.tags]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((value) => value.length > 3)
  return [...new Set(tokens)].slice(0, 8)
}

function selectCandidateReason(document: CorpusDocument): string | null {
  const contentLength = document.content.trim().length
  if (['pdf', 'document', 'presentation'].includes(document.fileType || '')) {
    return 'priority_file_type'
  }
  if (!document.summary.trim() || contentLength < 280) {
    return 'weak_local_extraction'
  }
  if (document.sections?.length === 0) {
    return 'missing_structure'
  }
  return null
}

function getExclusionReason(document: CorpusDocument): string | null {
  const path = document.path.toLowerCase()
  if (/\.(zip|exe|dmg|mp4|mov|png|jpg|jpeg)$/.test(path)) {
    return 'unsupported_file_type'
  }
  if (!document.content.trim() && !document.summary.trim()) {
    return 'unreadable_content'
  }
  if (document.content.length > 18000) {
    return 'file_too_large'
  }
  return null
}

function buildAnalysis(document: CorpusDocument, provider: string, model: string): DocumentAnalysis {
  const contentHash = buildContentHash(document)
  const sections = buildAnalysisSections(document)
  const summary = document.summary.trim() || sections[0]?.content || document.title
  return {
    status: 'analyzed',
    version: ANALYSIS_VERSION,
    provider,
    requestedProvider: provider,
    model,
    requestedModel: model,
    analyzedAt: new Date().toISOString(),
    contentHash,
    summary,
    keywords: buildKeywords(document),
    sections,
    documentType: inferDocumentType(document),
    confidence: Math.max(55, Math.min(92, 58 + sections.length * 8 + (document.tags.length > 0 ? 6 : 0))),
    providerStatus: provider === 'local' ? 'local' : 'fallback',
  }
}

function shouldReuseExistingAnalysis(document: CorpusDocument): boolean {
  if (document.analysis?.status !== 'analyzed') {
    return false
  }
  return document.analysis.version === ANALYSIS_VERSION && document.analysis.contentHash === buildContentHash(document)
}

export async function analyzeCorpusDocuments(
  corpus: Corpus,
  options: {
    mode: 'off' | 'necessary' | 'all'
    provider: string
    model: string
    limit: number
    apiKey?: string
    onProgress?: (snapshot: AnalyzeProgressSnapshot) => void
  },
) {
  const startedAtMs = Date.now()
  let analyzed = 0
  let failed = 0
  let excluded = 0
  let reused = 0
  let scanned = 0
  let stale = 0
  let actualInputTokens = 0
  let actualOutputTokens = 0
  let providerAttempts = 0
  let providerSuccesses = 0
  let providerFallbacks = 0
  let providerFallbackLogCount = 0
  const exclusionReasons: Record<string, number> = {}
  const selectionReasons: Record<string, number> = {}
  const providerFailureReasons: Record<string, number> = {}
  const useProvider = options.provider !== 'local' && Boolean(options.apiKey)
  const reportProgress = () => {
    options.onProgress?.({
      scanned,
      analyzed,
      selected: analyzed + failed + stale,
      excluded,
      reused,
      stale,
      providerAttempts,
      providerSuccesses,
      providerFallbacks,
      elapsedMs: Date.now() - startedAtMs,
    })
  }

  const documents: CorpusDocument[] = []

  for (const document of corpus.documents) {
    scanned += 1

    if (shouldReuseExistingAnalysis(document)) {
      reused += 1
      documents.push(document)
      reportProgress()
      continue
    }

    const exclusionReason = getExclusionReason(document)
    if (exclusionReason) {
      excluded += 1
      exclusionReasons[exclusionReason] = (exclusionReasons[exclusionReason] || 0) + 1
      documents.push({
        ...document,
        analysis: {
          status: 'excluded' as const,
          version: ANALYSIS_VERSION,
          contentHash: buildContentHash(document),
          excludedReason: exclusionReason,
        },
      })
      reportProgress()
      continue
    }

    const selectionReason = selectCandidateReason(document)
    if (options.mode === 'necessary' && !selectionReason) {
      documents.push({
        ...document,
        analysis: {
          status: 'excluded' as const,
          version: ANALYSIS_VERSION,
          contentHash: buildContentHash(document),
          excludedReason: 'insufficient_expected_value',
        },
      })
      reportProgress()
      continue
    }

    if (analyzed >= options.limit) {
      stale += 1
      documents.push({
        ...document,
        analysis: {
          status: 'stale' as const,
          version: ANALYSIS_VERSION,
          contentHash: buildContentHash(document),
          failureReason: 'run_budget_reached',
        },
      })
      reportProgress()
      continue
    }

    try {
      analyzed += 1
      if (selectionReason) {
        selectionReasons[selectionReason] = (selectionReasons[selectionReason] || 0) + 1
      } else {
        selectionReasons.all_documents = (selectionReasons.all_documents || 0) + 1
      }

      const contentHash = buildContentHash(document)
      let analysisOutput = buildAnalysis(document, options.provider, options.model)

      if (useProvider) {
        providerAttempts += 1
        const providerResult = await runProviderAnalysis(document, {
          provider: options.provider,
          model: options.model,
          apiKey: options.apiKey as string,
          contentHash,
          version: ANALYSIS_VERSION,
        })
        actualInputTokens += providerResult.inputTokens
        actualOutputTokens += providerResult.outputTokens
        if (providerResult.analysis) {
          analysisOutput = providerResult.analysis
          analysisOutput.providerStatus = 'provider'
          analysisOutput.requestedProvider = options.provider
          analysisOutput.requestedModel = options.model
          providerSuccesses += 1
        } else {
          const fallbackReason = providerResult.failureReason || 'provider_analysis_unavailable'
          analysisOutput = {
            ...analysisOutput,
            provider: 'local',
            model: DEFAULT_PROVIDER_MODELS.local,
            requestedProvider: options.provider,
            requestedModel: options.model,
            providerStatus: 'fallback',
            fallbackReason,
          }
          providerFallbacks += 1
          providerFailureReasons[fallbackReason] = (providerFailureReasons[fallbackReason] || 0) + 1
          if (providerFallbackLogCount < 5) {
            providerFallbackLogCount += 1
            console.warn(
              `Provider fallback for ${document.path}: requested ${options.provider}/${options.model}, using local heuristic (${fallbackReason}).`,
            )
          }
        }
      }

      documents.push({ ...document, analysis: analysisOutput })
      reportProgress()
    } catch (error) {
      failed += 1
      analyzed -= 1
      documents.push({
        ...document,
        analysis: {
          status: 'failed' as const,
          version: ANALYSIS_VERSION,
          contentHash: buildContentHash(document),
          failureReason: error instanceof Error ? error.message : 'analysis_failed',
        },
      })
      reportProgress()
    }
  }

  return {
    documents,
    metrics: {
      scanned,
      selected: analyzed + failed + stale,
      analyzed,
      failed,
      excluded,
      reused,
      stale,
      exclusionReasons,
      selectionReasons,
      actualInputTokens,
      actualOutputTokens,
      providerAttempts,
      providerSuccesses,
      providerFallbacks,
      providerFailureReasons,
    },
  }
}

export function buildAnalysisRunReport(options: {
  corpusMode: string
  corpusPath: string
  outputPath: string
  provider: string
  model: string
  selectionMode: 'off' | 'necessary' | 'all'
  limit: number
  metrics: Awaited<ReturnType<typeof analyzeCorpusDocuments>>['metrics']
  elapsedMs?: number
}): AnalysisRunReport {
  const estimatedInputTokens = options.metrics.analyzed * 900
  const estimatedOutputTokens = options.metrics.analyzed * 220
  const actualInputTokens = options.metrics.actualInputTokens
  const actualOutputTokens = options.metrics.actualOutputTokens
  const hasActualTokens = actualInputTokens > 0 || actualOutputTokens > 0
  const tokenCountMode: 'actual' | 'estimated' = hasActualTokens ? 'actual' : 'estimated'
  const pricing = PROVIDER_COST_PER_1K_TOKENS[options.provider] || PROVIDER_COST_PER_1K_TOKENS.local
  const elapsedMs = options.elapsedMs || 0
  const averageDocumentMs = options.metrics.analyzed > 0 ? Math.round(elapsedMs / options.metrics.analyzed) : 0
  const estimatedCostUsd = Number(
    (((estimatedInputTokens / 1000) * pricing.input) + ((estimatedOutputTokens / 1000) * pricing.output)).toFixed(4),
  )

  return {
    schemaVersion: '1.0',
    analysisVersion: ANALYSIS_VERSION,
    generatedAt: new Date().toISOString(),
    provider: options.provider,
    model: options.model,
    inputPath: options.corpusPath,
    outputPath: options.outputPath,
    corpusMode: options.corpusMode,
    selectionMode: options.selectionMode,
    limit: options.limit,
    scanned: options.metrics.scanned,
    selected: options.metrics.selected,
    analyzed: options.metrics.analyzed,
    failed: options.metrics.failed,
    excluded: options.metrics.excluded,
    reused: options.metrics.reused,
    stale: options.metrics.stale,
    exclusionReasons: options.metrics.exclusionReasons,
    selectionReasons: options.metrics.selectionReasons,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd,
    actualInputTokens,
    actualOutputTokens,
    tokenCountMode,
    providerAttempts: options.metrics.providerAttempts,
    providerSuccesses: options.metrics.providerSuccesses,
    providerFallbacks: options.metrics.providerFallbacks,
    providerFailureReasons: options.metrics.providerFailureReasons,
    elapsedMs,
    averageDocumentMs,
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

async function main() {
  const mode = normalizeMode(readCliArg(process.argv, '--analysis'))
  if (mode === 'off') {
    console.log('Analysis mode is off. Nothing to do.')
    return
  }

  const provider = readCliArg(process.argv, '--provider') || process.env.DEEPVAULT_ANALYZE_PROVIDER || 'local'
  const model = readCliArg(process.argv, '--model') || DEFAULT_PROVIDER_MODELS[provider] || DEFAULT_PROVIDER_MODELS.local
  const limit = Math.max(1, Number(readCliArg(process.argv, '--limit') || process.env.DEEPVAULT_ANALYZE_LIMIT || '12'))
  const outputPath = resolve(readCliArg(process.argv, '--output') || DEFAULT_OUTPUT_PATH)
  const reportPath = resolve(readCliArg(process.argv, '--report') || DEFAULT_REPORT_PATH)
  const { corpus, mode: corpusMode, corpusPath } = await loadCorpus({
    mode: readCliArg(process.argv, '--mode'),
    inputPath: readCliArg(process.argv, '--input'),
  })

  const apiKey =
    provider === 'anthropic'
      ? (process.env.ANTHROPIC_API_KEY || '').trim()
      : provider === 'gemini'
        ? (process.env.GEMINI_API_KEY || '').trim()
        : (process.env.OPENAI_API_KEY || '').trim()

  const usingProviderAnalysis = provider !== 'local' && Boolean(apiKey)

  console.log('Starting post-ingest analysis run...')
  console.log(`Requested provider: ${provider}`)
  console.log(`Effective analysis path: ${usingProviderAnalysis ? 'provider-backed' : 'local heuristic'}`)
  console.log(`Model: ${model}`)
  console.log(`Selection mode: ${mode}`)
  console.log(`Run budget: ${limit}`)
  console.log(`Loaded corpus: ${corpusPath}`)
  console.log(`Corpus mode: ${corpusMode}`)
  console.log(`Documents in corpus: ${corpus.documents.length}`)
  if (provider !== 'local' && !apiKey) {
    console.log(`Provider API key for ${provider} not found. Falling back to local heuristic analysis.`)
  }
  console.log('Selecting and analyzing candidate documents...')

  const startedAtMs = Date.now()
  let lastLoggedAnalyzed = 0
  let lastLoggedAtMs = Date.now()
  const analyzedCorpus = await analyzeCorpusDocuments(corpus, {
    mode,
    provider,
    model,
    limit,
    apiKey: apiKey || undefined,
    onProgress: (snapshot) => {
      if (snapshot.analyzed === 0) {
        return
      }
      const shouldLogByCount = snapshot.analyzed >= lastLoggedAnalyzed + 10
      const shouldLogByTime = Date.now() - lastLoggedAtMs >= 15_000
      if (!shouldLogByCount && !shouldLogByTime && snapshot.analyzed !== limit) {
        return
      }
      lastLoggedAnalyzed = snapshot.analyzed
      lastLoggedAtMs = Date.now()
      const averageMs = snapshot.analyzed > 0 ? Math.round(snapshot.elapsedMs / snapshot.analyzed) : 0
      console.log(
        `Progress: analyzed ${snapshot.analyzed}/${limit} documents in ${formatDuration(snapshot.elapsedMs)} ` +
          `(avg ${averageMs} ms/doc, provider successes ${snapshot.providerSuccesses}, fallbacks ${snapshot.providerFallbacks}).`,
      )
    },
  })
  const elapsedMs = Date.now() - startedAtMs

  const nextCorpus: Corpus = {
    ...corpus,
    documents: analyzedCorpus.documents,
  }
  const report = buildAnalysisRunReport({
    corpusMode,
    corpusPath,
    outputPath,
    provider,
    model,
    selectionMode: mode,
    limit,
    metrics: analyzedCorpus.metrics,
    elapsedMs,
  })

  console.log('Writing derived analysis artifacts...')

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(nextCorpus, null, 2))
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2))

  console.log('Analysis run completed.')
  console.log(`Analyzed corpus written to ${outputPath}`)
  console.log(`Analysis report written to ${reportPath}`)
  console.log(`Input corpus: ${corpusPath}`)
  console.log(`Mode: ${corpusMode}`)
  console.log(`Scanned: ${report.scanned}`)
  console.log(`Selected: ${report.selected}`)
  console.log(`Analyzed: ${report.analyzed}`)
  console.log(`Failed: ${report.failed}`)
  console.log(`Excluded: ${report.excluded}`)
  console.log(`Reused: ${report.reused}`)
  console.log(`Stale: ${report.stale}`)
  if (report.tokenCountMode === 'actual') {
    console.log(`Actual input tokens: ${report.actualInputTokens}`)
    console.log(`Actual output tokens: ${report.actualOutputTokens}`)
  } else {
    console.log(`Estimated input tokens: ${report.estimatedInputTokens}`)
    console.log(`Estimated output tokens: ${report.estimatedOutputTokens}`)
  }
  console.log(`Provider attempts: ${report.providerAttempts}`)
  console.log(`Provider successes: ${report.providerSuccesses}`)
  console.log(`Provider fallbacks: ${report.providerFallbacks}`)
  console.log(`Elapsed: ${formatDuration(report.elapsedMs)}`)
  console.log(`Average per analyzed document: ${report.averageDocumentMs} ms`)
  if (report.providerFallbacks > 0) {
    const providerFailureSummary = Object.entries(report.providerFailureReasons)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ')
    console.log(`Provider fallback reasons: ${providerFailureSummary}`)
  }
  console.log(`Estimated cost (USD): ${report.estimatedCostUsd.toFixed(4)}`)
  console.log(`Token count mode: ${report.tokenCountMode}`)
}

const isDirectRun = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isDirectRun) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
