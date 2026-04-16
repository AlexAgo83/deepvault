import { useEffect, useRef } from 'react'

const GETTING_STARTED_ITEMS = [
  {
    title: 'Explorer',
    description: 'Browse the corpus, inspect documents, and read source-backed summaries.',
    Icon: ExplorerIcon,
  },
  {
    title: 'Bishop',
    description: 'Ask permission-aware questions and inspect the answer trace.',
    Icon: BishopIcon,
  },
  {
    title: 'Knowledge',
    description: 'Track ingestion coverage, refresh timing, and provider readiness.',
    Icon: SyncIcon,
  },
  {
    title: 'AI View',
    description: 'Review response confidence and the inputs that would help the next answer.',
    Icon: StatsIcon,
  },
] as const

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
          {GETTING_STARTED_ITEMS.map(({ title, description, Icon }) => (
            <div key={title} className="getting-started-item">
              <div className="getting-started-item-header">
                <span className="getting-started-item-icon" aria-hidden="true">
                  <Icon />
                </span>
                <strong>{title}</strong>
              </div>
              <span>{description}</span>
            </div>
          ))}
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

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="m12.3 12.3 3.7 3.7" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function BishopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="8.2" cy="8.9" r="0.65" fill="currentColor" />
      <circle cx="11.8" cy="8.9" r="0.65" fill="currentColor" />
      <path d="M8.2 11.6c.45.58 1.1.9 1.8.9s1.35-.32 1.8-.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <ellipse cx="10" cy="4.75" rx="4.75" ry="1.75" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.25 4.75v4.5c0 .97 2.13 1.75 4.75 1.75s4.75-.78 4.75-1.75v-4.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5.25 9.25v4.5c0 .97 2.13 1.75 4.75 1.75s4.75-.78 4.75-1.75v-4.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 15.25V9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 15.25V5.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 15.25V11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 15.25h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
