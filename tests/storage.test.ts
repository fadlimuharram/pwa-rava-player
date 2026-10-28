import { beforeEach, describe, expect, it } from 'vitest'
import { Database } from '../src/library/db'
import { LibraryStore } from '../src/library/libraryStore'
import { ArtworkCache } from '../src/library/artwork'
import { fileFingerprint, metadataFingerprint } from '../src/library/fingerprint'
import { SettingsStore } from '../src/audio/settings'
import { newId } from '../src/models/types'
import { makeTrack } from './helpers'

let counter = 0
const freshDatabase = (): Promise<Database> => {
  counter += 1
  return Database.open(`rava-test-${counter}-${newId()}`)
}

const freshStore = async (): Promise<{ db: Database; library: LibraryStore }> => {
  const db = await freshDatabase()
  const library = new LibraryStore(db)
  await library.load()
  return { db, library }
}

describe('library store', () => {
  it('reads back an imported track', async () => {
    const { library } = await freshStore()
    const track = makeTrack({ title: 'Hello' })
    library.registerImported(track)
    expect(library.tracks).toHaveLength(1)
    expect(library.track(track.id)?.title).toBe('Hello')
  })

  it('maintains the fingerprint index', async () => {
    const { library } = await freshStore()
    library.registerImported(makeTrack({ fingerprint: 'abc123' }))
    expect(library.hasFingerprint('abc123')).toBe(true)
    expect(library.hasFingerprint('nope')).toBe(false)
  })

  it('preserves the requested order and drops unknown ids', async () => {
    const { library } = await freshStore()
    const first = makeTrack({ title: '1' })
    const second = makeTrack({ title: '2' })
    library.registerImported(first)
    library.registerImported(second)
    expect(library.tracksByIds([second.id, first.id]).map((t) => t.title)).toEqual(['2', '1'])
    expect(library.tracksByIds([newId(), first.id])).toHaveLength(1)
  })

  it('toggles favorites and lists them', async () => {
    const { library } = await freshStore()
    const track = makeTrack()
    library.registerImported(track)
    await library.updateTrack(track)
    await library.toggleFavorite(track.id)
    expect(library.favorites).toHaveLength(1)
    await library.toggleFavorite(track.id)
    expect(library.favorites).toHaveLength(0)
  })

  it('keeps favorites across a reload', async () => {
    const db = await freshDatabase()
    const first = new LibraryStore(db)
    await first.load()
    const track = makeTrack({ isFavorite: true })
    first.registerImported(track)
    await first.updateTrack(track)

    const second = new LibraryStore(db)
    await second.load()
    expect(second.favorites).toHaveLength(1)
  })

  it('ignores a listen that is too short to count', async () => {
    const { library } = await freshStore()
    const track = makeTrack({ duration: 300 })
    library.registerImported(track)
    await library.registerPlay(track.id, 5)
    expect(library.track(track.id)?.playCount).toBe(0)
    expect(library.history()).toHaveLength(0)
  })

  it('records a qualifying listen', async () => {
    const { library } = await freshStore()
    const track = makeTrack({ duration: 300 })
    library.registerImported(track)
    await library.registerPlay(track.id, 120)
    expect(library.track(track.id)?.playCount).toBe(1)
    expect(library.track(track.id)?.lastPlayedAt).not.toBeNull()
    expect(library.history()).toHaveLength(1)
    expect(library.mostPlayed[0]?.id).toBe(track.id)
  })

  it('clears history but keeps favorites', async () => {
    const { library } = await freshStore()
    const track = makeTrack({ duration: 300, isFavorite: true })
    library.registerImported(track)
    await library.updateTrack(track)
    await library.registerPlay(track.id, 200)
    await library.clearHistory()
    expect(library.track(track.id)?.playCount).toBe(0)
    expect(library.track(track.id)?.lastPlayedAt).toBeNull()
    expect(library.history()).toHaveLength(0)
    expect(library.favorites).toHaveLength(1)
  })

  it('persists the resume position', async () => {
    const db = await freshDatabase()
    const first = new LibraryStore(db)
    await first.load()
    const track = makeTrack()
    first.registerImported(track)
    await first.updateTrack(track)
    await first.setResumePosition(track.id, 42.5)

    const second = new LibraryStore(db)
    await second.load()
    expect(second.track(track.id)?.resumePosition).toBeCloseTo(42.5, 3)
  })
})

