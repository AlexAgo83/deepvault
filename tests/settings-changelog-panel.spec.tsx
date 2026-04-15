import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsChangelogPanel } from '../src/components/panels/settings-changelog-panel'

let observerCallback: IntersectionObserverCallback | null = null

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback
  }

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

describe('SettingsChangelogPanel', () => {
  afterEach(() => {
    observerCallback = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads changelog content when the card becomes visible', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    render(<SettingsChangelogPanel />)

    expect(screen.getByRole('heading', { name: 'Changelogs' })).toBeInTheDocument()
    expect(screen.getAllByText('Scroll to load this release note.').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(observerCallback).not.toBeNull()
    })

    act(() => {
      observerCallback?.(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            target: document.createElement('article'),
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      )
    })

    await waitFor(() => {
      expect(screen.getByText('2026-04-10')).toBeInTheDocument()
    })
    expect(screen.getByText(/first release of the local V1 workspace/)).toBeInTheDocument()
  })
})
