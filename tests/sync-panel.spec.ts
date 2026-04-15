import { describe, expect, it } from 'vitest'
import { formatDuration } from '../src/components/panels/sync-panel'

describe('formatDuration', () => {
  it('renders sub-second durations in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(12)).toBe('12ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('renders longer durations in seconds and minutes', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(61_000)).toBe('1m 1s')
  })
})