describe('playlists', () => {
  it('creates, renames and deletes', async () => {
    const { library } = await freshStore()
    const playlist = await library.createPlaylist('Morning')
    expect(library.playlists).toHaveLength(1)
    await library.renamePlaylist(playlist.id, 'Evening')
    expect(library.playlist(playlist.id)?.name).toBe('Evening')
    await library.deletePlaylist(playlist.id)
    expect(library.playlists).toHaveLength(0)
  })

  it('deleting a playlist keeps its tracks', async () => {
    const { library } = await freshStore()
    const track = makeTrack()
    library.registerImported(track)
    await library.updateTrack(track)
    const playlist = await library.createPlaylist('Temp', [track.id])
    await library.deletePlaylist(playlist.id)
    expect(library.tracks).toHaveLength(1)
  })

  it('keeps insertion order and rejects duplicates by default', async () => {
    const { library } = await freshStore()
    const a = makeTrack({ title: 'A' })
    const b = makeTrack({ title: 'B' })
    for (const track of [a, b]) {
      library.registerImported(track)
      await library.updateTrack(track)
    }
    const playlist = await library.createPlaylist('Mix')
    await library.addToPlaylist(playlist.id, [b.id, a.id])
    await library.addToPlaylist(playlist.id, [a.id])
    expect(library.tracksInPlaylist(playlist.id).map((t) => t.title)).toEqual(['B', 'A'])
  })

  it('allows duplicates when asked', async () => {
    const { library } = await freshStore()
    const track = makeTrack()
    library.registerImported(track)
    await library.updateTrack(track)
    const playlist = await library.createPlaylist('Repeat')
    await library.addToPlaylist(playlist.id, [track.id])
    await library.addToPlaylist(playlist.id, [track.id], true)
    expect(library.playlist(playlist.id)?.trackIds).toHaveLength(2)
  })

  it('reorders and removes', async () => {
    const { library } = await freshStore()
    const tracks = [1, 2, 3].map((n) => makeTrack({ title: `T${n}` }))
    for (const track of tracks) {
      library.registerImported(track)
      await library.updateTrack(track)
    }
    const playlist = await library.createPlaylist(
      'Order',
      tracks.map((t) => t.id),
    )
    await library.movePlaylistTrack(playlist.id, 0, 2)
    expect(library.tracksInPlaylist(playlist.id).map((t) => t.title)).toEqual(['T2', 'T3', 'T1'])
    await library.removeFromPlaylist(playlist.id, 1)
    expect(library.tracksInPlaylist(playlist.id).map((t) => t.title)).toEqual(['T2', 'T1'])
  })

  it('lets the same song live in several playlists', async () => {
    const { library } = await freshStore()
    const track = makeTrack()
    library.registerImported(track)
    await library.updateTrack(track)
    const one = await library.createPlaylist('One')
    const two = await library.createPlaylist('Two')
    await library.addToPlaylist(one.id, [track.id])
    await library.addToPlaylist(two.id, [track.id])
    expect(library.tracksInPlaylist(one.id)).toHaveLength(1)
    expect(library.tracksInPlaylist(two.id)).toHaveLength(1)
  })

  it('survives a reload', async () => {
    const db = await freshDatabase()
    const first = new LibraryStore(db)
    await first.load()
    const track = makeTrack()
    first.registerImported(track)
    await first.updateTrack(track)
    await first.createPlaylist('Saved', [track.id])

    const second = new LibraryStore(db)
    await second.load()
    expect(second.playlists[0]?.name).toBe('Saved')
    expect(second.playlists[0]?.trackIds).toEqual([track.id])
  })
})

describe('deleting tracks', () => {
  it('removes the audio blob, history rows and playlist membership', async () => {
    const { db, library } = await freshStore()
    const track = makeTrack({ duration: 300 })
    await db.addTrackWithAudio(track, new Blob([new Uint8Array([1, 2, 3])]))
    library.registerImported(track)
    const playlist = await library.createPlaylist('P', [track.id])
    await library.registerPlay(track.id, 200)

    await library.deleteTracks([track.id])

    expect(library.tracks).toHaveLength(0)
    expect(library.tracksInPlaylist(playlist.id)).toHaveLength(0)
    expect(library.history()).toHaveLength(0)
    expect(await db.audioBlob(track.id)).toBeUndefined()
  })

  it('prunes artwork that nothing references any more', async () => {
    const { db, library } = await freshStore()
    const artwork = new ArtworkCache(db)
    const key = await ArtworkCache.keyFor('Album', 'Artist', 'fallback')
    await artwork.store(key, new Blob([new Uint8Array([9])]))
    const track = makeTrack({ artworkKey: key })
    await db.addTrackWithAudio(track, new Blob([new Uint8Array([1])]))
    library.registerImported(track)

    await library.deleteTracks([track.id])
    expect(await db.artwork(key)).toBeUndefined()
  })

  it('gives every album its own artwork key and every track the same one', async () => {
    const first = await ArtworkCache.keyFor('Discovery', 'Daft Punk', 'x')
    const second = await ArtworkCache.keyFor('discovery', 'daft punk', 'y')
    const other = await ArtworkCache.keyFor('Homework', 'Daft Punk', 'z')
    expect(first).toBe(second)
    expect(first).not.toBe(other)
  })

  it('falls back to the track id when there are no album tags', async () => {
    expect(await ArtworkCache.keyFor('', '', 'track-1')).toBe('track-1')
  })
})

