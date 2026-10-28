import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface Props {
  readonly icon: IconName
  readonly title: string
  readonly message: string
  readonly action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, message, action }: Props): ReactNode {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={40} />
      </span>
      <span className="empty__title">{title}</span>
      <span>{message}</span>
      {action !== undefined && (
        <button className="pill pill--primary" style={{ flex: 'none' }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
