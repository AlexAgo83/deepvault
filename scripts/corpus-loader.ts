import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import type { Corpus } from '../src/lib/deepvault'
import { normalizeCorpusMode, type CorpusMode } from '../src/lib/corpus-mode'

export interface CorpusSourceOptions {
  mode?: string | null
  inputPath?: string | null
}

export function parseCorpusMode(value: string | null | undefined): CorpusMode {
  return normalizeCorpusMode(value)
}

export function resolveCorpusInputPath(mode: CorpusMode, explicitPath?: string | null): string {
  if (explicitPath) {
    return resolve(explicitPath)
  }

  if (mode === 'live') {
    return resolve('data/live-corpus.json')
  }

  return resolve('data/pilot-corpus.json')
}

export async function loadCorpus(options: CorpusSourceOptions = {}): Promise<{ corpus: Corpus; corpusPath: string; mode: CorpusMode }> {
  const mode = parseCorpusMode(options.mode ?? process.env.DEEPVAULT_DATA_MODE)
  const corpusPath = resolveCorpusInputPath(mode, options.inputPath ?? process.env.DEEPVAULT_CORPUS_PATH)

  try {
    await access(corpusPath, constants.R_OK)
  } catch {
    if (mode === 'live') {
      throw new Error(`Live corpus not found at ${corpusPath}. Provide --input or set DEEPVAULT_CORPUS_PATH.`)
    }
  }

  const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as Corpus
  return { corpus, corpusPath, mode }
}

export function resolveSnapshotPath(basePath: string, mode: CorpusMode): string {
  if (mode === 'live') {
    return basePath.replace(/(\.json)?$/, '.live.json')
  }
  return basePath
}
