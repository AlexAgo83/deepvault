import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught a render error', error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback || <div className="empty-state">Something went wrong while rendering this panel.</div>
    }

    return this.props.children
  }
}
