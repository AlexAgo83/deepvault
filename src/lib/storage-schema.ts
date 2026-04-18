type ValidationOptions = {
  storageKey: string
  storageName?: 'localStorage' | 'sessionStorage'
}

function buildStorageWarningPrefix({ storageKey, storageName = 'localStorage' }: ValidationOptions): string {
  return `[storage] Invalid ${storageName} value for "${storageKey}"`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function warnInvalidStoredValue(
  options: ValidationOptions,
  reason: string,
  details?: unknown,
): void {
  if (details === undefined) {
    console.warn(`${buildStorageWarningPrefix(options)}: ${reason}`)
    return
  }

  console.warn(`${buildStorageWarningPrefix(options)}: ${reason}`, details)
}

export function parseStoredJsonOrNull<T>(
  raw: string | null,
  options: ValidationOptions & {
    validate: (_value: unknown) => T | null
  },
): T | null {
  if (!raw) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    warnInvalidStoredValue(options, 'JSON parsing failed; falling back to an empty state.', error)
    return null
  }

  const validated = options.validate(parsed)
  if (validated === null) {
    warnInvalidStoredValue(options, 'Schema validation failed; falling back to an empty state.', parsed)
  }

  return validated
}
