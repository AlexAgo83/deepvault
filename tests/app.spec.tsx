import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('DeepVault app', () => {
  it('renders the explorer shell', async () => {
    render(<App />)

    await waitFor(() => expect(document.title).toBe('Nexus'))
    expect(screen.getByRole('heading', { name: 'Nexus' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Explorer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bishop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync status' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask Bishop' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Version 1\.0\.0/)).not.toBeInTheDocument()
    expect(screen.queryByText('State')).not.toBeInTheDocument()
  })

  it('returns to Bishop after asking a question', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Ask bishop' }))

    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()
    expect(screen.getByText('Bishop is drafting the answer from grounded sources.')).toBeInTheDocument()
    expect(await screen.findByText('Orchestration')).toBeInTheDocument()
    expect(await screen.findByText('fallback')).toBeInTheDocument()
    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('keeps the explorer detail pane within the selected site scope', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getAllByText('Q3 2025 budget approval').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Copy full path / }).length).toBeGreaterThan(0)
    expect(screen.getAllByTitle(/\/.+/).length).toBeGreaterThan(0)
    for (const pathLabel of screen.getAllByTitle(/\/.+/)) {
      expect(pathLabel.textContent).not.toContain('/')
    }

    await user.click(screen.getByRole('button', { name: 'Pilot Site Beta' }))

    expect(screen.queryAllByText('Q3 2025 budget approval')).toHaveLength(0)
    expect(screen.getAllByText('Remote access security requirements').length).toBeGreaterThan(0)
  })

  it('shows the sync tab and the empty explorer state for an impossible filter', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(
      screen.getByText(
        'A product-ready workspace for exploring content, validating grounded answers, and reviewing sync health before release.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    expect(screen.getByText('Recent sync runs')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explorer' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))
    await user.type(screen.getByLabelText('Explorer search'), 'budget')

    expect(screen.getByText('No visible document')).toBeInTheDocument()
    expect(screen.getByText('No permitted sources match the current site filter.')).toBeInTheDocument()
  })
})
