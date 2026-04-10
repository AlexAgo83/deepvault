import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  answerQuestion,
  buildEvaluationRows,
  type Corpus,
} from '../src/lib/deepvault'

const today = new Date().toISOString().slice(0, 10)
const outputDir = resolve('data/eval')
const outputPath = resolve(outputDir, `v1_baseline_${today}.json`)
const corpusPath = resolve('data/pilot-corpus.json')

await mkdir(dirname(outputPath), { recursive: true })

const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as Corpus

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
const payload = {
  generatedAt: new Date().toISOString(),
  provider: 'openai',
  passCount,
  totalCount: results.length,
  passRate: Number((passCount / results.length).toFixed(2)),
  results,
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(`Pass rate: ${Math.round((passCount / results.length) * 100)}%`)
