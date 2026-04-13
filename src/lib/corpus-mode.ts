export type CorpusMode = 'mock' | 'live'

export const DEFAULT_CORPUS_MODE: CorpusMode = 'mock'

export function normalizeCorpusMode(value: string | undefined | null): CorpusMode {
  return value === 'live' ? 'live' : DEFAULT_CORPUS_MODE
}

export function resolveCorpusMode(envMode: string | undefined | null, settingsMode: string | undefined | null): CorpusMode {
  const effectiveMode = settingsMode === 'mock' || settingsMode === 'live' ? settingsMode : envMode
  return normalizeCorpusMode(effectiveMode)
}

export function describeCorpusMode(mode: CorpusMode): string {
  return mode === 'live' ? 'live data' : 'mock data'
}
