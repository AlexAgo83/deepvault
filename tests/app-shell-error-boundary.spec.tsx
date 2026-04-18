import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/components/panels', async () => {
  const actual = await vi.importActual<typeof import('../src/components/panels')>('../src/components/panels')

  return {
    ...actual,
    ExplorerPanel: function ThrowingExplorerPanel() {
      throw new Error('Explorer exploded')
    },
  }
})

import App from '../src/App'

describe('DeepVault app shell error isolation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = ''
  })

  it('keeps the shell usable when one panel throws inside its boundary', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Explorer panel failed to render.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })
})
