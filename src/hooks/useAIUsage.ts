import { useEffect, useMemo, useState } from 'react'
import { listAIUsageEvents, summarizeAIUsageEvents, type AIUsageEvent } from '../lib/ai-usage'

export function useAIUsage() {
  const [events, setEvents] = useState<AIUsageEvent[]>(() => listAIUsageEvents())

  useEffect(() => {
    const refresh = () => setEvents(listAIUsageEvents())
    window.addEventListener('storage', refresh)
    window.addEventListener('deepvault-ai-usage-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('deepvault-ai-usage-updated', refresh)
    }
  }, [])

  const summary = useMemo(() => summarizeAIUsageEvents(events), [events])

  return {
    events,
    summary,
    refresh: () => setEvents(listAIUsageEvents()),
  }
}
