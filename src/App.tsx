import { useEffect, useMemo, useState } from 'react'
import { buildExplorerRows, buildSiteSummaries, buildSyncOverview, formatUpdatedAt, resolveSharePointFileUrl, summarizeCorpus, type CorpusDocument, type ProviderId, type UserRole, type SiteSummary } from './lib/deepvault'
import { useLiveCorpus } from './hooks/useLiveCorpus'
import { useBishopConversation } from './hooks/useBishopConversation'
import { CompactDateTime, CompactPathText, FileTypePill, Message, PathLabel, Pill, SectionHeading, SourceCard, StatCard } from './components/app-ui'

const NAV_ITEMS = [
  { id: 'explorer', label: 'Explorer', icon: ExplorerIcon },
  { id: 'bishop', label: 'Bishop', icon: BishopIcon },
  { id: 'sync', label: 'Sync status', icon: SyncIcon },
] as const
type ExplorerRow = CorpusDocument & { score: number; siteName: string }

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 4.75A1.75 1.75 0 0 1 5.75 3h8.5A1.75 1.75 0 0 1 16 4.75v10.5A1.75 1.75 0 0 1 14.25 17h-8.5A1.75 1.75 0 0 1 4 15.25z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 7.5h7M6.5 10h5.5M6.5 12.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BishopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 3.75c1.15 0 2.08.93 2.08 2.08 0 .7-.35 1.32-.88 1.7.88.67 1.44 1.73 1.44 2.92 0 1.05-.45 2-1.17 2.67l1.03 2.38h-5l1.03-2.38a3.78 3.78 0 0 1-1.17-2.67c0-1.19.56-2.25 1.44-2.92a2.06 2.06 0 0 1-.88-1.7c0-1.15.93-2.08 2.08-2.08Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 16.25h5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5.25 7.25A6.12 6.12 0 0 1 10 5.25c2.12 0 4.02 1.08 5.16 2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 5.75v2.9h-2.9M14.75 12.75A6.12 6.12 0 0 1 10 14.75c-2.12 0-4.02-1.08-5.16-2.72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 14.25v-2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
export default function App() {
  const { corpusBundle, liveState } = useLiveCorpus(import.meta.env.VITE_DEEPVAULT_DATA_MODE)
  const corpus = corpusBundle.corpus
  const [activeTab, setActiveTab] = useState<(typeof NAV_ITEMS)[number]['id']>('explorer')
  const [role, setRole] = useState<UserRole>(corpus.defaultUserRole)
  const [provider, setProvider] = useState<ProviderId>(corpus.providers[0].id)
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [selectedDocId, setSelectedDocId] = useState<string>(corpus.documents[0].id)
  const resolveFileHref = (siteId: string, path: string, webUrl?: string | null): string | null =>
    resolveSharePointFileUrl(corpus, siteId, path, webUrl)

  const siteSummaries = useMemo<SiteSummary[]>(() => buildSiteSummaries(corpus, role), [corpus, role])
  const scopedCorpus = useMemo(() => {
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
  }, [corpus, siteFilter])
  const scopedSiteSummaries = useMemo<SiteSummary[]>(() => buildSiteSummaries(scopedCorpus, role), [scopedCorpus, role])
  const scopedSyncOverview = useMemo(() => buildSyncOverview(scopedCorpus, role), [scopedCorpus, role])
  const scopedCorpusSummary = useMemo(() => summarizeCorpus(scopedCorpus, role), [scopedCorpus, role])
  const explorerRows = useMemo<ExplorerRow[]>(
    () => buildExplorerRows(scopedCorpus, search, { role }) as ExplorerRow[],
    [scopedCorpus, role, search],
  )
  const selectedExplorerDoc =
    explorerRows.find((document) => document.id === selectedDocId) || explorerRows[0] || null
  const {
    question,
    setQuestion,
    isAsking,
    messages,
    selectedMessage,
    handleAsk,
  } = useBishopConversation({
    corpus: scopedCorpus,
    role,
    provider,
    endpoint: import.meta.env.VITE_BISHOP_LLM_ENDPOINT,
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brandline">
          <span>Nexus</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Navigation</div>
          <nav className="nav-list">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${activeTab === item.id ? 'nav-item-active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <item.icon />
                </span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div />
          <div className="topbar-badges">
            <Pill tone={liveState.tone} title={liveState.detail}>
              {liveState.label}
            </Pill>
            <Pill tone="success">Synced</Pill>
            <Pill tone="neutral">{activeScopeLabel}</Pill>
            <Pill tone="neutral">{provider}</Pill>
            <Pill tone="accent">{role}</Pill>
          </div>
        </header>

        <section className="kpi-grid">
          <StatCard
            label="Sites in scope"
            value={scopedSyncOverview.siteSummaries.length}
            note="Site scope is shared across Explorer, Bishop, and Sync status."
          />
          <StatCard
            label="Visible docs"
            value={scopedSyncOverview.documentCount}
            note="Role-filtered corpus entries available in the current site scope."
          />
          <StatCard
            label="Last refresh"
            value={scopedSyncOverview.lastRun ? <CompactDateTime value={scopedSyncOverview.lastRun.finishedAt} /> : 'n/a'}
            note={scopedSyncOverview.refreshPolicy}
            valueClassName="stat-value-compact stat-value-datetime"
          />
          <StatCard
            label="Provider readiness"
            value={corpus.providers.filter((item) => item.ready).length}
            note="OpenAI and Gemini are both available in the local abstraction."
          />
        </section>

        {activeTab !== 'bishop' ? (
          <section className="panel panel-toolbar">
            <div className="toolbar">
              <div className="toolbar-search">
                <label htmlFor="search">Explorer search</label>
                <input
                  id="search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Budget, roadmap, policy, status..."
                />
              </div>
              <div className="toolbar-actions">
                <button type="button" className="secondary-button" onClick={() => setSearch('')}>
                  Clear
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'explorer' ? (
          <section className="content-grid">
            <article className="panel">
              <SectionHeading
                title="Explorer"
                subtitle="Browse the pilot corpus by site, search term, and source details."
              />
              <div className="document-list">
                {explorerRows.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    className={`document-row ${selectedDocId === document.id ? 'document-row-active' : ''}`}
                    onClick={() => {
                      setSelectedDocId(document.id)
                      setActiveTab('explorer')
                    }}
                  >
                    <div className="document-row-top">
                      <div className="document-row-title">
                        <strong>{document.title}</strong>
                        <FileTypePill value={document.kind} />
                      </div>
                      <Pill tone="neutral">{document.score}</Pill>
                    </div>
                    <div className="document-row-meta">
                      <span>{document.siteName}</span>
                      <span>{formatUpdatedAt(document.updatedAt)}</span>
                    </div>
                    <p>{document.summary}</p>
                  </button>
                ))}
                {explorerRows.length === 0 ? (
                  <div className="empty-state">No permitted sources matched this search.</div>
                ) : null}
              </div>
            </article>

            <article className="panel">
              {selectedExplorerDoc ? (
                <>
                  <SectionHeading
                    title={selectedExplorerDoc.title}
                    subtitle={
                      <PathLabel
                        value={selectedExplorerDoc.path}
                        href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                      />
                    }
                  />
                  <div className="detail-stack">
                    <div className="detail-row">
                      <span>Site</span>
                      <strong>{selectedExplorerDoc.siteName || selectedExplorerDoc.siteId}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Owner</span>
                      <strong>{selectedExplorerDoc.author}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Updated</span>
                      <strong>{formatUpdatedAt(selectedExplorerDoc.updatedAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Access</span>
                      <strong>{selectedExplorerDoc.access.join(', ')}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Tags</span>
                      <strong>{selectedExplorerDoc.tags.join(', ')}</strong>
                    </div>
                  </div>
                  <div className="document-content">
                    <h3>Answer-ready summary</h3>
                    <p>
                      <CompactPathText
                        value={selectedExplorerDoc.directAnswer || selectedExplorerDoc.summary}
                        href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                      />
                    </p>
                    <h3>Source excerpt</h3>
                    <p>
                      <CompactPathText
                        value={selectedExplorerDoc.content}
                        href={resolveFileHref(selectedExplorerDoc.siteId, selectedExplorerDoc.path, selectedExplorerDoc.webUrl)}
                      />
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <SectionHeading
                    title="No visible document"
                    subtitle="Choose a site with matching results to inspect its details."
                  />
                  <div className="empty-state">No permitted sources match the current site filter.</div>
                </>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'bishop' ? (
          <section className="content-grid bishop-grid">
            <article className="panel chat-panel">
              <SectionHeading
                title="Bishop"
                subtitle="Grounded answers come from the same local retrieval logic used by the explorer."
              />
              <div className="message-list">
                {messages.map((message) => (
                  <Message key={message.id} message={message} resolveFileHref={resolveFileHref} />
                ))}
              </div>
              <form className="chat-form" onSubmit={handleAsk}>
                <label htmlFor="question">Ask a question</label>
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="What is the deadline for the compliance audit?"
                  disabled={isAsking}
                />
                <div className="chat-form-actions">
                  <div className="chat-note">
                    Current provider: {provider}. Current role: {role}. No fallback mixing during evaluation.
                  </div>
                  <button type="submit" className="primary-button" disabled={isAsking}>
                    {isAsking ? 'Thinking...' : 'Ask bishop'}
                  </button>
                </div>
              </form>
            </article>

            <aside className="panel">
              <SectionHeading title="Answer trace" subtitle="Provenance and retrieval diagnostics for the last turn." />
              <div className="detail-stack">
                <div className="detail-row">
                  <span>Status</span>
                  <strong>{selectedMessage.status || 'ready'}</strong>
                </div>
                <div className="detail-row">
                  <span>Provider</span>
                  <strong>{selectedMessage.provider || provider}</strong>
                </div>
                <div className="detail-row">
                  <span>Orchestration</span>
                  <strong>{selectedMessage.orchestrationMode || 'local'}</strong>
                </div>
                <div className="detail-row">
                  <span>Chunk count</span>
                  <strong>{selectedMessage.chunkCount || 0}</strong>
                </div>
                <div className="detail-row">
                  <span>Token count</span>
                  <strong>{selectedMessage.tokenCount || 0}</strong>
                </div>
                <div className="detail-row">
                  <span>Latency</span>
                  <strong>{selectedMessage.latencyMs || 0} ms</strong>
                </div>
              </div>
              <div className="source-list">
                {(selectedMessage.sources || []).map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    href={resolveFileHref(source.siteId, source.path, source.webUrl)}
                  />
                ))}
                {!selectedMessage.sources?.length ? (
                  <div className="empty-state">No grounded sources yet. Ask Bishop a question to populate this trace.</div>
                ) : null}
              </div>
            </aside>
          </section>
        ) : null}

        {activeTab === 'sync' ? (
          <section className="content-grid sync-grid">
            <article className="panel">
              <SectionHeading title="Sync status" subtitle="Refresh state, ingestion coverage, and operational signals." />
              <div className="runtime-panel">
                <div className="runtime-panel-head">
                  <div>
                    <div className="runtime-panel-title">Runtime</div>
                    <p>Execution context shared by Explorer, Bishop, and Sync status.</p>
                  </div>
                  <Pill tone="accent">{activeScopeLabel}</Pill>
                </div>
                <div className="runtime-stack runtime-stack-grid">
                  <div className="runtime-row">
                    <span>Role</span>
                    <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                      <option value="analyst">analyst</option>
                      <option value="admin">admin</option>
                      <option value="guest">guest</option>
                    </select>
                  </div>
                  <div className="runtime-row">
                    <span>Provider</span>
                    <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
                      {corpus.providers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="runtime-row runtime-row-scope">
                    <span>Site scope</span>
                    <div className="site-list">
                      <button
                        type="button"
                        className={`site-chip ${siteFilter === 'all' ? 'site-chip-active' : ''}`}
                        onClick={() => setSiteFilter('all')}
                      >
                        All sites
                      </button>
                      {siteSummaries.map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          className={`site-chip ${siteFilter === site.id ? 'site-chip-active' : ''}`}
                          onClick={() => setSiteFilter(site.id)}
                        >
                          {site.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="kpi-grid compact">
                <StatCard
                  label="Synced sites"
                  value={scopedSyncOverview.syncedSites}
                  note="Sites currently in a synced state within the active scope."
                />
                <StatCard
                  label="Restricted sites"
                  value={scopedSyncOverview.restrictedSites}
                  note="Sites visible only to privileged roles within the active scope."
                />
                <StatCard
                  label="Visible sources"
                  value={scopedCorpusSummary.visibleSources}
                  note="Sources accessible to the selected role and scope."
                />
                <StatCard
                  label="Denied sources"
                  value={scopedCorpusSummary.deniedSources}
                  note="Sources excluded by permission-aware retrieval in scope."
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Status</th>
                      <th>Documents</th>
                      <th>Chunks</th>
                      <th>Last refresh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedSiteSummaries.map((site) => (
                      <tr key={site.id}>
                        <td>
                          <strong>{site.name}</strong>
                          <div className="table-subtitle">{site.owner}</div>
                        </td>
                        <td>{site.lastRefreshStatus}</td>
                        <td>{site.permittedDocumentCount}</td>
                        <td>{site.chunkCount}</td>
                        <td>{site.lastRefresh ? formatUpdatedAt(site.lastRefresh) : 'n/a'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <aside className="panel">
              <SectionHeading title="Recent sync runs" subtitle="Hover each run for the full note." />
              <div className="sync-list">
                {scopedCorpus.syncRuns.map((run) => (
                  <article key={run.id} className="sync-card" title={run.notes}>
                    <div className="source-card-top">
                      <strong>{run.status}</strong>
                      <Pill tone={run.status === 'synced' ? 'success' : 'neutral'}>{run.scope}</Pill>
                    </div>
                    <div className="source-meta">
                      <span>{formatUpdatedAt(run.finishedAt)}</span>
                      <span>{run.documentsSynced} docs</span>
                      <span>{run.chunksWritten} chunks</span>
                    </div>
                    <p>{run.notes}</p>
                  </article>
                ))}
              </div>
              <div className="checklist">
                <h3>Evaluation prep</h3>
                <ul>
                  <li>Run <code>npm run ingest</code> to write the local sync snapshot.</li>
                  <li>Run <code>npm run evaluate</code> to generate the V1 baseline report.</li>
                  <li>Keep OpenAI as the baseline provider when comparing retrieval quality.</li>
                </ul>
              </div>
            </aside>
          </section>
        ) : null}
      </main>
    </div>
  )
}
