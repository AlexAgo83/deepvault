import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/App.jsx'

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
})
