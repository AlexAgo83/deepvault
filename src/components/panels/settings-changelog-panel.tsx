import { useEffect, useState } from 'react'
import { Pill, SectionHeading } from '../app-ui'
import { getChangelogEntries, parseChangelogMarkdown, type ChangelogEntry } from '../../data/changelogs'

function useIntersectionLoad(root: HTMLDivElement | null, target: HTMLElement | null, onVisible: () => void) {
  useEffect(() => {
    if (!target || !root) return
    if (typeof IntersectionObserver === 'undefined') {
      onVisible()
      return
    }

    let seen = false
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || seen) return
        seen = true
        onVisible()
      },
      {
        root,
        rootMargin: '120px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [onVisible, root, target])
}

function ChangelogCard({ entry, scrollRoot }: { entry: ChangelogEntry; scrollRoot: HTMLDivElement | null }) {
  const [cardElement, setCardElement] = useState<HTMLArticleElement | null>(null)
  const [rawMarkdown, setRawMarkdown] = useState<string | null>(null)

  useIntersectionLoad(scrollRoot, cardElement, () => {
    if (rawMarkdown) return
    void entry.load().then((markdown) => {
      setRawMarkdown(markdown)
    })
  })

  const parsed = rawMarkdown ? parseChangelogMarkdown(rawMarkdown) : null

  return (
    <article ref={setCardElement} className="changelog-card">
      <div className="changelog-card-head">
        <div>
          <strong>{entry.title}</strong>
          <div className="changelog-card-subtitle">{entry.fileName}</div>
        </div>
        <Pill tone="neutral">{entry.version}</Pill>
      </div>

      {parsed ? (
        <div className="changelog-card-body">
          <div className="changelog-card-meta">
            <span>{parsed.releaseDate || 'Release date unavailable'}</span>
          </div>
          {parsed.intro ? <p>{parsed.intro}</p> : null}
          {parsed.highlights.length ? (
            <ul className="changelog-card-highlights">
              {parsed.highlights.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="changelog-card-loading">
          <span>Scroll to load this release note.</span>
        </div>
      )}
    </article>
  )
}

export function SettingsChangelogPanel() {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const entries = getChangelogEntries()

  return (
    <aside id="panel-right" className="panel panel-right settings-changelog-panel" aria-label="Release changelogs">
      <SectionHeading
        title="Changelogs"
        subtitleTooltip="Release notes load only when the cards become visible in this panel."
      />

      <div className="settings-changelog-scroll" ref={setScrollRoot}>
        {entries.map((entry) => (
          <ChangelogCard key={entry.fileName} entry={entry} scrollRoot={scrollRoot} />
        ))}
      </div>
    </aside>
  )
}
