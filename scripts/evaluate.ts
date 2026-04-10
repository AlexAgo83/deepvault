import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  answerQuestion,
  buildEvaluationRows,
  canAccessDocument,
  type Corpus,
  type EvaluationRow,
} from '../src/lib/deepvault'
import { loadCorpus, resolveSnapshotPath } from './corpus-loader'

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readFlag(name: string): boolean {
  return process.argv.includes(name)
}

const today = new Date().toISOString().slice(0, 10)
const outputDir = resolve('data/eval')
const mode = readArg('--mode') || process.env.DEEPVAULT_DATA_MODE
const inputPath = readArg('--input') || process.env.DEEPVAULT_CORPUS_PATH
const outputPath = resolveSnapshotPath(resolve(outputDir, `v1_baseline_${today}.json`), mode === 'live' ? 'live' : 'mock')
const strict = readFlag('--strict') || process.env.DEEPVAULT_EVAL_STRICT === '1'
const minPassRateRaw = readArg('--min-pass-rate') || process.env.DEEPVAULT_EVAL_MIN_PASS_RATE
const minPassRate = Number(minPassRateRaw || (mode === 'live' ? 0.9 : 1))

await mkdir(dirname(outputPath), { recursive: true })

const { corpus } = await loadCorpus({ mode, inputPath })

function buildLiveEvaluationRows(liveCorpus: Corpus): EvaluationRow[] {
  const candidateDocuments = liveCorpus.documents
    .filter((document) => canAccessDocument(document, 'analyst'))
    .filter((document) => Boolean(document.title && document.path))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

  const rows: EvaluationRow[] = candidateDocuments.slice(0, 18).map((document, index) => ({
    id: `L${String(index + 1).padStart(2, '0')}`,
    query: `Summarize the document: ${document.directAnswer || document.summary || document.title}.`,
    expectedSourceId: document.id,
    role: 'analyst',
    expectedStatus: 'answered',
  }))

  const restrictedDocument = liveCorpus.documents.find((document) => !canAccessDocument(document, 'guest'))
  rows.push({
    id: 'L19',
    query: restrictedDocument
      ? `What does the document say: ${restrictedDocument.directAnswer || restrictedDocument.summary || restrictedDocument.title}.`
      : 'What are the restricted launch notes for the restricted pilot site?',
    expectedSourceId: restrictedDocument?.id || null,
    role: 'guest',
    expectedStatus: 'no_permitted_sources',
  })
  rows.push({
    id: 'L20',
    query: 'What SharePoint sites are available for the Finance team?',
    expectedSourceId: null,
    role: 'analyst',
    expectedStatus: 'no_answer',
  })

  return rows
}

const rows = mode === 'live' ? buildLiveEvaluationRows(corpus) : buildEvaluationRows()
const results = rows.map((row) => {
  const answer = answerQuestion(corpus, row.query, { role: row.role, provider: 'openai', limit: 3 })
  const sourceIds = answer.sources.map((source) => source.id)
  const deniedSourceIds = answer.deniedSources.map((source) => source.id)
  const pass =
    answer.status === row.expectedStatus &&
    (row.expectedStatus === 'answered'
      ? row.expectedSourceId
        ? sourceIds.includes(row.expectedSourceId)
        : answer.sources.length > 0
      : true) &&
    (row.expectedStatus === 'no_permitted_sources'
      ? row.expectedSourceId
        ? deniedSourceIds.includes(row.expectedSourceId)
        : true
      : true)

  return {
    query_id: row.id,
    query: row.query,
    expected_source_id: row.expectedSourceId,
    expected_status: row.expectedStatus,
    provider: answer.provider,
    status: answer.status,
    chunk_count: answer.chunkCount,
    token_count: answer.tokenCount,
    source_count: answer.sources.length,
    latency_ms: answer.latencyMs,
    source_ids: sourceIds,
    pass,
  }
})

const passCount = results.filter((result) => result.pass).length
const passRate = Number((passCount / results.length).toFixed(2))
const gatePassed = passRate >= minPassRate
const payload = {
  generatedAt: new Date().toISOString(),
  provider: 'openai',
  passCount,
  totalCount: results.length,
  passRate,
  qualityGate: {
    strict,
    minPassRate,
    passed: gatePassed,
  },
  results,
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(`Pass rate: ${Math.round(passRate * 100)}%`)
console.log(`Quality gate: ${gatePassed ? 'pass' : 'fail'} (threshold ${Math.round(minPassRate * 100)}%)`)

if (strict && !gatePassed) {
  process.exitCode = 1
}
