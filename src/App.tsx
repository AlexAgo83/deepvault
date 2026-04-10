import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { loadCorpus } from './data/corpus'
import {
  answerQuestion,
  buildExplorerRows,
  buildSiteSummaries,
  buildSyncOverview,
  formatUpdatedAt,
  summarizeCorpus,
  type ChatMessage,
  type CorpusDocument,
  type ProviderId,
  type UserRole,
  type SiteSummary,
} from './lib/deepvault'
import { describeCorpusMode, normalizeCorpusMode } from './lib/corpus-mode'

const NAV_ITEMS = [
  { id: 'explorer', label: 'DeepVault - Navy' },
  { id: 'bishop', label: 'DeepVault - Bishop' },
  { id: 'sync', label: 'Sync status' },
] as const

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

function StatCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  )
}

type ExplorerRow = CorpusDocument & { score: number; siteName: string }

function SourceCard({ source }: { source: ChatMessage['sources'][number] }) {
  return (
    <article className="source-card">
      <div className="source-card-top">
        <strong>{source.title}</strong>
        <Pill tone="accent">{String(source.score)}</Pill>
      </div>
      <div className="source-meta">
        <span>{source.siteName}</span>
        <span>{source.author}</span>
        <span>{formatUpdatedAt(source.updatedAt)}</span>
      </div>
      <p>{source.snippet}</p>
      <div className="source-path">{source.path}</div>
    </article>
  )
}

