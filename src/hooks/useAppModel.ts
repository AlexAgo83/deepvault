import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  buildExplorerRows,
  buildSiteSummaries,
  buildSyncOverview,
  resolveSharePointFileUrl,
  summarizeCorpus,
  type Corpus,
  type CorpusDocument,
  type ProviderId,
  type UserRole,
} from '../lib/deepvault'
import { useBishopConversation } from './useBishopConversation'
import { useLiveCorpus } from './useLiveCorpus'
import { useProviderSecrets } from './useProviderSecrets'
import type { LiveState } from './useLiveCorpus'

export type AppTab = 'explorer' | 'bishop' | 'sync' | 'settings'

export type ExplorerRow = CorpusDocument & { score: number; siteName: string }

export interface AppModel {
  activeTab: AppTab
  setActiveTab: Dispatch<SetStateAction<AppTab>>
  activeScopeLabel: string
  corpusProviders: Corpus['providers']
  liveState: LiveState
  provider: ProviderId
  setProvider: Dispatch<SetStateAction<ProviderId>>
  role: UserRole
  setRole: Dispatch<SetStateAction<UserRole>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  selectedDocId: string
  setSelectedDocId: Dispatch<SetStateAction<string>>
  selectedExplorerDoc: ExplorerRow | null
  siteFilter: string
  setSiteFilter: Dispatch<SetStateAction<string>>
  siteSummaries: ReturnType<typeof buildSiteSummaries>
  scopedCorpusSummary: ReturnType<typeof summarizeCorpus>
  scopedSiteSummaries: ReturnType<typeof buildSiteSummaries>
  scopedSyncOverview: ReturnType<typeof buildSyncOverview>
  scopedSyncRuns: Corpus['syncRuns']
  explorerRows: ExplorerRow[]
  providerSecrets: ReturnType<typeof useProviderSecrets>['providerSecrets']
  setProviderSecret: ReturnType<typeof useProviderSecrets>['setApiKey']
  clearProviderSecrets: ReturnType<typeof useProviderSecrets>['clearProviderSecrets']
  question: string
  setQuestion: Dispatch<SetStateAction<string>>
  isAsking: boolean
  messages: ReturnType<typeof useBishopConversation>['messages']
  selectedMessage: ReturnType<typeof useBishopConversation>['selectedMessage']
  handleAsk: ReturnType<typeof useBishopConversation>['handleAsk']
  clearBishopHistory: ReturnType<typeof useBishopConversation>['clearHistory']
  exportBishopJson: ReturnType<typeof useBishopConversation>['exportJson']
  exportBishopMarkdown: ReturnType<typeof useBishopConversation>['exportMarkdown']
  resolveFileHref: (_siteId: string, _path: string, _webUrl?: string | null) => string | null
}

function buildScopedCorpus(corpus: Corpus, siteFilter: string): Corpus {
  if (siteFilter === 'all') {
    return corpus
  }

  const selectedSite = corpus.sites.find((site) => site.id === siteFilter)
  if (!selectedSite) {
    return corpus
  }

  return {
    ...corpus,
    sites: [selectedSite],
    syncRuns: corpus.syncRuns.filter((run) => run.siteIds.includes(siteFilter)),
    documents: corpus.documents.filter((document) => document.siteId === siteFilter),
  }
}

export function useAppModel(): AppModel {
  const { corpusBundle, liveState } = useLiveCorpus(import.meta.env.VITE_DEEPVAULT_DATA_MODE)
  const corpus = corpusBundle.corpus
  const [activeTab, setActiveTab] = useState<AppTab>('explorer')
  const [role, setRole] = useState<UserRole>(corpus.defaultUserRole)
  const [provider, setProvider] = useState<ProviderId>(corpus.providers[0].id)
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [selectedDocId, setSelectedDocId] = useState<string>(corpus.documents[0].id)
  const { providerSecrets, setApiKey: setProviderSecret, clearProviderSecrets } = useProviderSecrets()

  const siteSummaries = useMemo(() => buildSiteSummaries(corpus, role), [corpus, role])
  const scopedCorpus = useMemo(() => buildScopedCorpus(corpus, siteFilter), [corpus, siteFilter])
  const scopedSiteSummaries = useMemo(() => buildSiteSummaries(scopedCorpus, role), [scopedCorpus, role])
  const scopedSyncOverview = useMemo(() => buildSyncOverview(scopedCorpus, role), [scopedCorpus, role])
  const scopedCorpusSummary = useMemo(() => summarizeCorpus(scopedCorpus, role), [scopedCorpus, role])
  const explorerRows = useMemo<ExplorerRow[]>(
    () => buildExplorerRows(scopedCorpus, search, { role }) as ExplorerRow[],
    [scopedCorpus, role, search],
  )
  const selectedExplorerDoc = explorerRows.find((document) => document.id === selectedDocId) || explorerRows[0] || null
  const {
    question,
    setQuestion,
    isAsking,
    messages,
    selectedMessage,
    handleAsk,
    clearHistory: clearBishopHistory,
    exportJson: exportBishopJson,
    exportMarkdown: exportBishopMarkdown,
  } = useBishopConversation({
    corpus: scopedCorpus,
    role,
    provider,
    endpoint: import.meta.env.VITE_BISHOP_LLM_ENDPOINT,
    openaiApiKey: providerSecrets.openaiApiKey,
    geminiApiKey: providerSecrets.geminiApiKey,
    anthropicApiKey: providerSecrets.anthropicApiKey,
    onActivateTab: () => setActiveTab('bishop'),
  })

  useEffect(() => {
    if (explorerRows.length === 0) {
      if (selectedDocId !== '') {
        setSelectedDocId('')
      }
      return
    }

    if (!explorerRows.some((document) => document.id === selectedDocId)) {
      setSelectedDocId(explorerRows[0].id)
    }
  }, [explorerRows, selectedDocId])

  useEffect(() => {
    document.title = 'Nexus'
  }, [])

  const activeSiteSummary = siteSummaries.find((site) => site.id === siteFilter)
  const activeScopeLabel = siteFilter === 'all' ? 'All sites' : activeSiteSummary?.name || siteFilter
  const resolveFileHref = useCallback(
    (siteId: string, path: string, webUrl?: string | null) => resolveSharePointFileUrl(corpus, siteId, path, webUrl),
    [corpus],
  )

  return {
    activeTab,
    setActiveTab,
    activeScopeLabel,
    corpusProviders: corpus.providers,
    liveState,
    provider,
    setProvider,
    role,
    setRole,
    search,
    setSearch,
    selectedDocId,
    setSelectedDocId,
    selectedExplorerDoc,
    siteFilter,
    setSiteFilter,
    siteSummaries,
    scopedCorpusSummary,
    scopedSiteSummaries,
    scopedSyncOverview,
    scopedSyncRuns: scopedCorpus.syncRuns,
    explorerRows,
    providerSecrets,
    setProviderSecret,
    clearProviderSecrets,
    question,
    setQuestion,
    isAsking,
    messages,
    selectedMessage,
    handleAsk,
    clearBishopHistory,
    exportBishopJson,
    exportBishopMarkdown,
    resolveFileHref,
  }
}
