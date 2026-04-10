import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildSyncOverview, summarizeCorpus } from '../src/lib/deepvault'
import { loadCorpus, resolveSnapshotPath } from './corpus-loader'

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const runtimeDir = resolve('data/runtime')
const mode = readArg('--mode') || process.env.DEEPVAULT_DATA_MODE
const inputPath = readArg('--input') || process.env.DEEPVAULT_CORPUS_PATH
const outputPath = resolveSnapshotPath(resolve(runtimeDir, 'sync-state.json'), mode === 'live' ? 'live' : 'mock')

await mkdir(dirname(outputPath), { recursive: true })

const { corpus, corpusPath, mode: resolvedMode } = await loadCorpus({ mode, inputPath })

const role = corpus.defaultUserRole || 'analyst'
const syncOverview = buildSyncOverview(corpus, role)
const summary = summarizeCorpus(corpus, role)
const payload = {
  generatedAt: new Date().toISOString(),
  mode: resolvedMode,
  corpusPath,
  summary,
  syncOverview,
  sites: syncOverview.siteSummaries,
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

console.log(`Wrote ${outputPath}`)
console.log(`Visible documents: ${summary.visibleSources}`)
console.log(`Estimated chunks: ${summary.chunkCount}`)
