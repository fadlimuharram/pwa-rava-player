import { useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import type { LibraryStore } from '../../library/libraryStore'
import type { Playlist, Track } from '../../models/types'
import { formatLongDuration, formatSongCount } from '../../util/format'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { TrackActions } from '../components/TrackActions'
import { TrackRow } from '../components/TrackRow'
import type { Route, SmartListId } from '../routes'

const SMART_LISTS: readonly {
  id: SmartListId
  label: string
  icon: Parameters<typeof Icon>[0]['name']
}[] = [
  { id: 'recentlyAdded', label: 'Recently Added', icon: 'clock' },
  { id: 'recentlyPlayed', label: 'Recently Played', icon: 'play' },
  { id: 'mostPlayed', label: 'Most Played', icon: 'chart' },
  { id: 'favorites', label: 'Favorites', icon: 'heart' },
  { id: 'neverPlayed', label: 'Never Played', icon: 'note' },
]

export function PlaylistsScreen({
  onNavigate,
}: {
  readonly onNavigate: (route: Route) => void
}): ReactNode {
  const { library, player } = useServices()
  const { playlists } = useStore(library)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<Playlist | null>(null)
  const [menuFor, setMenuFor] = useState<Playlist | null>(null)

  return (
    <>
      <div className="list-group__label">Smart playlists</div>
      <div className="list-group">
        {SMART_LISTS.map((item) => (
          <button
            key={item.id}
            className="list-item"
            onClick={() => {
              onNavigate({ kind: 'smart', id: item.id })
            }}
          >
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <Icon name={item.icon} size={20} />
            </span>
            {item.label}
            <span className="list-item__value">{smartList(library, item.id).length}</span>
            <Icon name="chevron-right" size={16} />
          </button>
        ))}
      </div>

      <div className="list-group__label">Your playlists</div>
      <div className="list-group">
        {playlists.length === 0 && (
          <div className="list-item">Tap + to create your first playlist.</div>
        )}
        {playlists.map((playlist) => {
          const members = library.tracksByIds(playlist.trackIds)
          const cover = members.find((track) => track.artworkKey !== null)
          const total = members.reduce((sum, track) => sum + track.duration, 0)
          return (
            <div className="list-item" key={playlist.id} style={{ gap: 12 }}>
              <button
                style={{ display: 'contents' }}
                onClick={() => {
                  onNavigate({ kind: 'playlist', id: playlist.id })
                }}
              >
                <Artwork artworkKey={cover?.artworkKey ?? null} seed={playlist.name} size={44} />
                <span className="row__text">
                  <span className="row__title">{playlist.name}</span>
                  <span className="row__subtitle">
                    {formatSongCount(members.length)} • {formatLongDuration(total)}
                  </span>
                </span>
              </button>
              <button
                className="icon-button icon-button--plain"
                aria-label={`Actions for ${playlist.name}`}
                onClick={() => {
                  setMenuFor(playlist)
                }}
              >
                <Icon name="more" size={20} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="pill-row">
        <button
          className="pill pill--primary"
          onClick={() => {
            setName('')
            setCreating(true)
          }}
        >
          <Icon name="plus" size={18} /> New playlist
        </button>
      </div>

      {creating && (
        <Sheet
          title="New playlist"
          onClose={() => {
            setCreating(false)
          }}
        >
          <NameForm
            value={name}
            onChange={setName}
            confirmLabel="Create"
            onConfirm={() => {
              const trimmed = name.trim()
              if (trimmed !== '') void library.createPlaylist(trimmed)
              setCreating(false)
            }}
          />
        </Sheet>
      )}

      {renaming !== null && (
        <Sheet
          title="Rename playlist"
          onClose={() => {
            setRenaming(null)
          }}
        >
          <NameForm
            value={name}
            onChange={setName}
            confirmLabel="Save"
            onConfirm={() => {
              const trimmed = name.trim()
              if (trimmed !== '') void library.renamePlaylist(renaming.id, trimmed)
              setRenaming(null)
            }}
          />
        </Sheet>
      )}

      {menuFor !== null && (
        <Sheet
          title={menuFor.name}
          onClose={() => {
            setMenuFor(null)
          }}
        >
          <div className="list-group">
            <button
              className="list-item"
              onClick={() => {
                void player.play(library.tracksInPlaylist(menuFor.id))
                setMenuFor(null)
              }}
            >
              <Icon name="play" size={20} /> Play
            </button>
            <button
              className="list-item"
              onClick={() => {
                void player.shuffleAll(library.tracksInPlaylist(menuFor.id))
                setMenuFor(null)
              }}
            >
              <Icon name="shuffle" size={20} /> Shuffle
            </button>
            <button
              className="list-item"
              onClick={() => {
                setName(menuFor.name)
                setRenaming(menuFor)
                setMenuFor(null)
              }}
            >
              <Icon name="sliders" size={20} /> Rename…
            </button>
            <button
              className="list-item list-item--danger"
              onClick={() => {
                void library.deletePlaylist(menuFor.id)
                setMenuFor(null)
              }}
            >
              <Icon name="trash" size={20} /> Delete playlist
            </button>
          </div>
          <p className="note">Deleting a playlist never removes its songs from your library.</p>
        </Sheet>
      )}
    </>
  )
}

function NameForm({
  value,
  onChange,
  onConfirm,
  confirmLabel,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onConfirm: () => void
  readonly confirmLabel: string
}): ReactNode {
  return (
    <div className="list-group">
      <div className="list-item">
        <input
          autoFocus
          value={value}
          aria-label="Playlist name"
          placeholder="Playlist name"
          onChange={(event) => {
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onConfirm()
          }}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <button
          onClick={onConfirm}
          disabled={value.trim() === ''}
          style={{ color: 'var(--accent)', fontWeight: 600 }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

export function PlaylistDetailScreen({ id }: { readonly id: string }): ReactNode {
  const { library, player } = useServices()
  const state = useStore(library)
  const [picking, setPicking] = useState(false)
  const [actionsFor, setActionsFor] = useState<Track | null>(null)

  const playlist = state.playlists.find((candidate) => candidate.id === id)
  if (playlist === undefined) {
    return (
      <EmptyState
        icon="playlists"
        title="Playlist removed"
        message="This playlist no longer exists."
      />
    )
  }

  const tracks = library.tracksByIds(playlist.trackIds)
  const total = tracks.reduce((sum, track) => sum + track.duration, 0)

  return (
    <>
      <div style={{ display: 'grid', placeItems: 'center', padding: '8px 16px 16px', gap: 8 }}>
        <Artwork
          artworkKey={tracks.find((track) => track.artworkKey !== null)?.artworkKey ?? null}
          seed={playlist.name}
          size={160}
          className="now__art"
        />
        <span className="section__subtitle">
          {formatSongCount(tracks.length)} • {formatLongDuration(total)}
        </span>
      </div>

      <div className="pill-row">
        <button
          className="pill pill--primary"
          disabled={tracks.length === 0}
          onClick={() => {
            void player.play(tracks)
          }}
        >
          <Icon name="play" size={18} /> Play
        </button>
        <button
          className="pill"
          disabled={tracks.length === 0}
          onClick={() => {
            void player.shuffleAll(tracks)
          }}
        >
          <Icon name="shuffle" size={18} /> Shuffle
        </button>
        <button
          className="pill"
          onClick={() => {
            setPicking(true)
          }}
        >
          <Icon name="plus" size={18} /> Add
        </button>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon="playlists"
          title="Empty playlist"
          message="Add songs from your library."
          action={{
            label: 'Add songs',
            onClick: () => {
              setPicking(true)
            },
          }}
        />
      ) : (
        <div className="row-list">
          {tracks.map((track, index) => (
            <div key={`${track.id}-${index}`} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TrackRow
                  track={track}
                  isCurrent={player.state.currentTrack?.id === track.id}
                  isPlaying={
                    player.state.status === 'playing' && player.state.currentTrack?.id === track.id
                  }
                  onPlay={() => {
                    void player.play(tracks, index)
                  }}
                  onMore={() => {
                    setActionsFor(track)
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 8 }}>
                <button
                  aria-label={`Move ${track.title} up`}
                  disabled={index === 0}
                  onClick={() => {
                    void library.movePlaylistTrack(id, index, index - 1)
                  }}
                  style={{ opacity: index === 0 ? 0.3 : 1, padding: 2 }}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  aria-label={`Move ${track.title} down`}
                  disabled={index === tracks.length - 1}
                  onClick={() => {
                    void library.movePlaylistTrack(id, index, index + 1)
                  }}
                  style={{
                    opacity: index === tracks.length - 1 ? 0.3 : 1,
                    padding: 2,
                    transform: 'rotate(180deg)',
                  }}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {actionsFor !== null && (
        <TrackActions
          tracks={[actionsFor]}
          onRemoveFromPlaylist={() => {
            const index = tracks.findIndex((track) => track.id === actionsFor.id)
            if (index >= 0) void library.removeFromPlaylist(id, index)
          }}
          onClose={() => {
            setActionsFor(null)
          }}
        />
      )}

      {picking && (
        <SongPickerSheet
          playlistId={id}
          onClose={() => {
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

function SongPickerSheet({
  playlistId,
  onClose,
}: {
  readonly playlistId: string
  readonly onClose: () => void
}): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = tracks.filter(
    (track) =>
      needle === '' ||
      `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle),
  )

  return (
    <Sheet
      title={`Add ${selected.size === 0 ? 'songs' : formatSongCount(selected.size)}`}
      onClose={onClose}
      full
      trailing={
        <button
          disabled={selected.size === 0}
          style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 40 }}
          onClick={() => {
            const ordered = visible.filter((track) => selected.has(track.id)).map((t) => t.id)
            void library.addToPlaylist(playlistId, ordered).then(onClose)
          }}
        >
          Add
        </button>
      }
    >
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
      <div className="row-list">
        {visible.map((track) => {
          const checked = selected.has(track.id)
          return (
            <button
              key={track.id}
              className="row"
              aria-pressed={checked}
              onClick={() => {
                const next = new Set(selected)
                if (checked) next.delete(track.id)
                else next.add(track.id)
                setSelected(next)
              }}
            >
              <span style={{ color: checked ? 'var(--accent)' : 'var(--text-dim)' }}>
                <Icon name={checked ? 'check' : 'plus'} size={20} />
              </span>
              <span className="row__text">
                <span className="row__title">{track.title}</span>
                <span className="row__subtitle">{track.artist}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

function smartList(library: LibraryStore, id: SmartListId): readonly Track[] {
  switch (id) {
    case 'recentlyAdded':
      return library.recentlyAdded
    case 'recentlyPlayed':
      return library.recentlyPlayed
    case 'mostPlayed':
      return library.mostPlayed
    case 'favorites':
      return library.favorites
    case 'neverPlayed':
      return library.neverPlayed
  }
}

export { smartList }
