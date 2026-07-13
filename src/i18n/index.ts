import en from './en.json'

function lookup(key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null || !(segment in current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, en)
  return typeof value === 'string' ? value : undefined
}

export function t(key: string, values: Record<string, string | number> = {}): string {
  const template = lookup(key)
  if (template === undefined) return import.meta.env.DEV ? `⟦${key}⟧` : key
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}
