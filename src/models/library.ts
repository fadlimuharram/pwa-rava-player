import { albumKey, groupingArtist, type Track, type TrackSortOption } from './types'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Keeps equal keys in a stable, reproducible order instead of leaving it to the engine. */
const byKeyThenId = (a: Track, b: Track, compare: (a: Track, b: Track) => number): number => {
  const result = compare(a, b)
  return result !== 0 ? result : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function sortTracks(tracks: readonly Track[], option: TrackSortOption): Track[] {
  const list = [...tracks]
  switch (option) {
    case 'titleAsc':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => collator.compare(x.title, y.title)))
    case 'titleDesc':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => collator.compare(y.title, x.title)))
    case 'artist':
      return list.sort((a, b) =>
        byKeyThenId(
          a,
          b,
          (x, y) =>
            collator.compare(groupingArtist(x), groupingArtist(y)) ||
            collator.compare(x.album, y.album) ||
            x.discNumber - y.discNumber ||
            x.trackNumber - y.trackNumber,
        ),
      )
    case 'album':
      return list.sort((a, b) =>
        byKeyThenId(
          a,
          b,
          (x, y) =>
            collator.compare(x.album, y.album) ||
            x.discNumber - y.discNumber ||
            x.trackNumber - y.trackNumber ||
            collator.compare(x.title, y.title),
        ),
      )
    case 'recentlyAdded':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => y.addedAt - x.addedAt))
    case 'recentlyPlayed':
      return list.sort((a, b) =>
        byKeyThenId(a, b, (x, y) => (y.lastPlayedAt ?? 0) - (x.lastPlayedAt ?? 0)),
      )
    case 'mostPlayed':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => y.playCount - x.playCount))
    case 'durationAsc':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => x.duration - y.duration))
    case 'durationDesc':
      return list.sort((a, b) => byKeyThenId(a, b, (x, y) => y.duration - x.duration))
  }
}

/** Every word in the query has to match somewhere in the track. */
export function searchTracks(tracks: readonly Track[], query: string): Track[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') return [...tracks]
  const needles = trimmed.split(/\s+/)
  return tracks.filter((track) => {
    const haystack = [
      track.title,
      track.artist,
      track.album,
      track.albumArtist,
      track.fileName,
      track.genre,
    ]
      .join(' ')
      .toLowerCase()
    return needles.every((needle) => haystack.includes(needle))
  })
}

export interface AlbumGroup {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly tracks: Track[]
  readonly artworkKey: string | null
}

export interface ArtistGroup {
  readonly id: string
  readonly name: string
  readonly tracks: Track[]
  readonly albumCount: number
  readonly artworkKey: string | null
}

const firstArtwork = (tracks: readonly Track[]): string | null =>
  tracks.find((track) => track.artworkKey !== null)?.artworkKey ?? null

export function groupAlbums(tracks: readonly Track[]): AlbumGroup[] {
  const buckets = new Map<string, Track[]>()
  for (const track of tracks) {
    const key = albumKey(track)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(track)
    else buckets.set(key, [track])
  }
  return [...buckets.entries()]
    .map(([key, value]) => {
      const sorted = sortTracks(value, 'album')
      const first = sorted[0]
      return {
        id: key,
        title: first && first.album !== '' ? first.album : 'Unknown Album',
        artist: first && groupingArtist(first) !== '' ? groupingArtist(first) : 'Unknown Artist',
        tracks: sorted,
        artworkKey: firstArtwork(sorted),
      }
    })
    .sort((a, b) => collator.compare(a.title, b.title))
}

export function groupArtists(tracks: readonly Track[]): ArtistGroup[] {
  const buckets = new Map<string, Track[]>()
  for (const track of tracks) {
    const key = groupingArtist(track).toLowerCase()
    const bucket = buckets.get(key)
    if (bucket) bucket.push(track)
    else buckets.set(key, [track])
  }
  return [...buckets.entries()]
    .map(([key, value]) => {
      const sorted = sortTracks(value, 'album')
      const first = sorted[0]
      const name = first ? groupingArtist(first) : ''
      return {
        id: key,
        name: name === '' ? 'Unknown Artist' : name,
        tracks: sorted,
        albumCount: new Set(sorted.map(albumKey)).size,
        artworkKey: firstArtwork(sorted),
      }
    })
    .sort((a, b) => collator.compare(a.name, b.name))
}

export function groupGenres(tracks: readonly Track[]): { name: string; tracks: Track[] }[] {
  const buckets = new Map<string, Track[]>()
  for (const track of tracks) {
    if (track.genre.trim() === '') continue
    const bucket = buckets.get(track.genre)
    if (bucket) bucket.push(track)
    else buckets.set(track.genre, [track])
  }
  return [...buckets.entries()]
    .map(([name, value]) => ({ name, tracks: sortTracks(value, 'album') }))
    .sort((a, b) => collator.compare(a.name, b.name))
}

export interface FolderNode {
  readonly id: string
  readonly name: string
  readonly children: FolderNode[]
  readonly tracks: Track[]
}

export const folderTrackCount = (node: FolderNode): number =>
  node.tracks.length + node.children.reduce((total, child) => total + folderTrackCount(child), 0)

/** Every track in this folder and below, in folder order — what "play folder" uses. */
export const folderAllTracks = (node: FolderNode): Track[] => [
  ...node.tracks,
  ...node.children.flatMap(folderAllTracks),
]

export function buildFolderTree(tracks: readonly Track[]): FolderNode {
  const root: FolderNode = { id: '/', name: 'Library', children: [], tracks: [] }

  for (const track of tracks) {
    const parts = track.folderPath.split('/').filter((part) => part !== '')
    let node = root
    let prefix = ''
    for (const part of parts) {
      prefix = `${prefix}/${part}`
      const path = prefix
      let child = node.children.find((candidate) => candidate.id === path)
      if (!child) {
        child = { id: path, name: part, children: [], tracks: [] }
        node.children.push(child)
      }
      node = child
    }
    node.tracks.push(track)
  }

  const sortNode = (node: FolderNode): void => {
    node.children.sort((a, b) => collator.compare(a.name, b.name))
    node.tracks.splice(0, node.tracks.length, ...sortTracks(node.tracks, 'album'))
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}
