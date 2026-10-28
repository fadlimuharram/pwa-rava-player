import { useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import type { Track } from '../../models/types'
import { formatSongCount } from '../../util/format'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

interface Props {
  readonly tracks: readonly Track[]
  readonly onClose: () => void
  /** Supplied by the playlist detail screen so a song can be taken out of that playlist. */
  readonly onRemoveFromPlaylist?: () => void
}

/**
 * Actions for one or more songs.
 *
 * A bottom sheet rather than a context menu: long-press menus are not a thing browsers give
 * you, and a sheet is reachable with a tap, a keyboard and a screen reader alike.
 */
export function TrackActions({ tracks, onClose, onRemoveFromPlaylist }: Props): ReactNode {
  const { player, library } = useServices()
  const [addingToPlaylist, setAddingToPlaylist] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const single = tracks.length === 1 ? tracks[0] : undefined
  const title = single?.title ?? formatSongCount(tracks.length)

  if (addingToPlaylist) {
    return (
      <AddToPlaylistSheet
        trackIds={tracks.map((track) => track.id)}
        onClose={() => {
          setAddingToPlaylist(false)
          onClose()
        }}
      />
    )
  }

  if (confirmingDelete) {
    return (
      <Sheet title="Remove from library?" onClose={onClose}>
        <p className="note">
          This deletes the copy stored inside Rava Music on this device. Your original files,
          wherever you imported them from, are untouched.
        </p>
        <div className="list-group">
          <button
            className="list-item list-item--danger"
            onClick={() => {
              const ids = tracks.map((track) => track.id)
              void player.purge(ids).then(() => library.deleteTracks(ids))
              onClose()
            }}
          >
            <Icon name="trash" size={20} />
            Remove {formatSongCount(tracks.length)}
          </button>
          <button className="list-item" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="list-group">
        <button
          className="list-item"
          onClick={() => {
            void player.playNext(tracks)
            onClose()
          }}
        >
          <Icon name="queue" size={20} />
          Play next
        </button>
        <button
          className="list-item"
          onClick={() => {
            void player.addToQueue(tracks)
            onClose()
          }}
        >
          <Icon name="plus" size={20} />
          Add to queue
        </button>
        {single !== undefined && (
          <button
            className="list-item"
            onClick={() => {
              void library.toggleFavorite(single.id)
              onClose()
            }}
          >
            <Icon name={single.isFavorite ? 'heart-filled' : 'heart'} size={20} />
            {single.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </button>
        )}
        <button
          className="list-item"
          onClick={() => {
            setAddingToPlaylist(true)
          }}
        >
          <Icon name="playlists" size={20} />
          Add to playlist…
        </button>
        {onRemoveFromPlaylist !== undefined && (
          <button
            className="list-item list-item--danger"
            onClick={() => {
              onRemoveFromPlaylist()
              onClose()
            }}
          >
            <Icon name="close" size={20} />
            Remove from playlist
          </button>
        )}
        <button
          className="list-item list-item--danger"
          onClick={() => {
            setConfirmingDelete(true)
          }}
        >
          <Icon name="trash" size={20} />
          Remove from library
        </button>
      </div>
      {single !== undefined && (
        <p className="note">
          {single.fileFormat} • {single.fileName}
          {single.folderPath === '' ? '' : ` • ${single.folderPath}`}
        </p>
      )}
    </Sheet>
  )
}

interface AddProps {
  readonly trackIds: readonly string[]
  readonly onClose: () => void
}

export function AddToPlaylistSheet({ trackIds, onClose }: AddProps): ReactNode {
  const { library } = useServices()
  const { playlists } = useStore(library)
  const [name, setName] = useState('')

  const create = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    void library.createPlaylist(trimmed, trackIds).then(onClose)
  }

  return (
    <Sheet title="Add to playlist" onClose={onClose}>
      <div className="list-group">
        <div className="list-item">
          <input
            value={name}
            placeholder="New playlist name"
            aria-label="New playlist name"
            onChange={(event) => {
              setName(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
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
            onClick={create}
            disabled={name.trim() === ''}
            style={{ color: 'var(--accent)', fontWeight: 600 }}
          >
            Create
          </button>
        </div>
      </div>

      <div className="list-group">
        {playlists.length === 0 && <div className="list-item">No playlists yet.</div>}
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            className="list-item"
            onClick={() => {
              void library.addToPlaylist(playlist.id, trackIds).then(onClose)
            }}
          >
            <Icon name="playlists" size={20} />
            <span className="row__text">
              <span className="row__title">{playlist.name}</span>
              <span className="row__subtitle">{formatSongCount(playlist.trackIds.length)}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
