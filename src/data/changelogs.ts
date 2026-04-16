export interface ChangelogEntry {
  version: string
  title: string
  fileName: string
  load: () => Promise<string>
}

export interface ParsedChangelog {
  releaseDate: string | null
  intro: string
  highlights: string[]
}

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.3.0',
    title: 'DeepVault Nexus 1.3.0',
    fileName: 'CHANGELOGS_1_3_0.md',
    load: () => import('../../changelogs/CHANGELOGS_1_3_0.md?raw').then((module) => module.default as string),
  },
  {
    version: '1.2.0',
    title: 'DeepVault Nexus 1.2.0',
    fileName: 'CHANGELOGS_1_2_0.md',
    load: () => import('../../changelogs/CHANGELOGS_1_2_0.md?raw').then((module) => module.default as string),
  },
  {
    version: '1.1.0',
    title: 'DeepVault Nexus 1.1.0',
    fileName: 'CHANGELOGS_1_1_0.md',
    load: () => import('../../changelogs/CHANGELOGS_1_1_0.md?raw').then((module) => module.default as string),
  },
  {
    version: '1.0.0',
    title: 'DeepVault Nexus 1.0.0',
    fileName: 'CHANGELOGS_1_0_0.md',
    load: () => import('../../changelogs/CHANGELOGS_1_0_0.md?raw').then((module) => module.default as string),
  },
]

export function getChangelogEntries(): ChangelogEntry[] {
  return [...CHANGELOG_ENTRIES]
}

function extractFirstParagraph(lines: string[], startIndex: number): string {
  const paragraph: string[] = []
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) {
      if (paragraph.length > 0) break
      continue
    }
    if (line.startsWith('#')) break
    paragraph.push(line)
  }
  return paragraph.join(' ').trim()
}

function extractHighlights(lines: string[]): string[] {
  const headlineIndex = lines.findIndex((line) => line.trim() === '### At a glance')
  if (headlineIndex < 0) {
    return []
  }

  const highlights: string[] = []
  for (let index = headlineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.startsWith('### ')) break
    if (line.startsWith('- ')) {
      highlights.push(line.slice(2).trim())
    }
  }
  return highlights
}

export function parseChangelogMarkdown(markdown: string): ParsedChangelog {
  const lines = markdown.split(/\r?\n/)
  const releaseDateLine = lines.find((line) => line.startsWith('Release date:'))
  const titleIndex = lines.findIndex((line) => line.startsWith('## '))
  const intro = titleIndex >= 0 ? extractFirstParagraph(lines, titleIndex + 1) : ''

  return {
    releaseDate: releaseDateLine ? releaseDateLine.replace(/^Release date:\s*/, '').trim() || null : null,
    intro,
    highlights: extractHighlights(lines),
  }
}
