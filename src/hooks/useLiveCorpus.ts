import { useCallback, useEffect, useState } from 'react'
import { fetchLiveCorpus, getEmptyLiveCorpusBundle, getMockCorpusBundle, type CorpusBundle } from '../lib/corpus-client'
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

export function useLiveCorpus(
  requestedModeValue: string | undefined | null,
  options: { accessToken?: string | null; authRequired?: boolean; authReady?: boolean } = {},
): LiveCorpusState {
  const requestedCorpusMode = normalizeCorpusMode(requestedModeValue)
  const [refreshToken, setRefreshToken] = useState(0)
  const [corpusBundle, setCorpusBundle] = useState<CorpusBundle>(() =>
    requestedCorpusMode === 'live' ? getEmptyLiveCorpusBundle() : getMockCorpusBundle(),
  )
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

    if (options.authRequired && !options.accessToken?.trim()) {
      setCorpusBundle(getEmptyLiveCorpusBundle())
      setLiveState({
        label: options.authReady ? 'Sign-in required' : 'Authenticating',
        detail: options.authReady
          ? 'Complete Microsoft sign-in to load the live corpus.'
          : 'Authenticating with Microsoft Entra before loading the live corpus.',
        tone: options.authReady ? 'accent' : 'neutral',
      })
      return () => {
        active = false
      }
    }

    void fetchLiveCorpus(options.accessToken).then((result) => {
      if (!active) {
        return
      }
      if (result.status === 'loaded') {
        setCorpusBundle({ corpus: result.corpus, mode: 'live' })
        setLiveState({ label: 'Live', detail: result.detail, tone: 'success' })
        return
      }
      setCorpusBundle(getEmptyLiveCorpusBundle())
      setLiveState({
        label: result.status === 'offline' ? 'Offline — worker unreachable' : result.status === 'missing' ? 'Live corpus missing' : 'Live error',
        detail:
          result.status === 'offline'
            ? `${result.detail}. Use refresh to reconnect.`
            : result.status === 'missing'
              ? result.detail
              : result.detail,
        tone: result.status === 'offline' || result.status === 'missing' ? 'accent' : 'danger',
      })
    })

    return () => {
      active = false
    }
  }, [options.accessToken, options.authReady, options.authRequired, refreshToken, requestedCorpusMode])

  const refreshCorpus = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  return { corpusBundle, liveState, refreshCorpus }
}
