import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Corpus } from '../src/lib/deepvault'
import { summarizeCorpus } from '../src/lib/deepvault'
import { isCorpusLike } from '../src/lib/corpus-client'
import { writeCorpusFile } from './deepvault-graph'
import { loadProjectEnv } from './runtime-env'

const DEFAULT_INPUT_PATH = 'data/runtime/analyzed-corpus.json'
const DEFAULT_OUTPUT_PATH = 'public/live-corpus.json'

function readCliArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function readCliFlag(argv: string[], name: string): boolean {
  return argv.includes(name)
}

export interface PublishAnalyzedCorpusOptions {
  inputPath?: string
  outputPath?: string
  dryRun?: boolean
}

export async function loadAnalyzedCorpus(inputPath: string): Promise<Corpus> {
  try {
    await access(inputPath, constants.R_OK)
  } catch {
    throw new Error(`Analyzed corpus not found at ${inputPath}. Run npm run analyze first or provide --input.`)
  }

  let payload: unknown
  try {
    payload = JSON.parse(await readFile(inputPath, 'utf8'))
  } catch {
    throw new Error(`Analyzed corpus at ${inputPath} could not be parsed.`)
  }

  if (!isCorpusLike(payload)) {
    throw new Error(`Invalid analyzed corpus at ${inputPath}: expected a DeepVault corpus payload.`)
  }

  return payload
}

export async function publishAnalyzedCorpus(options: PublishAnalyzedCorpusOptions = {}) {
  await loadProjectEnv()

  const inputPath = resolve(options.inputPath || DEFAULT_INPUT_PATH)
  const outputPath = resolve(options.outputPath || DEFAULT_OUTPUT_PATH)
  const dryRun = Boolean(options.dryRun)
  const corpus = await loadAnalyzedCorpus(inputPath)
  const role = corpus.defaultUserRole || 'analyst'
  const summary = summarizeCorpus(corpus, role)
  const analyzedCount = corpus.documents.filter((document) => document.analysis?.status === 'analyzed').length

  if (!dryRun) {
    await writeCorpusFile(outputPath, corpus)
  }

  return {
    inputPath,
    outputPath,
    dryRun,
    corpus,
    analyzedCount,
    visibleDocuments: summary.visibleSources,
    siteCount: corpus.sites.length,
  }
}

export async function main() {
  const result = await publishAnalyzedCorpus({
    inputPath: readCliArg(process.argv, '--input'),
    outputPath: readCliArg(process.argv, '--output'),
    dryRun: readCliFlag(process.argv, '--dry-run'),
  })

  console.log(result.dryRun ? `Dry run target: ${result.outputPath}` : `Published ${result.outputPath}`)
  console.log(`Source analyzed corpus: ${result.inputPath}`)
  console.log(`Analyzed documents available: ${result.analyzedCount}`)
  console.log(`Visible documents: ${result.visibleDocuments}`)
  console.log(`Sites: ${result.siteCount}`)
}

const isDirectRun = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isDirectRun) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
