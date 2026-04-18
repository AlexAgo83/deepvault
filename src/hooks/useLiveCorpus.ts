import { useCallback, useEffect, useState } from 'react'
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
  refreshCorpus: () => void
}

function buildIdleState(mode: CorpusMode): LiveState {
  return mode === 'live'
    ? { label: 'Live', detail: 'Waiting for live corpus', tone: 'neutral' }
    : { label: 'Mock data', detail: 'Mock corpus selected', tone: 'neutral' }
}

export function useLiveCorpus(requestedModeValue: string | undefined | null): LiveCorpusState {
  const requestedCorpusMode = normalizeCorpusMode(requestedModeValue)
  const [refreshToken, setRefreshToken] = useState(0)
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
        label: result.status === 'offline' ? 'Offline — corpus mock' : result.status === 'missing' ? 'Live fallback' : 'Live error',
        detail:
          result.status === 'offline'
            ? `${result.detail}. Use refresh to reconnect.`
            : result.status === 'missing'
              ? result.detail
              : result.detail,
        tone: result.status === 'missing' || result.status === 'offline' ? 'accent' : 'danger',
      })
    })

    return () => {
      active = false
    }
  }, [refreshToken, requestedCorpusMode])

  const refreshCorpus = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  return { corpusBundle, liveState, refreshCorpus }
}
