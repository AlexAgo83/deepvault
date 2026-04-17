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
}

const PROVIDER_COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  openai: { input: 0.005, output: 0.015 },
  anthropic: { input: 0.004, output: 0.012 },
  gemini: { input: 0.0025, output: 0.0075 },
  local: { input: 0, output: 0 },
}

const ANALYSIS_PROMPT_CONTENT_LIMIT = 600
const ANALYSIS_MAX_OUTPUT_TOKENS = 350

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
  }
}

async function callOpenAIProvider(prompt: string, model: string, apiKey: string): Promise<ProviderCallResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) return { text: null, inputTokens: 0, outputTokens: 0 }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: payload.choices?.[0]?.message?.content?.trim() || null,
    inputTokens: payload.usage?.prompt_tokens || 0,
    outputTokens: payload.usage?.completion_tokens || 0,
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
  if (!response.ok) return { text: null, inputTokens: 0, outputTokens: 0 }
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
  }
}

interface ProviderAnalysisResult {
  analysis: DocumentAnalysis | null
  inputTokens: number
  outputTokens: number
}

async function runProviderAnalysis(
  document: CorpusDocument,
  options: ProviderAnalysisOptions,
): Promise<ProviderAnalysisResult> {
  const prompt = buildProviderPrompt(document)
  let callResult: ProviderCallResult = { text: null, inputTokens: 0, outputTokens: 0 }

  try {
    if (options.provider === 'anthropic') {
      callResult = await callAnthropicProvider(prompt, options.model, options.apiKey)
    } else if (options.provider === 'openai') {
      callResult = await callOpenAIProvider(prompt, options.model, options.apiKey)
    } else if (options.provider === 'gemini') {
      callResult = await callGeminiProvider(prompt, options.model, options.apiKey)
    }
  } catch {
    return { analysis: null, inputTokens: 0, outputTokens: 0 }
  }

  if (!callResult.text) return { analysis: null, inputTokens: callResult.inputTokens, outputTokens: callResult.outputTokens }
  return {
    analysis: parseProviderAnalysisResponse(callResult.text, document, options),
    inputTokens: callResult.inputTokens,
    outputTokens: callResult.outputTokens,
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
    model,
    analyzedAt: new Date().toISOString(),
    contentHash,
    summary,
    keywords: buildKeywords(document),
    sections,
    documentType: inferDocumentType(document),
    confidence: Math.max(55, Math.min(92, 58 + sections.length * 8 + (document.tags.length > 0 ? 6 : 0))),
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
  },
) {
  let analyzed = 0
  let failed = 0
  let excluded = 0
  let reused = 0
  let scanned = 0
  let stale = 0
  let actualInputTokens = 0
  let actualOutputTokens = 0
  const exclusionReasons: Record<string, number> = {}
  const selectionReasons: Record<string, number> = {}
  const useProvider = options.provider !== 'local' && Boolean(options.apiKey)

  const documents: CorpusDocument[] = []

  for (const document of corpus.documents) {
    scanned += 1

    if (shouldReuseExistingAnalysis(document)) {
      reused += 1
      documents.push(document)
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
        }
      }

      documents.push({ ...document, analysis: analysisOutput })
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
}): AnalysisRunReport {
  const estimatedInputTokens = options.metrics.analyzed * 900
  const estimatedOutputTokens = options.metrics.analyzed * 220
  const actualInputTokens = options.metrics.actualInputTokens
  const actualOutputTokens = options.metrics.actualOutputTokens
  const hasActualTokens = actualInputTokens > 0 || actualOutputTokens > 0
  const tokenCountMode: 'actual' | 'estimated' = hasActualTokens ? 'actual' : 'estimated'
  const pricing = PROVIDER_COST_PER_1K_TOKENS[options.provider] || PROVIDER_COST_PER_1K_TOKENS.local
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
  }
}

async function main() {
  const mode = normalizeMode(readCliArg(process.argv, '--analysis'))
  if (mode === 'off') {
    console.log('Analysis mode is off. Nothing to do.')
    return
  }

  const provider = readCliArg(process.argv, '--provider') || 'local'
  const model = readCliArg(process.argv, '--model') || 'heuristic-v1'
  const limit = Math.max(1, Number(readCliArg(process.argv, '--limit') || '12'))
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

  const analyzedCorpus = await analyzeCorpusDocuments(corpus, {
    mode,
    provider,
    model,
    limit,
    apiKey: apiKey || undefined,
  })

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
  })

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(nextCorpus, null, 2))
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2))

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
