import type { ReactNode } from 'react'

/**
 * Inline SVG icon set.
 *
 * Hand-drawn geometry rather than an icon font or package: it keeps the bundle free of a
 * dependency, inherits `currentColor` so dark mode needs no extra work, and never shows a
 * missing-glyph box before a font loads.
 */
export type IconName =
  | 'home'
  | 'library'
  | 'playlists'
  | 'heart'
  | 'heart-filled'
  | 'settings'
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'search'
  | 'note'
  | 'folder'
  | 'mic'
  | 'disc'
  | 'clock'
  | 'moon'
  | 'speed'
  | 'queue'
  | 'trash'
  | 'more'
  | 'check'
  | 'close'
  | 'warning'
  | 'sliders'
  | 'download'
  | 'chart'
  | 'quote'
  | 'volume-low'
  | 'volume-high'

/** Icons drawn as solid shapes; everything else is a 1.8px stroke. */
const FILLED_NAMES = new Set<IconName>(['play', 'pause', 'next', 'previous', 'heart-filled'])

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5h-5v5H4z" />,
  library: <path d="M4 6h10M4 11h10M4 16h7M17 16.5V7l4-1" />,
  playlists: <path d="M4 7h16M5 11.5h14M7 16h10M4.5 19.5h15" />,
  heart: <path d="M12 20 4.8 12.9a4.3 4.3 0 0 1 6-6.1l1.2 1.1 1.2-1.1a4.3 4.3 0 0 1 6 6.1z" />,
  'heart-filled': (
    <path d="M12 20.5 4.3 13a4.7 4.7 0 0 1 6.6-6.7l1.1 1 1.1-1A4.7 4.7 0 0 1 19.7 13z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M8 5h3v14H8zm5 0h3v14h-3z" />,
  next: <path d="M6 5.5v13l9-6.5zM16 5h2.5v14H16z" />,
  previous: <path d="M18 5.5v13l-9-6.5zM8 5H5.5v14H8z" />,
  shuffle: (
    <path d="M3 7h3.5l10 10H21M17.5 3.5 21 7l-3.5 3.5M3 17h3.5l3-3M14 10l2.5-3H21M17.5 20.5 21 17l-3.5-3.5" />
  ),
  repeat: (
    <path d="M7 5h10a4 4 0 0 1 4 4v1M17 19H7a4 4 0 0 1-4-4v-1M6 2.5 3 5.5l3 3M18 21.5l3-3-3-3" />
  ),
  'repeat-one': (
    <>
      <path d="M7 5h10a4 4 0 0 1 4 4v1M17 19H7a4 4 0 0 1-4-4v-1M6 2.5 3 5.5l3 3M18 21.5l3-3-3-3" />
      <path d="M11.5 10.5 13 9.5V15" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  'chevron-left': <path d="m14.5 5-6 7 6 7" />,
  'chevron-right': <path d="m9.5 5 6 7-6 7" />,
  'chevron-down': <path d="m5 9.5 7 6 7-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  note: (
    <>
      <path d="M9 18V5.5l10-2V16" />
      <circle cx="6.5" cy="18" r="2.6" />
      <circle cx="16.5" cy="16" r="2.6" />
    </>
  ),
  folder: (
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.3 2" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  speed: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 13 4-3.5" />
    </>
  ),
  queue: <path d="M4 7h11M4 12h11M4 17h7M18 7.5V17a2 2 0 1 1-2-2" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  warning: (
    <>
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  sliders: <path d="M6 20V14M6 10V4M12 20v-8M12 8V4M18 20v-3M18 13V4M3.5 14h5M9.5 8h5M15.5 17h5" />,
  download: (
    <path d="M12 4v10m0 0-3.5-3.5M12 14l3.5-3.5M4.5 17.5v1A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  quote: (
    <path d="M5 16a4 4 0 0 1 4-4V8a7 7 0 0 0-7 7v4h7v-3zM17 16a4 4 0 0 1 4-4V8a7 7 0 0 0-7 7v4h7v-3z" />
  ),
  'volume-low': <path d="M4.5 9.5h3L11 6.5v11L7.5 14.5h-3z" />,
  'volume-high': (
    <>
      <path d="M3.5 9.5h3L10 6.5v11L6.5 14.5h-3z" />
      <path d="M13.5 9.5a3.5 3.5 0 0 1 0 5M16 7a7 7 0 0 1 0 10" />
    </>
  ),
}

interface Props {
  readonly name: IconName
  readonly size?: number
  readonly title?: string
}

export function Icon({ name, size = 22, title }: Props): ReactNode {
  const filled = FILLED_NAMES.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title === undefined}
      role={title === undefined ? undefined : 'img'}
      focusable="false"
    >
      {title !== undefined && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}
