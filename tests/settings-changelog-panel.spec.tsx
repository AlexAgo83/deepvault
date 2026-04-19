import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      expect(screen.queryByText('Release date: 2026-04-10')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'DeepVault Nexus 1.0.0' })).not.toBeInTheDocument()
    })

    const releaseCard = screen.getByText('1.0.0').closest('article')
    expect(releaseCard).not.toBeNull()
    const card = releaseCard as HTMLElement

    await waitFor(() => {
      const head = card.querySelector('.changelog-card-head')
      expect(head?.firstElementChild).toHaveTextContent('2026-04-10')
      expect(head?.lastElementChild).toHaveTextContent('1.0.0')
    })

    expect(within(card).getByRole('heading', { name: 'Major Highlights' })).toBeInTheDocument()

    const collapsibleSummary = within(card).getByText('Core App')
    const collapsibleSection = collapsibleSummary.closest('details')
    expect(collapsibleSection).not.toBeNull()
    expect(collapsibleSection).not.toHaveAttribute('open')

    fireEvent.click(collapsibleSummary)

    expect(collapsibleSection).toHaveAttribute('open')
    expect(within(collapsibleSection as HTMLElement).getByText((_, element) => {
      return element?.textContent?.includes('Local UI for') ?? false
    })).toBeInTheDocument()
  })
})