function Message({ message }: { message: ChatMessage }) {
  return (
    <article className={`message message-${message.role}`}>
      <div className="message-meta">
        <strong>{message.role === 'assistant' ? 'Bishop' : 'You'}</strong>
        <span>{message.status ? message.status : ''}</span>
      </div>
      <p>{message.text}</p>
      {message.sources?.length ? (
        <div className="message-sources">
          {message.sources.map((source) => (
            <div key={source.id} className="message-source">
              <strong>{source.title}</strong>
              <span>{source.path}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default function App() {
  const corpusBundle = loadCorpus(normalizeCorpusMode(import.meta.env.VITE_DEEPVAULT_DATA_MODE))
  const corpus = corpusBundle.corpus
  const corpusMode = corpusBundle.mode
  const [activeTab, setActiveTab] = useState<(typeof NAV_ITEMS)[number]['id']>('explorer')
  const [role, setRole] = useState<UserRole>(corpus.defaultUserRole)
  const [provider, setProvider] = useState<ProviderId>(corpus.providers[0].id)
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [selectedDocId, setSelectedDocId] = useState<string>(corpus.documents[0].id)
  const [question, setQuestion] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'seed',
      role: 'assistant',
      text: 'Ask a question about the pilot corpus, or switch to the explorer to inspect a source directly.',
      status: 'ready',
      sources: [],
    },
  ])

  const siteSummaries = useMemo<SiteSummary[]>(() => buildSiteSummaries(corpus, role), [corpus, role])
  const syncOverview = useMemo(() => buildSyncOverview(corpus, role), [corpus, role])
  const explorerRows = useMemo<ExplorerRow[]>(
    () => buildExplorerRows(corpus, search, { role, siteId: siteFilter }) as ExplorerRow[],
    [corpus, role, search, siteFilter],
  )

  const selectedDoc =
    explorerRows.find((document) => document.id === selectedDocId) ||
    explorerRows[0] ||
    corpus.documents.find((document) => document.id === selectedDocId) ||
    corpus.documents[0]

  const handleAsk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) {
      return
    }

    const result = answerQuestion(corpus, trimmed, { role, provider, limit: 3 })
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text: trimmed, status: '', sources: [] },
      {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: result.answer,
        status: result.status,
        sources: result.sources,
        provider: result.provider,
        chunkCount: result.chunkCount,
        tokenCount: result.tokenCount,
        latencyMs: result.latencyMs,
      },
    ])
    setQuestion('')
    setActiveTab('bishop')
  }

  const selectedMessage = messages[messages.length - 1]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div>
            <div className="brand-mark">DeepVault</div>
            <h1>Local validation workspace</h1>
            <p>Explorer, grounded chat, and sync status in one local surface.</p>
          </div>
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
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Pilot sites</div>
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

        <div className="sidebar-section">
          <div className="sidebar-label">Runtime</div>
          <div className="runtime-stack">
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
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">State</div>
          <div className="sidebar-metric">
            <strong>{syncOverview.documentCount}</strong>
            <span>visible documents</span>
          </div>
          <div className="sidebar-metric">
            <strong>{syncOverview.chunkCount}</strong>
            <span>estimated chunks</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="topbar-kicker">V1 local build</div>
            <h1>DeepVault - Navy, Bishop, and sync</h1>
            <p>
              Grounded local surfaces for SharePoint exploration, permission-aware retrieval, and
              operational visibility.
            </p>
          </div>
          <div className="topbar-badges">
            <Pill tone={corpusMode === 'live' ? 'success' : 'neutral'}>{describeCorpusMode(corpusMode)}</Pill>
            <Pill tone="success">Synced</Pill>
            <Pill tone="neutral">{provider}</Pill>
            <Pill tone="accent">{role}</Pill>
          </div>
        </header>

        <section className="kpi-grid">
          <StatCard
            label="Pilot sites"
            value={siteSummaries.length}
            note="Two configured pilot sites plus one restricted site for boundary checks."
          />
          <StatCard
            label="Visible docs"
            value={syncOverview.documentCount}
            note="Role-filtered corpus entries available to this user."
          />
          <StatCard
            label="Last refresh"
            value={syncOverview.lastRun ? formatUpdatedAt(syncOverview.lastRun.finishedAt) : 'n/a'}
            note={syncOverview.refreshPolicy}
          />
          <StatCard
            label="Provider readiness"
            value={corpus.providers.filter((item) => item.ready).length}
            note="OpenAI and Gemini are both available in the local abstraction."
          />
        </section>

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
              <button type="button" className="primary-button" onClick={() => setActiveTab('bishop')}>
                Ask Bishop
              </button>
            </div>
          </div>
        </section>

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
                      <strong>{document.title}</strong>
                      <Pill tone="neutral">{document.score}</Pill>
                    </div>
                    <div className="document-row-meta">
                      <span>{document.siteName}</span>
                      <span>{document.kind}</span>
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
              <SectionHeading title={selectedDoc.title} subtitle={selectedDoc.path} />
              <div className="detail-stack">
                <div className="detail-row">
                  <span>Site</span>
                  <strong>{selectedDoc.siteName || selectedDoc.siteId}</strong>
                </div>
                <div className="detail-row">
                  <span>Owner</span>
                  <strong>{selectedDoc.author}</strong>
                </div>
                <div className="detail-row">
                  <span>Updated</span>
                  <strong>{formatUpdatedAt(selectedDoc.updatedAt)}</strong>
                </div>
                <div className="detail-row">
                  <span>Access</span>
                  <strong>{selectedDoc.access.join(', ')}</strong>
                </div>
                <div className="detail-row">
                  <span>Tags</span>
                  <strong>{selectedDoc.tags.join(', ')}</strong>
                </div>
              </div>
              <div className="document-content">
                <h3>Answer-ready summary</h3>
                <p>{selectedDoc.directAnswer || selectedDoc.summary}</p>
                <h3>Source excerpt</h3>
                <p>{selectedDoc.content}</p>
              </div>
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
                  <Message key={message.id} message={message} />
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
                />
                <div className="chat-form-actions">
                  <div className="chat-note">
                    Current provider: {provider}. Current role: {role}. No fallback mixing during evaluation.
                  </div>
                  <button type="submit" className="primary-button">
                    Send
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
                  <SourceCard key={source.id} source={source} />
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
              <div className="kpi-grid compact">
                <StatCard
                  label="Synced sites"
                  value={syncOverview.syncedSites}
                  note="Pilot sites currently in a synced state."
                />
                <StatCard
                  label="Restricted sites"
                  value={syncOverview.restrictedSites}
                  note="Sites visible only to privileged roles."
                />
                <StatCard
                  label="Visible sources"
                  value={summarizeCorpus(corpus, role).visibleSources}
                  note="Sources accessible to the selected role."
                />
                <StatCard
                  label="Denied sources"
                  value={summarizeCorpus(corpus, role).deniedSources}
                  note="Sources excluded by permission-aware retrieval."
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
                    {siteSummaries.map((site) => (
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
              <SectionHeading title="Recent sync runs" subtitle="The local runtime keeps refreshes simple and inspectable." />
              <div className="sync-list">
                {corpus.syncRuns.map((run) => (
                  <article key={run.id} className="sync-card">
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
