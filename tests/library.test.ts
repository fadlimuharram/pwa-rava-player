import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  folderAllTracks,
  folderTrackCount,
  groupAlbums,
  groupArtists,
  groupGenres,
  searchTracks,
  sortTracks,
} from '../src/models/library'
import { qualifiesAsPlay } from '../src/models/types'
import {
  formatBytes,
  formatDuration,
  formatLongDuration,
  formatSongCount,
} from '../src/util/format'
import { activeLyricIndex, isSynchronized, parseLyrics } from '../src/models/lyrics'
import {
  BUILT_IN_PRESETS,
  EQ_BAND_FREQUENCIES,
  formatFrequency,
  normalizeGains,
} from '../src/models/equalizer'
import { makeTrack } from './helpers'

describe('sorting', () => {
  it('sorts titles naturally', () => {
    const tracks = [
      makeTrack({ title: 'track 10' }),
      makeTrack({ title: 'Track 2' }),
      makeTrack({ title: 'apple' }),
    ]
    expect(sortTracks(tracks, 'titleAsc').map((t) => t.title)).toEqual([
      'apple',
      'Track 2',
      'track 10',
    ])
  })

  it('reverses for descending', () => {
    const tracks = [1, 2, 3, 4, 5].map((n) => makeTrack({ title: `Song ${n}` }))
    const asc = sortTracks(tracks, 'titleAsc').map((t) => t.title)
    expect(sortTracks(tracks, 'titleDesc').map((t) => t.title)).toEqual([...asc].reverse())
  })

  it('puts the newest first for recently added', () => {
    const old = makeTrack({ title: 'Old', addedAt: 1 })
    const fresh = makeTrack({ title: 'New', addedAt: 2 })
    expect(sortTracks([old, fresh], 'recentlyAdded')[0]?.title).toBe('New')
  })

  it('pushes never-played tracks last', () => {
    const played = makeTrack({ title: 'Played', lastPlayedAt: 10 })
    const never = makeTrack({ title: 'Never' })
    expect(sortTracks([never, played], 'recentlyPlayed')[0]?.title).toBe('Played')
  })

  it('sorts by duration both ways', () => {
    const short = makeTrack({ title: 'Short', duration: 30 })
    const long = makeTrack({ title: 'Long', duration: 600 })
    expect(sortTracks([long, short], 'durationAsc')[0]?.title).toBe('Short')
    expect(sortTracks([short, long], 'durationDesc')[0]?.title).toBe('Long')
  })

  it('is stable for equal keys', () => {
    const a = makeTrack({ id: 'a1', title: 'Same' })
    const b = makeTrack({ id: 'b2', title: 'Same' })
    expect(sortTracks([a, b], 'titleAsc').map((t) => t.id)).toEqual(
      sortTracks([b, a], 'titleAsc').map((t) => t.id),
    )
  })
})

