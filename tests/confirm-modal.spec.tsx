import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmModal } from '../src/components/confirm-modal'

describe('ConfirmModal', () => {
  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal title="Test" description="Some action." onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" description="Some action." onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" description="Some action." onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" description="Some action." onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not call onCancel for other keys', () => {
    const onCancel = vi.fn()
    render(<ConfirmModal title="Test" description="Some action." onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows warning when provided', () => {
    render(<ConfirmModal title="Test" description="desc" warning="This is dangerous." onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('This is dangerous.')).toBeInTheDocument()
  })

  it('does not render warning when not provided', () => {
    const { container } = render(<ConfirmModal title="Test" description="desc" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(container.querySelector('.confirm-warning')).not.toBeInTheDocument()
  })

  it('uses custom confirmLabel', () => {
    render(<ConfirmModal title="Test" description="desc" confirmLabel="Run it" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Run it' })).toBeInTheDocument()
  })
})
