import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const content = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
  const equalsIndex = content.indexOf('=')
  if (equalsIndex <= 0) {
    return null
  }

  const key = content.slice(0, equalsIndex).trim()
  let value = content.slice(equalsIndex + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return key ? [key, value] : null
}

async function loadEnvFile(path: string): Promise<void> {
  try {
    const content = await readFile(path, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line)
      if (parsed && (process.env[parsed[0]] === undefined || process.env[parsed[0]] === '')) {
        process.env[parsed[0]] = parsed[1]
      }
    }
  } catch {
    // Ignore missing local env files.
  }
}

export async function loadProjectEnv(): Promise<void> {
  await loadEnvFile(resolve('.env'))
  await loadEnvFile(resolve('.env.local'))
}