describe('search', () => {
  const tracks = [
    makeTrack({ title: 'Blue Monday', artist: 'New Order', album: 'Power' }),
    makeTrack({ title: 'Sunrise', artist: 'Norah Jones', album: 'Come Away' }),
    makeTrack({ title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue' }),
  ]

  it('returns everything for an empty query', () => {
    expect(searchTracks(tracks, '   ')).toHaveLength(3)
  })

  it('matches title, artist and album', () => {
    expect(searchTracks(tracks, 'blue')).toHaveLength(2)
    expect(searchTracks(tracks, 'norah')).toHaveLength(1)
    expect(searchTracks(tracks, 'kind of blue')).toHaveLength(1)
  })

  it('requires every term to match', () => {
    expect(searchTracks(tracks, 'blue miles')).toHaveLength(1)
    expect(searchTracks(tracks, 'blue nothing')).toHaveLength(0)
  })

  it('ignores case', () => {
    expect(searchTracks(tracks, 'BLUE MONDAY')).toHaveLength(1)
  })
})

describe('grouping', () => {
  it('keeps same-titled albums by different artists separate', () => {
    const tracks = [
      makeTrack({ artist: 'X', album: 'One' }),
      makeTrack({ artist: 'X', album: 'One' }),
      makeTrack({ artist: 'Y', album: 'One' }),
    ]
    expect(groupAlbums(tracks)).toHaveLength(2)
  })

  it('counts albums per artist', () => {
    const tracks = [
      makeTrack({ artist: 'X', album: 'One' }),
      makeTrack({ artist: 'X', album: 'Two' }),
    ]
    expect(groupArtists(tracks)[0]?.albumCount).toBe(2)
  })

  it('prefers the album artist for grouping', () => {
    const tracks = [
      makeTrack({ artist: 'Guest', albumArtist: 'Main', album: 'Split' }),
      makeTrack({ artist: 'Main', album: 'Split' }),
    ]
    expect(groupArtists(tracks)).toHaveLength(1)
  })

  it('skips untagged genres', () => {
    const genres = groupGenres([makeTrack({ genre: 'Jazz' }), makeTrack({ genre: '' })])
    expect(genres).toHaveLength(1)
    expect(genres[0]?.name).toBe('Jazz')
  })
})

describe('folder tree', () => {
  it('nests folders', () => {
    const root = buildFolderTree([
      makeTrack({ title: 'A', folderPath: 'Music/Rock' }),
      makeTrack({ title: 'B', folderPath: 'Music/Rock/Live' }),
      makeTrack({ title: 'C', folderPath: 'Music' }),
    ])
    expect(folderTrackCount(root)).toBe(3)
    const music = root.children.find((node) => node.name === 'Music')
    expect(music?.tracks).toHaveLength(1)
    const rock = music?.children.find((node) => node.name === 'Rock')
    expect(rock?.tracks).toHaveLength(1)
    expect(rock?.children[0]?.name).toBe('Live')
    expect(folderTrackCount(rock!)).toBe(2)
  })

  it('puts tracks without a folder at the root', () => {
    const root = buildFolderTree([makeTrack({ folderPath: '' })])
    expect(root.tracks).toHaveLength(1)
    expect(root.children).toHaveLength(0)
  })

  it('walks the whole subtree', () => {
    const root = buildFolderTree([
      makeTrack({ folderPath: 'Root/One' }),
      makeTrack({ folderPath: 'Root/Two' }),
    ])
    expect(folderAllTracks(root)).toHaveLength(2)
  })
})

describe('play count rule', () => {
  it('does not count pressing play', () => {
    expect(qualifiesAsPlay(0, 200)).toBe(false)
    expect(qualifiesAsPlay(3, 200)).toBe(false)
  })

  it('counts half of a short song', () => {
    expect(qualifiesAsPlay(60, 120)).toBe(true)
  })

  it('counts sixty seconds of a long song', () => {
    expect(qualifiesAsPlay(60, 600)).toBe(true)
    expect(qualifiesAsPlay(59, 600)).toBe(false)
  })

  it('requires very short tracks to be nearly finished', () => {
    expect(qualifiesAsPlay(12, 20)).toBe(false)
    expect(qualifiesAsPlay(19, 20)).toBe(true)
  })

  it('never counts a zero-length track', () => {
    expect(qualifiesAsPlay(10, 0)).toBe(false)
  })
})

describe('formatters', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3753)).toBe('1:02:33')
  })

  it('uses a placeholder for invalid durations', () => {
    expect(formatDuration(Number.NaN)).toBe('--:--')
    expect(formatDuration(-5)).toBe('--:--')
  })

  it('formats long durations', () => {
    expect(formatLongDuration(0)).toBe('0 min')
    expect(formatLongDuration(90)).toBe('1 min')
    expect(formatLongDuration(4320)).toBe('1 hr 12 min')
    expect(formatLongDuration(7200)).toBe('2 hr')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('pluralises song counts', () => {
    expect(formatSongCount(1)).toBe('1 song')
    expect(formatSongCount(4)).toBe('4 songs')
  })
})

describe('lyrics', () => {
  it('keeps plain lines', () => {
    const lines = parseLyrics('First line\n\nSecond line')
    expect(lines.map((l) => l.text)).toEqual(['First line', 'Second line'])
    expect(isSynchronized(lines)).toBe(false)
  })

  it('parses LRC timestamps', () => {
    const lines = parseLyrics('[00:12.50]Hello\n[01:05.00]World')
    expect(isSynchronized(lines)).toBe(true)
    expect(lines).toHaveLength(2)
    expect(lines[0]?.timestamp).toBeCloseTo(12.5, 3)
    expect(lines[1]?.timestamp).toBeCloseTo(65, 3)
  })

  it('expands repeated timestamps on one line', () => {
    const lines = parseLyrics('[00:10.00][00:40.00]Chorus')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.text)).toEqual(['Chorus', 'Chorus'])
  })

  it('drops metadata tags', () => {
    expect(parseLyrics('[ti:Song]\n[ar:Artist]\nPlain line').map((l) => l.text)).toEqual([
      'Plain line',
    ])
  })

  it('tracks the active line', () => {
    const lines = parseLyrics('[00:00.00]A\n[00:10.00]B\n[00:20.00]C')
    expect(activeLyricIndex(lines, 0)).toBe(0)
    expect(activeLyricIndex(lines, 15)).toBe(1)
    expect(activeLyricIndex(lines, 99)).toBe(2)
  })
})

describe('equalizer presets', () => {
  it('pads short gain lists', () => {
    const gains = normalizeGains([1, 2])
    expect(gains).toHaveLength(EQ_BAND_FREQUENCIES.length)
    expect(gains[2]).toBe(0)
  })

  it('clamps out-of-range gains', () => {
    expect(normalizeGains(Array<number>(10).fill(99)).every((g) => g === 12)).toBe(true)
  })

  it('ships well-formed built-ins', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.gains).toHaveLength(EQ_BAND_FREQUENCIES.length)
      expect(preset.isBuiltIn).toBe(true)
    }
  })

  it('formats frequency labels', () => {
    expect(formatFrequency(500)).toBe('500')
    expect(formatFrequency(16000)).toBe('16k')
  })
})
