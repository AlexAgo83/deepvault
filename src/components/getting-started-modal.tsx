import { useEffect, useRef } from 'react'

export function GettingStartedModal({
  onClose,
  open,
}: {
  onClose: () => void
  open: boolean
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="getting-started-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-describedby="getting-started-description"
        aria-labelledby="getting-started-title"
        aria-modal="true"
        className="getting-started-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="getting-started-eyebrow">Getting started</div>
        <h2 id="getting-started-title">Getting started</h2>
        <p id="getting-started-description">
          DeepVault is a local-first command center for browsing documents, asking grounded questions with Bishop, and
          monitoring sync status without depending on a hosted backend at day one.
        </p>

        <div className="getting-started-list">
          <div className="getting-started-item">
            <strong>Explorer</strong>
            <span>Browse the corpus, inspect documents, and read source-backed summaries.</span>
          </div>
          <div className="getting-started-item">
            <strong>Bishop</strong>
            <span>Ask permission-aware questions and inspect the answer trace.</span>
          </div>
          <div className="getting-started-item">
            <strong>Sync status</strong>
            <span>Track ingestion coverage, refresh timing, and provider readiness.</span>
          </div>
          <div className="getting-started-item">
            <strong>AI stats</strong>
            <span>Review response confidence and the inputs that would help the next answer.</span>
          </div>
        </div>

        <div className="getting-started-actions">
          <button ref={closeButtonRef} type="button" className="primary-button" title="Start using DeepVault" onClick={onClose}>
            Start exploring
          </button>
          <button type="button" className="secondary-button" title="Dismiss the getting started modal" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  )
}
