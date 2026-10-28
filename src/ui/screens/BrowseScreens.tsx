import { useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import {
  buildFolderTree,
  folderAllTracks,
  folderTrackCount,
  groupAlbums,
  groupArtists,
  groupGenres,
  type FolderNode,
} from '../../models/library'
import { formatSongCount } from '../../util/format'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { ImportProgressBanner } from '../components/ImportButton'
import { TrackActions } from '../components/TrackActions'
import { TrackRow } from '../components/TrackRow'
import type { Route } from '../routes'

interface NavProps {
  readonly onNavigate: (route: Route) => void
}

/** Library hub: the browsing entry points plus a direct song list. */
export function LibraryScreen({ onNavigate }: NavProps): ReactNode {
  const { library } = useServices()
  const { tracks, isLoading } = useStore(library)

  const formatCounts = new Map<string, number>()
  for (const track of tracks) {
    formatCounts.set(track.fileFormat, (formatCounts.get(track.fileFormat) ?? 0) + 1)
  }
  const formats = [...formatCounts.entries()].sort((a, b) => b[1] - a[1])

  if (!isLoading && tracks.length === 0) {
    return (
      <>
        <ImportProgressBanner />
        <EmptyState
          icon="library"
          title="No music yet"
          message="Use the + button to import audio files from this device."
        />
      </>
    )
  }

  return (
    <>
      <ImportProgressBanner />
      <div className="list-group">
        <BrowseRow
          icon="note"
          label="All Songs"
          count={tracks.length}
          onClick={() => {
            onNavigate({ kind: 'allSongs' })
          }}
        />
        <BrowseRow
          icon="mic"
          label="Artists"
          count={groupArtists(tracks).length}
          onClick={() => {
            onNavigate({ kind: 'artists' })
          }}
        />
        <BrowseRow
          icon="disc"
          label="Albums"
          count={groupAlbums(tracks).length}
          onClick={() => {
            onNavigate({ kind: 'albums' })
          }}
        />
        <BrowseRow
          icon="library"
          label="Genres"
          count={groupGenres(tracks).length}
          onClick={() => {
            onNavigate({ kind: 'genres' })
          }}
        />
        <BrowseRow
          icon="folder"
          label="Folders"
          count={tracks.length}
          onClick={() => {
            onNavigate({ kind: 'folders', path: '/' })
          }}
        />
      </div>

      <div className="list-group__label">Formats in your library</div>
      <div className="list-group">
        {formats.length === 0 && <div className="list-item">Nothing imported yet.</div>}
        {formats.map(([name, count]) => (
          <button
            key={name}
            className="list-item"
            onClick={() => {
              onNavigate({ kind: 'format', name })
            }}
          >
            {name}
            <span className="list-item__value">{count}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function BrowseRow({
  icon,
  label,
  count,
  onClick,
}: {
  readonly icon: Parameters<typeof Icon>[0]['name']
  readonly label: string
  readonly count: number
  readonly onClick: () => void
}): ReactNode {
  return (
    <button className="list-item" onClick={onClick}>
      <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
        <Icon name={icon} size={20} />
      </span>
      {label}
      <span className="list-item__value">{count}</span>
      <Icon name="chevron-right" size={16} />
    </button>
  )
}

export function AlbumsScreen({ onNavigate }: NavProps): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const albums = groupAlbums(tracks).filter(
    (album) =>
      needle === '' ||
      album.title.toLowerCase().includes(needle) ||
      album.artist.toLowerCase().includes(needle),
  )

  if (albums.length === 0 && needle === '') {
    return (
      <EmptyState
        icon="disc"
        title="No albums"
        message="Import music with album tags to see albums here."
      />
    )
  }

  return (
    <>
      <div className="search">
        <input
          type="search"
          value={query}
          placeholder="Search albums"
          aria-label="Search albums"
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </div>
      <div className="grid">
        {albums.map((album) => (
          <button
            key={album.id}
            className="card"
            style={{ width: '100%' }}
            onClick={() => {
              onNavigate({ kind: 'album', id: album.id })
            }}
          >
            <Artwork
              artworkKey={album.artworkKey}
              seed={album.id}
              size={150}
              className="album-art"
            />
            <span className="card__title">{album.title}</span>
            <span className="card__subtitle">{album.artist}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export function ArtistsScreen({ onNavigate }: NavProps): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const artists = groupArtists(tracks).filter(
    (artist) => needle === '' || artist.name.toLowerCase().includes(needle),
  )

  if (artists.length === 0 && needle === '') {
    return <EmptyState icon="mic" title="No artists" message="Import music to see artists here." />
  }

  return (
    <>
      <div className="search">
        <input
          type="search"
          value={query}
          placeholder="Search artists"
          aria-label="Search artists"
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </div>
      <div className="row-list">
        {artists.map((artist) => (
          <button
            key={artist.id}
            className="row"
            onClick={() => {
              onNavigate({ kind: 'artist', id: artist.id })
            }}
          >
            <Artwork artworkKey={artist.artworkKey} seed={artist.id} size={52} rounded />
            <span className="row__text">
              <span className="row__title">{artist.name}</span>
              <span className="row__subtitle">
                {formatSongCount(artist.tracks.length)} • {artist.albumCount} album
                {artist.albumCount === 1 ? '' : 's'}
              </span>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        ))}
      </div>
    </>
  )
}

export function GenresScreen({ onNavigate }: NavProps): ReactNode {
  const { library } = useServices()
  const { tracks } = useStore(library)
  const genres = groupGenres(tracks)

  if (genres.length === 0) {
    return (
      <EmptyState
        icon="library"
        title="No genres"
        message="None of your files carry a genre tag."
      />
    )
  }

  return (
    <div className="list-group">
      {genres.map((genre) => (
        <button
          key={genre.name}
          className="list-item"
          onClick={() => {
            onNavigate({ kind: 'genre', name: genre.name })
          }}
        >
          {genre.name}
          <span className="list-item__value">{genre.tracks.length}</span>
          <Icon name="chevron-right" size={16} />
        </button>
      ))}
    </div>
  )
}

/** Folder browser mirroring the structure the files were imported from. */
export function FoldersScreen({
  path,
  onNavigate,
}: NavProps & { readonly path: string }): ReactNode {
  const { library, player } = useServices()
  const { tracks } = useStore(library)
  const playback = useStore(player)
  const [actionsFor, setActionsFor] = useState<string | null>(null)

  const root = buildFolderTree(tracks)
  const node = findNode(root, path)
  if (node === null) {
    return <EmptyState icon="folder" title="Folder gone" message="That folder no longer exists." />
  }
  if (folderTrackCount(node) === 0) {
    return (
      <EmptyState
        icon="folder"
        title="No folders"
        message="Folder structure is only available when the browser lets you pick a directory. On iOS, songs picked individually land here at the top level."
      />
    )
  }

  const actionTrack = node.tracks.find((track) => track.id === actionsFor)

  return (
    <>
      <div className="pill-row">
        <button
          className="pill pill--primary"
          onClick={() => {
            void player.play(folderAllTracks(node))
          }}
        >
          <Icon name="play" size={18} /> Play folder
        </button>
        <button
          className="pill"
          onClick={() => {
            void player.shuffleAll(folderAllTracks(node))
          }}
        >
          <Icon name="shuffle" size={18} /> Shuffle
        </button>
      </div>

      {node.children.length > 0 && (
        <>
          <div className="list-group__label">Folders</div>
          <div className="list-group">
            {node.children.map((child) => (
              <button
                key={child.id}
                className="list-item"
                onClick={() => {
                  onNavigate({ kind: 'folders', path: child.id })
                }}
              >
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                  <Icon name="folder" size={20} />
                </span>
                {child.name}
                <span className="list-item__value">{folderTrackCount(child)}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
        </>
      )}

      {node.tracks.length > 0 && (
        <>
          <div className="list-group__label">Songs</div>
          <div className="row-list">
            {node.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                isCurrent={playback.currentTrack?.id === track.id}
                isPlaying={playback.status === 'playing' && playback.currentTrack?.id === track.id}
                onPlay={() => {
                  void player.play(node.tracks, index)
                }}
                onMore={() => {
                  setActionsFor(track.id)
                }}
              />
            ))}
          </div>
        </>
      )}

      {actionTrack !== undefined && (
        <TrackActions
          tracks={[actionTrack]}
          onClose={() => {
            setActionsFor(null)
          }}
        />
      )}
    </>
  )
}

export function findNode(node: FolderNode, path: string): FolderNode | null {
  if (node.id === path) return node
  for (const child of node.children) {
    const found = findNode(child, path)
    if (found !== null) return found
  }
  return null
}
