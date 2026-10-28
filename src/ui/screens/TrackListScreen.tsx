import { useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import { searchTracks, sortTracks } from '../../models/library'
import {
  TRACK_SORT_OPTIONS,
  trackSortLabels,
  type Track,
  type TrackSortOption,
} from '../../models/types'
import { formatLongDuration, formatSongCount } from '../../util/format'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { TrackActions } from '../components/TrackActions'
import { TrackRow } from '../components/TrackRow'

interface Props {
  readonly title: string
  readonly tracks: readonly Track[]
  readonly subtitle?: string
  readonly headerArtworkKey?: string | null
  readonly headerSeed?: string
  readonly allowSorting?: boolean
  readonly allowSearch?: boolean
  readonly emptyMessage?: string
  readonly onRemoveFromPlaylist?: (index: number) => void
}

/**
 * The one "list of songs" screen.
 *
 * Library, album, artist, folder, genre, favorites and every smart list render through this,
 * so search, sorting, the play header, the action sheet and the empty state behave identically
 * everywhere instead of being reimplemented seven times.
 */
export function TrackListScreen({
  title,
  tracks,
  subtitle,
  headerArtworkKey,
  headerSeed,
  allowSorting = true,
  allowSearch = true,
  emptyMessage = 'No songs here yet.',
  onRemoveFromPlaylist,
}: Props): ReactNode {
  const { player, settings } = useServices()
  const playback = useStore(player)
  const { defaultSort } = useStore(settings)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<TrackSortOption | null>(null)
  const [actionsFor, setActionsFor] = useState<Track | null>(null)

  const searched = allowSearch ? searchTracks(tracks, query) : [...tracks]
  // Album, artist and folder lists arrive already in a meaningful order and keep it; browsable
  // lists follow the user's chosen default.
  const effectiveSort = sort ?? (allowSorting ? defaultSort : null)
  const visible = effectiveSort === null ? searched : sortTracks(searched, effectiveSort)
  const totalDuration = visible.reduce((total, track) => total + track.duration, 0)

  if (tracks.length === 0) {
    return <EmptyState icon="note" title="Nothing to play" message={emptyMessage} />
  }

  return (
    <>
      {headerArtworkKey !== undefined && (
        <div style={{ display: 'grid', placeItems: 'center', padding: '8px 16px 16px', gap: 8 }}>
          <Artwork
            artworkKey={headerArtworkKey}
            seed={headerSeed ?? title}
            size={180}
            className="now__art"
          />
          {subtitle !== undefined && <span className="section__subtitle">{subtitle}</span>}
        </div>
      )}

      <div className="pill-row">
        <button
          className="pill pill--primary"
          onClick={() => {
            void player.play(visible)
          }}
        >
          <Icon name="play" size={18} /> Play
        </button>
        <button
          className="pill"
          onClick={() => {
            void player.shuffleAll(visible)
          }}
        >
          <Icon name="shuffle" size={18} /> Shuffle
        </button>
      </div>

      {allowSearch && (
        <div className="search">
          <input
            type="search"
            value={query}
            placeholder="Search songs"
            aria-label="Search songs"
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>
      )}

      <div className="section__header">
        <span className="section__subtitle">
          {formatSongCount(visible.length)} • {formatLongDuration(totalDuration)}
        </span>
        {allowSorting && (
          <label className="section__subtitle">
            <span className="visually-hidden">Sort songs</span>
            <select
              value={effectiveSort ?? 'titleAsc'}
              onChange={(event) => {
                setSort(event.target.value as TrackSortOption)
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)' }}
            >
              {TRACK_SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {trackSortLabels[option]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="search" title="No matches" message={`Nothing matches “${query}”.`} />
      ) : (
        <div className="row-list">
          {visible.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              isCurrent={playback.currentTrack?.id === track.id}
              isPlaying={playback.status === 'playing' && playback.currentTrack?.id === track.id}
              onPlay={() => {
                void player.play(visible, index)
              }}
              onMore={() => {
                setActionsFor(track)
              }}
            />
          ))}
        </div>
      )}

      {actionsFor !== null && (
        <TrackActions
          tracks={[actionsFor]}
          {...(onRemoveFromPlaylist !== undefined
            ? {
                onRemoveFromPlaylist: () => {
                  const position = tracks.findIndex((track) => track.id === actionsFor.id)
                  if (position >= 0) onRemoveFromPlaylist(position)
                },
              }
            : {})}
          onClose={() => {
            setActionsFor(null)
          }}
        />
      )}
    </>
  )
}
