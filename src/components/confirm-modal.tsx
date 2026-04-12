import { useEffect, useRef } from 'react'

export interface ConfirmModalProps {
  title: string
  description: string
  warning?: string | null
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  description,
  warning,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="confirm-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-describedby="confirm-description"
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="confirm-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-description">{description}</p>
        {warning ? <p className="confirm-warning">{warning}</p> : null}
        <div className="confirm-actions">
          <button ref={confirmRef} type="button" className="primary-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
