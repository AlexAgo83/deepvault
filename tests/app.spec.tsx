import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('DeepVault app', () => {
  it('renders the explorer shell', () => {
    render(<App />)

    expect(screen.getByText('DeepVault - Navy')).toBeInTheDocument()
    expect(screen.getByText('DeepVault - Bishop')).toBeInTheDocument()
    expect(screen.getByText('Sync status')).toBeInTheDocument()
  })

  it('returns to Bishop after asking a question', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'DeepVault - Bishop' }))
    await user.type(screen.getByLabelText('Ask a question'), 'What is the budget for Q3 2025?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findAllByText('The Q3 2025 budget is 4.8M USD.')).not.toHaveLength(0)
  })

  it('keeps the explorer detail pane within the selected site scope', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getAllByText('Q3 2025 budget approval').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Pilot Site Beta' }))

    expect(screen.queryAllByText('Q3 2025 budget approval')).toHaveLength(0)
    expect(screen.getAllByText('Remote access security requirements').length).toBeGreaterThan(0)
  })

  it('shows the sync tab and the empty explorer state for an impossible filter', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sync status' }))

    expect(screen.getByText('Synced sites')).toBeInTheDocument()
    expect(screen.getByText('Recent sync runs')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'DeepVault - Navy' }))
    await user.click(screen.getByRole('button', { name: 'Restricted Pilot Site' }))
    await user.type(screen.getByLabelText('Explorer search'), 'budget')

    expect(screen.getByText('No visible document')).toBeInTheDocument()
    expect(screen.getByText('No permitted sources match the current site filter.')).toBeInTheDocument()
  })
})
