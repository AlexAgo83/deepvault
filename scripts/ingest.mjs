import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildSyncOverview, summarizeCorpus } from '../src/lib/deepvault.js'

const runtimeDir = resolve('data/runtime')
const outputPath = resolve(runtimeDir, 'sync-state.json')
const corpusPath = resolve('data/pilot-corpus.json')

await mkdir(dirname(outputPath), { recursive: true })

const corpus = JSON.parse(await readFile(corpusPath, 'utf8'))

const role = corpus.defaultUserRole || 'analyst'
const syncOverview = buildSyncOverview(corpus, role)
const summary = summarizeCorpus(corpus, role)
const payload = {
  generatedAt: new Date().toISOString(),
  summary,
  syncOverview,
  sites: syncOverview.siteSummaries,
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(`Visible documents: ${summary.visibleSources}`)
console.log(`Estimated chunks: ${summary.chunkCount}`)
