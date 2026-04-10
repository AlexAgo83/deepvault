import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  answerQuestion,
  buildEvaluationRows,
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

const rows = buildEvaluationRows()
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
