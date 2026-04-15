import { useEffect, useState, type ReactNode } from 'react'
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

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0

  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > cursor) {
      nodes.push(text.slice(cursor, start))
    }

    if (token.startsWith('**')) {
      nodes.push(<strong key={`${start}-strong`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`${start}-code`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={`${start}-em`}>{token.slice(1, -1)}</em>)
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a key={`${start}-link`} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }

    cursor = start + token.length
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/)
  const nodes: ReactNode[] = []
  let index = 0
  let paragraphIndex = 0
  let listIndex = 0
  let quoteIndex = 0
  let codeIndex = 0
  let sectionIndex = 0
  let currentSection: { summary: ReactNode[]; body: ReactNode[]; key: string } | null = null

  const flushSection = () => {
    if (!currentSection) return
    nodes.push(
      <details key={currentSection.key} className="changelog-markdown-section">
        <summary className="changelog-markdown-section-summary">{currentSection.summary}</summary>
        <div className="changelog-markdown-section-body">{currentSection.body}</div>
      </details>,
    )
    currentSection = null
  }

  const pushNode = (node: ReactNode) => {
    if (currentSection) {
      currentSection.body.push(node)
      return
    }
    nodes.push(node)
  }

  while (index < lines.length) {
    const trimmed = lines[index].trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (
      nodes.length === 0 &&
      (trimmed.startsWith('Release date:') ||
        /^#+\s*CHANGELOGS_[0-9_]+$/i.test(trimmed) ||
        /^#+\s*DeepVault Nexus \d+\.\d+\.\d+$/i.test(trimmed))
    ) {
      index += 1
      continue
    }

    if (nodes.length === 0 && /^DeepVault Nexus \d+\.\d+\.\d+$/i.test(trimmed)) {
      index += 1
      continue
    }

    const codeFenceMatch = trimmed.match(/^```(\w+)?$/)
    if (codeFenceMatch) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      pushNode(
        <pre key={`code-${codeIndex += 1}`} className="changelog-markdown-code">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (trimmed.startsWith('#')) {
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const headingText = headingMatch[2].trim()
        if (level === 1 && /^CHANGELOGS_[0-9_]+$/i.test(headingText)) {
          index += 1
          continue
        }
        if (level === 3) {
          flushSection()
          currentSection = {
            key: `section-${sectionIndex += 1}`,
            summary: renderInlineMarkdown(headingText),
            body: [],
          }
          index += 1
          continue
        }
        flushSection()
        const content = renderInlineMarkdown(headingText)
        if (level === 1) {
          nodes.push(
            <h1 key={`h-${index}`} className="changelog-markdown-h1">
              {content}
            </h1>,
          )
        } else if (level === 2) {
          nodes.push(
            <h2 key={`h-${index}`} className="changelog-markdown-h2">
              {content}
            </h2>,
          )
        } else if (level === 3) {
          nodes.push(
            <h3 key={`h-${index}`} className="changelog-markdown-h3">
              {content}
            </h3>,
          )
        } else {
          nodes.push(
            <h4 key={`h-${index}`} className="changelog-markdown-h4">
              {content}
            </h4>,
          )
        }
      }
      index += 1
      continue
    }

    if (trimmed.startsWith('- ')) {
      const items: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2).trim())
        index += 1
      }
      pushNode(
        <ul key={`ul-${listIndex += 1}`} className="changelog-markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`${listIndex}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      pushNode(
        <blockquote key={`quote-${quoteIndex += 1}`} className="changelog-markdown-quote">
          {quoteLines.join(' ')}
        </blockquote>,
      )
      continue
    }

    const paragraphLines: string[] = [trimmed]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('#') &&
      !lines[index].trim().startsWith('- ') &&
      !lines[index].trim().startsWith('>') &&
      !lines[index].trim().startsWith('```')
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    pushNode(
      <p key={`p-${paragraphIndex += 1}`}>{renderInlineMarkdown(paragraphLines.join(' '))}</p>,
    )
  }

  flushSection()
  return nodes
}

function stripChangelogHeader(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => /^##\s+DeepVault Nexus \d+\.\d+\.\d+$/i.test(line.trim()))
  if (startIndex < 0) {
    return markdown
  }

  return lines.slice(startIndex + 1).join('\n').replace(/^\s+/, '')
}

function ChangelogCard({ entry, scrollRoot }: { entry: ChangelogEntry; scrollRoot: HTMLDivElement | null }) {
  const [cardElement, setCardElement] = useState<HTMLElement | null>(null)
  const [rawMarkdown, setRawMarkdown] = useState<string | null>(null)
  const parsed = rawMarkdown ? parseChangelogMarkdown(rawMarkdown) : null

  useIntersectionLoad(scrollRoot, cardElement, () => {
    if (rawMarkdown) return
    void entry.load().then((markdown) => {
      setRawMarkdown(markdown)
    })
  })

  return (
    <article ref={setCardElement} className="changelog-card">
      <div className="changelog-card-head">
        <span className="changelog-card-date" title="Release date">
          {parsed?.releaseDate ?? 'Release date'}
        </span>
        <Pill tone="neutral">{entry.version}</Pill>
      </div>

      {rawMarkdown ? (
        <div className="changelog-card-body">
          <div className="changelog-markdown">{renderMarkdown(stripChangelogHeader(rawMarkdown))}</div>
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
