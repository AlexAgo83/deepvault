import { useEffect, useState } from 'react'
import { fetchLiveCorpus, getMockCorpusBundle, type CorpusBundle } from '../data/corpus'
import { type CorpusMode, normalizeCorpusMode } from '../lib/corpus-mode'
import type { PillTone } from '../components/app-ui'

export interface LiveState {
  label: string
  detail: string
  tone: PillTone
}

export interface LiveCorpusState {
  corpusBundle: CorpusBundle
  liveState: LiveState
}

function buildIdleState(mode: CorpusMode): LiveState {
  return mode === 'live'
    ? { label: 'Live', detail: 'Waiting for live corpus', tone: 'neutral' }
    : { label: 'Mock data', detail: 'Mock corpus selected', tone: 'neutral' }
}

export function useLiveCorpus(requestedModeValue: string | undefined | null): LiveCorpusState {
  const requestedCorpusMode = normalizeCorpusMode(requestedModeValue)
  const [corpusBundle, setCorpusBundle] = useState<CorpusBundle>(() => getMockCorpusBundle())
  const [liveState, setLiveState] = useState<LiveState>(() => buildIdleState(requestedCorpusMode))

  useEffect(() => {
    let active = true
    if (requestedCorpusMode !== 'live') {
      setCorpusBundle(getMockCorpusBundle())
      setLiveState(buildIdleState(requestedCorpusMode))
      return () => {
        active = false
      }
    }

    void fetchLiveCorpus().then((result) => {
      if (!active) {
        return
      }
      if (result.status === 'loaded') {
        setCorpusBundle({ corpus: result.corpus, mode: 'live' })
        setLiveState({ label: 'Live', detail: result.detail, tone: 'success' })
        return
      }
      setCorpusBundle(getMockCorpusBundle())
      setLiveState({
        label: result.status === 'missing' ? 'Live fallback' : 'Live error',
        detail: result.detail,
        tone: result.status === 'missing' ? 'accent' : 'danger',
      })
    })

    return () => {
      active = false
    }
  }, [requestedCorpusMode])

  return { corpusBundle, liveState }
}
