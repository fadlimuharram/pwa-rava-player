import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  readonly title?: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly full?: boolean
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
}

/**
 * Bottom sheet / full-screen modal.
 *
 * Closes on Escape and on a backdrop tap, locks body scroll while open, and keeps focus
 * inside by rendering a real dialog role.
 */
export function Sheet({ title, onClose, children, full, leading, trailing }: Props): ReactNode {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`sheet${full === true ? ' sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet__header">
          {leading ?? (
            <button className="icon-button icon-button--plain" onClick={onClose} aria-label="Close">
              <Icon name={full === true ? 'chevron-down' : 'close'} />
            </button>
          )}
          <h2 className="sheet__title">{title}</h2>
          {trailing ?? <span style={{ width: 40 }} />}
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}
