import type { ReactNode } from 'react'
import { albumKey, displayArtist, type Track } from '../../models/types'
import { formatDuration } from '../../util/format'
import { Artwork } from './Artwork'
import { Icon } from './Icon'

interface Props {
  readonly track: Track
  readonly isCurrent?: boolean
  readonly isPlaying?: boolean
  readonly subtitle?: string
  readonly showArtwork?: boolean
  readonly onPlay: () => void
  readonly onMore?: () => void
}

export function TrackRow({
  track,
  isCurrent = false,
  isPlaying = false,
  subtitle,
  showArtwork = true,
  onPlay,
  onMore,
}: Props): ReactNode {
  const secondary = subtitle ?? defaultSubtitle(track)
  const label = [
    track.title,
    secondary,
    formatDuration(track.duration),
    track.isFavorite ? 'Favorite' : '',
    isCurrent ? (isPlaying ? 'Now playing' : 'Paused') : '',
  ]
    .filter((part) => part !== '')
    .join(', ')

  return (
    <div className={`row${isCurrent ? ' row--current' : ''}`}>
      <button
        onClick={onPlay}
        aria-label={label}
        style={{ display: 'contents', textAlign: 'left' }}
      >
        {showArtwork && (
          <Artwork
            artworkKey={track.artworkKey}
            seed={albumKey(track)}
            size={52}
            className="row__art"
          />
        )}
        <span className="row__text">
          <span className="row__title">{track.title}</span>
          <span className="row__subtitle">{secondary}</span>
        </span>
        <span className="row__meta">
          {track.isFavorite && (
            <span style={{ color: 'var(--pink)' }}>
              <Icon name="heart-filled" size={14} title="Favorite" />
            </span>
          )}
          <span>{formatDuration(track.duration)}</span>
        </span>
      </button>
      {onMore !== undefined && (
        <button
          className="icon-button icon-button--plain"
          onClick={onMore}
          aria-label={`More actions for ${track.title}`}
        >
          <Icon name="more" size={20} />
        </button>
      )}
    </div>
  )
}

const defaultSubtitle = (track: Track): string => {
  const artist = displayArtist(track)
  return track.album === '' ? artist : `${artist} • ${track.album}`
}