describe('fingerprints', () => {
  it('matches identical content', async () => {
    const payload = new Uint8Array(2000).map((_, i) => i % 251)
    const a = new Blob([payload])
    const b = new Blob([payload])
    expect(await fileFingerprint(a)).toBe(await fileFingerprint(b))
  })

  it('differs for different content', async () => {
    const a = new Blob([new Uint8Array(2000).fill(1)])
    const b = new Blob([new Uint8Array(2000).fill(2)])
    expect(await fileFingerprint(a)).not.toBe(await fileFingerprint(b))
  })

  it('differs for files that only differ at the very end', async () => {
    const size = 256 * 1024 * 3
    const first = new Uint8Array(size).fill(7)
    const second = new Uint8Array(size).fill(7)
    first[size - 1] = 1
    second[size - 1] = 2
    expect(await fileFingerprint(new Blob([first]))).not.toBe(
      await fileFingerprint(new Blob([second])),
    )
  })

  it('folds case and sub-second differences in the metadata fallback', async () => {
    expect(await metadataFingerprint('A', 'B', 'C', 100.4)).toBe(
      await metadataFingerprint('a', 'b', 'c', 100.2),
    )
  })
})

describe('settings', () => {
  let storage: Storage

  beforeEach(() => {
    const map = new Map<string, string>()
    storage = {
      get length() {
        return map.size
      },
      clear: () => {
        map.clear()
      },
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => {
        map.delete(key)
      },
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
    }
  })

  it('has sensible defaults', () => {
    const settings = new SettingsStore(storage)
    expect(settings.state.theme).toBe('system')
    expect(settings.state.resumeOnLaunch).toBe(true)
    expect(settings.state.equalizerEnabled).toBe(false)
    expect(settings.state.playbackSpeed).toBe(1)
  })

  it('persists changes across a reload', () => {
    const settings = new SettingsStore(storage)
    settings.patch({ theme: 'dark', playbackSpeed: 1.5, hapticsEnabled: false })
    const reloaded = new SettingsStore(storage)
    expect(reloaded.state.theme).toBe('dark')
    expect(reloaded.state.playbackSpeed).toBe(1.5)
    expect(reloaded.state.hapticsEnabled).toBe(false)
  })

  it('round-trips custom equalizer presets', () => {
    const settings = new SettingsStore(storage)
    settings.addCustomPreset({
      id: 'custom-1',
      name: 'Mine',
      gains: [3, 0, -3, 0, 0, 0, 0, 0, 0, 0],
      isBuiltIn: false,
    })
    const reloaded = new SettingsStore(storage)
    expect(reloaded.state.customPresets[0]?.name).toBe('Mine')
    expect(reloaded.activePreset.id).toBe('custom-1')
  })

  it('round-trips the saved session', () => {
    const settings = new SettingsStore(storage)
    const ids = ['a', 'b']
    settings.saveSession({
      trackIds: ids,
      currentIndex: 1,
      position: 12.5,
      repeatMode: 'all',
      isShuffled: true,
    })
    const reloaded = new SettingsStore(storage)
    expect(reloaded.state.session?.trackIds).toEqual(ids)
    expect(reloaded.state.session?.currentIndex).toBe(1)
    expect(reloaded.state.session?.repeatMode).toBe('all')
    expect(reloaded.state.session?.isShuffled).toBe(true)
  })

  it('clears the saved session', () => {
    const settings = new SettingsStore(storage)
    settings.saveSession({
      trackIds: ['a'],
      currentIndex: 0,
      position: 0,
      repeatMode: 'off',
      isShuffled: false,
    })
    settings.saveSession(null)
    expect(new SettingsStore(storage).state.session).toBeNull()
  })

  it('survives a storage backend that throws', () => {
    const broken: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const settings = new SettingsStore(broken)
    expect(() => {
      settings.patch({ theme: 'dark' })
    }).not.toThrow()
    expect(settings.state.theme).toBe('dark')
  })

  it('falls back to defaults when stored JSON is corrupt', () => {
    storage.setItem('rava.settings.v1', '{not json')
    expect(new SettingsStore(storage).state.theme).toBe('system')
  })
})
