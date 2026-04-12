import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('DeepVault app', () => {
  it('renders the explorer shell', async () => {
    render(<App />)

    await waitFor(() => expect(document.title).toBe('Nexus'))
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bishop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync status' })).toBeInTheDocument()
    expect(document.querySelectorAll('.nav-item-icon svg')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Ask Bishop' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Version 1\.0\.0/)).not.toBeInTheDocument()
    expect(screen.queryByText('State')).not.toBeInTheDocument()
    expect(screen.queryByText('Pilot sites')).not.toBeInTheDocument()
  })

  it('returns to Bishop after asking a question', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()
    expect(screen.getByText('Bishop is drafting the answer from grounded sources.')).toBeInTheDocument()
    expect(await screen.findByText('Orchestration')).toBeInTheDocument()
    expect(await screen.findByText('fallback')).toBeInTheDocument()
    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('keeps explorer search hidden while bishop is active', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bishop' }))

    expect(screen.queryByLabelText('Explorer search')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.getByLabelText('Explorer search')).toBeInTheDocument()
  })

  it('marks the active navigation tab for accessibility', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByRole('button', { name: 'Explorer' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Sync status' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the explorer detail pane within the selected site scope', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getAllByText('Q3 2025 budget approval').length).toBeGreaterThan(0)
    const firstDocumentRow = screen.getByRole('button', { name: /Q3 2025 budget approval/i })
    expect(firstDocumentRow).toHaveTextContent('document')
    expect(within(firstDocumentRow).getByText('document')).toHaveClass('file-type-pill')
    const pathLinks = screen.getAllByRole('link')
    expect(pathLinks.length).toBeGreaterThan(0)
    expect(pathLinks.some((link) => link.getAttribute('href')?.startsWith('http'))).toBe(true)
    expect(pathLinks.some((link) => link.getAttribute('target') === '_blank')).toBe(true)
    for (const pathLabel of pathLinks) {
      expect(pathLabel.textContent).not.toContain('/')
    }

    await user.click(screen.getByRole('button', { name: 'Sync status' }))
    await user.click(screen.getByRole('button', { name: 'Pilot Site Beta' }))
    expect(screen.getByText('Runtime')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(screen.queryAllByText('Q3 2025 budget approval')).toHaveLength(0)
    expect(screen.getAllByText('Remote access security requirements').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Known SSO implementation issues' })).toBeInTheDocument()
  })

  it('shows the sync tab runtime panel and the empty explorer state for an impossible filter', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    expect(screen.getByText('Recent sync runs')).toBeInTheDocument()
    expect(screen.getByText('Runtime')).toBeInTheDocument()
    expect(screen.getByText('Site scope')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.type(screen.getByLabelText('Explorer search'), 'budget')

    expect(screen.getByText('No visible document')).toBeInTheDocument()
    expect(screen.getByText('No permitted sources match the current site filter.')).toBeInTheDocument()
  })

  it('keeps Bishop answers scoped to the selected site context', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))
    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(await screen.findByText('No relevant content was found in the indexed pilot corpus.')).toBeInTheDocument()
  })
})
