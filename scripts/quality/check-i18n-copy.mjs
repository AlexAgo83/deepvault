import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'

const root = new URL('../../', import.meta.url)
const panelRoot = new URL('src/components/panels/', root)
const visibleAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title'])
const dataTokens = new Set([
  'SVG',
  'PNG',
  'analyst',
  'admin',
  'guest',
  'mock',
  'live',
  'local',
  'remote',
  'read_only',
  'block',
  'none',
  'ms',
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'https://tenant.sharepoint.com/sites/A,https://...',
  'https://worker.example.com',
  'sk-...',
  'AIza...',
  'sk-ant-...',
])

function isProductCopy(value) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return /[A-Za-z]{2}/.test(normalized) && !dataTokens.has(normalized)
}

function expressionCopy(expression) {
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return isProductCopy(expression.text) ? expression.text : null
  }

  if (ts.isTemplateExpression(expression)) {
    const text = [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)].join(' ')
    return isProductCopy(text) ? text : null
  }

  if (ts.isConditionalExpression(expression)) {
    return expressionCopy(expression.whenTrue) ?? expressionCopy(expression.whenFalse)
  }

  return null
}

export function findHardcodedCopy(source, filename = 'fixture.tsx') {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []

  function visit(node) {
    if (ts.isJsxText(node) && isProductCopy(node.text)) {
      findings.push({ line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1, text: node.text.trim() })
    }

    if (
      ts.isJsxAttribute(node)
      && visibleAttributes.has(node.name.getText(sourceFile))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && isProductCopy(node.initializer.text)
    ) {
      findings.push({ line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1, text: node.initializer.text })
    }

    if (ts.isJsxExpression(node) && ts.isJsxElement(node.parent) && node.expression) {
      const text = expressionCopy(node.expression)
      if (text) {
        findings.push({ line: sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1, text })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

const fixtureFindings = findHardcodedCopy('<button aria-label="Hardcoded label">Hardcoded copy</button>')
if (fixtureFindings.length !== 2) {
  throw new Error('The i18n copy guard no longer detects its failing fixture.')
}

const files = readdirSync(panelRoot, { recursive: true })
  .map(String)
  .filter((path) => extname(path) === '.tsx')
const findings = files.flatMap((path) => {
  const filename = join(panelRoot.pathname, path)
  return findHardcodedCopy(readFileSync(filename, 'utf8'), filename).map((finding) => ({
    ...finding,
    path: relative(root.pathname, filename),
  }))
})

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}: ${finding.text}`)
  }
  process.exitCode = 1
} else {
  console.log(`i18n copy guard: OK (${files.length} panel files)`)
}
