export type AIUsageKind = 'provider' | 'partial' | 'local'

export interface AIUsageEvent {
  id: string
  source?: 'bishop' | 'analyze'
  sourceEventId?: string
  provider: string
  model?: string
  status: string
  usageKind: AIUsageKind
  timestamp: string
  inputTokenCount?: number
  outputTokenCount?: number
  totalTokenCount: number
}

export interface AIUsageSummary {
  events: AIUsageEvent[]
  providerEvents: AIUsageEvent[]
  todayInput: number
  todayOutput: number
  todayTotal: number
  answeredCount: number
  providerBreakdown: Array<{ provider: string; total: number; input: number; output: number; count: number }>
  daily: Array<{ day: string; input: number; output: number; total: number; count: number }>
  hourly: Array<{ hour: number; input: number; output: number; total: number; count: number }>
}

export const AI_USAGE_STORAGE_KEY = 'deepvault_ai_usage_events'
const MAX_EVENTS = 400

function readEvents(): AIUsageEvent[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(AI_USAGE_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (event): event is AIUsageEvent =>
        typeof event === 'object' &&
        event !== null &&
        typeof (event as AIUsageEvent).id === 'string' &&
        typeof (event as AIUsageEvent).provider === 'string' &&
        typeof (event as AIUsageEvent).status === 'string' &&
        typeof (event as AIUsageEvent).timestamp === 'string' &&
        typeof (event as AIUsageEvent).totalTokenCount === 'number' &&
        (((event as AIUsageEvent).source ?? 'bishop') === 'bishop' || (event as AIUsageEvent).source === 'analyze') &&
        ((event as AIUsageEvent).usageKind === 'provider' ||
          (event as AIUsageEvent).usageKind === 'partial' ||
          (event as AIUsageEvent).usageKind === 'local'),
    )
  } catch {
    return []
  }
}

function persistEvents(events: AIUsageEvent[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AI_USAGE_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS), null, 2))
}

export function listAIUsageEvents(): AIUsageEvent[] {
  return readEvents().sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
}

export function appendAIUsageEvent(event: Omit<AIUsageEvent, 'id'>): AIUsageEvent[] {
  const currentEvents = readEvents()
  if (event.sourceEventId) {
    const existingIndex = currentEvents.findIndex((item) => item.sourceEventId === event.sourceEventId)
    if (existingIndex !== -1) {
      const existing = currentEvents[existingIndex]
      const nextEvent: AIUsageEvent = {
        ...existing,
        ...event,
        id: existing.id,
      }
      const nextEvents = currentEvents.map((item, index) => (index === existingIndex ? nextEvent : item)).slice(-MAX_EVENTS)
      persistEvents(nextEvents)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('deepvault-ai-usage-updated'))
      }
      return nextEvents
    }
  }

  const nextEvent: AIUsageEvent = {
    ...event,
    id: `${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
  }
  const nextEvents = [...currentEvents, nextEvent].slice(-MAX_EVENTS)
  persistEvents(nextEvents)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('deepvault-ai-usage-updated'))
  }
  return nextEvents
}

export function summarizeAIUsageEvents(
  events: AIUsageEvent[],
  options: { now?: Date; historyDays?: number } = {},
): AIUsageSummary {
  const now = options.now || new Date()
  const historyDays = Math.max(1, options.historyDays || 7)
  const historyStart = new Date(now)
  historyStart.setHours(0, 0, 0, 0)
  historyStart.setDate(historyStart.getDate() - (historyDays - 1))

  const recentEvents = events.filter((event) => new Date(event.timestamp).getTime() >= historyStart.getTime())
  const providerEvents = recentEvents.filter((event) => event.usageKind === 'provider' || event.usageKind === 'partial')
  const todayKey = now.toLocaleDateString('en-CA')
  const dayMap = new Map<string, { input: number; output: number; total: number; count: number }>()
  const hourMap = new Map<number, { input: number; output: number; total: number; count: number }>()
  const providerMap = new Map<string, { provider: string; total: number; input: number; output: number; count: number }>()

  for (let index = 0; index < historyDays; index += 1) {
    const day = new Date(historyStart)
    day.setDate(historyStart.getDate() + index)
    dayMap.set(day.toLocaleDateString('en-CA'), { input: 0, output: 0, total: 0, count: 0 })
  }

  for (let hour = 0; hour < 24; hour += 1) {
    hourMap.set(hour, { input: 0, output: 0, total: 0, count: 0 })
  }

  for (const event of providerEvents) {
    const date = new Date(event.timestamp)
    const dayKey = date.toLocaleDateString('en-CA')
    const input = event.inputTokenCount || 0
    const output = event.outputTokenCount || 0
    const total = event.totalTokenCount || input + output
    const dayBucket = dayMap.get(dayKey)
    if (dayBucket) {
      dayBucket.input += input
      dayBucket.output += output
      dayBucket.total += total
      dayBucket.count += 1
    }

    if (dayKey === todayKey) {
      const hourBucket = hourMap.get(date.getHours())
      if (hourBucket) {
        hourBucket.input += input
        hourBucket.output += output
        hourBucket.total += total
        hourBucket.count += 1
      }
    }

    const providerKey = event.provider || 'unknown'
    const providerBucket = providerMap.get(providerKey) || {
      provider: providerKey,
      total: 0,
      input: 0,
      output: 0,
      count: 0,
    }
    providerBucket.total += total
    providerBucket.input += input
    providerBucket.output += output
    providerBucket.count += 1
    providerMap.set(providerKey, providerBucket)
  }

  const today = dayMap.get(todayKey) || { input: 0, output: 0, total: 0, count: 0 }

  return {
    events: recentEvents,
    providerEvents,
    todayInput: today.input,
    todayOutput: today.output,
    todayTotal: today.total,
    answeredCount: recentEvents.filter((event) => event.status === 'answered').length,
    providerBreakdown: [...providerMap.values()].sort((left, right) => right.total - left.total || left.provider.localeCompare(right.provider)),
    daily: [...dayMap.entries()].map(([day, value]) => ({ day, ...value })),
    hourly: [...hourMap.entries()].map(([hour, value]) => ({ hour, ...value })),
  }
}
