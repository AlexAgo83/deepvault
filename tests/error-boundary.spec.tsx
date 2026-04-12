import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../src/components/error-boundary'

function ThrowingPanel(): ReactElement {
  throw new Error('boom')
}

function SafePanel(): ReactElement {
  return <div>Safe panel</div>
}

describe('ErrorBoundary', () => {
  it('isolates one panel failure from a sibling boundary', () => {
    render(
      <div>
        <ErrorBoundary fallback={<div>Explorer failed</div>}>
          <ThrowingPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback={<div>Sync failed</div>}>
          <SafePanel />
        </ErrorBoundary>
      </div>,
    )

    expect(screen.getByText('Explorer failed')).toBeInTheDocument()
    expect(screen.getByText('Safe panel')).toBeInTheDocument()
  })

  it('renders the default fallback when no custom fallback is provided', () => {
    render(
      <ErrorBoundary>
        <ThrowingPanel />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong while rendering this panel.')).toBeInTheDocument()
  })
})
