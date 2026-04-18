import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const repoRoot = process.cwd()

const bannedFiles = [
  'src/lib/bishop.ts',
  'src/data/corpus.ts',
]

const bannedRuntimePatterns = [
  {
    pattern: /from ['"][^'"]*\/lib\/bishop-orchestration(?:\.ts)?['"]/,
    message: 'Browser runtime must not import worker-side bishop orchestration directly.',
  },
  {
    pattern: /from ['"][^'"]*\/lib\/scoring(?:\.ts)?['"]/,
    message: 'Browser runtime must not import legacy scoring helpers directly.',
  },
  {
    pattern: /from ['"][^'"]*\/data\/corpus(?:\.ts)?['"]/,
    message: 'Browser runtime must not import the removed bundled corpus path.',
  },
  {
    pattern: /\/api\/worker\//,
    message: 'Legacy /api/worker runtime paths must stay removed after the worker migration.',
  },
]

function collectRuntimeFiles(rootRelativePath) {
  const absolutePath = resolve(repoRoot, rootRelativePath)
  const entries = readdirSync(absolutePath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = join(rootRelativePath, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectRuntimeFiles(relativePath))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.d.ts')) {
      continue
    }
    files.push(relativePath)
  }

  return files
}

const runtimeFiles = collectRuntimeFiles('src')

const violations = []

for (const relativePath of bannedFiles) {
  if (existsSync(resolve(repoRoot, relativePath))) {
    violations.push(`${relativePath}: legacy file should stay removed`)
  }
}

for (const relativePath of runtimeFiles) {
  const content = readFileSync(resolve(repoRoot, relativePath), 'utf8')
  for (const rule of bannedRuntimePatterns) {
    if (rule.pattern.test(content)) {
      violations.push(`${relativePath}: ${rule.message}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Anti-zombie migration guard failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`Anti-zombie migration guard passed (${runtimeFiles.length} runtime files checked).`)
