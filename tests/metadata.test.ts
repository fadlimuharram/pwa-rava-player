import { describe, expect, it } from 'vitest'
import {
  fallbackTitleAndArtist,
  leadingNumber,
  parseAiff,
  parseFlac,
  parseId3,
  parseRiff,
  readTags,
} from '../src/library/metadata'
import { decodeId3Text, synchsafe } from '../src/library/bytes'
import { displayFormat, fileExtension, looksImportable } from '../src/library/probe'
import { buildFlac, buildId3, buildMp4, buildWav, id3Picture, viewToFile } from './helpers'

describe('byte helpers', () => {
  it('decodes synchsafe integers', () => {
    expect(synchsafe(new Uint8Array([0, 0, 2, 1]))).toBe(257)
  })

  it('decodes every ID3 text encoding', () => {
    expect(decodeId3Text(0, new Uint8Array([0x41, 0x42]))).toBe('AB')
    expect(decodeId3Text(3, new TextEncoder().encode('héllo'))).toBe('héllo')
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])
    expect(decodeId3Text(1, utf16)).toBe('AB')
    const utf16be = new Uint8Array([0x00, 0x41, 0x00, 0x42])
    expect(decodeId3Text(2, utf16be)).toBe('AB')
  })
})

describe('ID3v2', () => {
  it('reads the common text frames', () => {
    const view = buildId3([
      { id: 'TIT2', text: 'Veridis Quo' },
      { id: 'TPE1', text: 'Daft Punk' },
      { id: 'TALB', text: 'Discovery' },
      { id: 'TPE2', text: 'Daft Punk' },
      { id: 'TCOM', text: 'Bangalter' },
      { id: 'TRCK', text: '9/14' },
      { id: 'TPOS', text: '1/2' },
      { id: 'TYER', text: '2001' },
    ])
    const tags = parseId3(view)
    expect(tags.title).toBe('Veridis Quo')
    expect(tags.artist).toBe('Daft Punk')
    expect(tags.album).toBe('Discovery')
    expect(tags.albumArtist).toBe('Daft Punk')
    expect(tags.composer).toBe('Bangalter')
    expect(tags.trackNumber).toBe(9)
    expect(tags.discNumber).toBe(1)
    expect(tags.year).toBe(2001)
  })

  it('resolves numeric ID3v1 genre references', () => {
    expect(parseId3(buildId3([{ id: 'TCON', text: '(17)' }])).genre).toBe('Rock')
    expect(parseId3(buildId3([{ id: 'TCON', text: '(17)Soft Rock' }])).genre).toBe('Soft Rock')
    expect(parseId3(buildId3([{ id: 'TCON', text: 'Shoegaze' }])).genre).toBe('Shoegaze')
  })

  it('reads attached pictures', () => {
    const view = buildId3([{ id: 'APIC', raw: id3Picture('image/png', [1, 2, 3, 4]) }])
    const tags = parseId3(view)
    expect(tags.picture?.mimeType).toBe('image/png')
    expect([...(tags.picture?.data ?? [])]).toEqual([1, 2, 3, 4])
  })

  it('reads unsynchronised lyrics past the language code', () => {
    const payload = [3, 0x65, 0x6e, 0x67, 0, ...new TextEncoder().encode('[00:01.00]Hi')]
    const tags = parseId3(buildId3([{ id: 'USLT', raw: payload }]))
    expect(tags.lyrics).toBe('[00:01.00]Hi')
  })

  it('stops cleanly on a truncated tag instead of looping', () => {
    const view = buildId3([{ id: 'TIT2', text: 'Only' }])
    const truncated = new DataView(view.buffer.slice(0, 20))
    expect(() => parseId3(truncated)).not.toThrow()
  })
})

describe('FLAC', () => {
  it('reads Vorbis comments and the stream duration', () => {
    const view = buildFlac(
      ['TITLE=Nightfall', 'ARTIST=Tester', 'ALBUM=Demo', 'TRACKNUMBER=4', 'DATE=1999'],
      48_000,
      96_000,
    )
    const tags = parseFlac(view)
    expect(tags.title).toBe('Nightfall')
    expect(tags.artist).toBe('Tester')
    expect(tags.album).toBe('Demo')
    expect(tags.trackNumber).toBe(4)
    expect(tags.year).toBe(1999)
    expect(tags.duration).toBeCloseTo(2, 3)
  })

  it('is case-insensitive about comment keys', () => {
    expect(parseFlac(buildFlac(['title=lower'])).title).toBe('lower')
  })

  it('ignores comments with no equals sign', () => {
    expect(parseFlac(buildFlac(['BROKEN'])).title).toBeUndefined()
  })
})

describe('RIFF and AIFF', () => {
  it('reads WAV duration and LIST INFO tags', () => {
    const tags = parseRiff(buildWav({ INAM: 'Tone', IART: 'Generator', ICRD: '2024' }, 3))
    expect(tags.title).toBe('Tone')
    expect(tags.artist).toBe('Generator')
    expect(tags.year).toBe(2024)
    expect(tags.duration).toBeCloseTo(3, 2)
  })

  it('does not throw on an AIFF with no chunks it knows', () => {
    const bytes = (value: string): number[] => Array.from(new TextEncoder().encode(value))
    const header = new Uint8Array([...bytes('FORM'), 0, 0, 0, 4, ...bytes('AIFF')])
    expect(() => parseAiff(new DataView(header.buffer))).not.toThrow()
  })
})

describe('MP4', () => {
  it('reads ilst tags and the movie duration', async () => {
    const view = buildMp4({ name: 'Atom Song', artist: 'Container', track: 7 })
    const file = viewToFile(view, 'song.m4a')
    const tags = await readTags(file)
    expect(tags.title).toBe('Atom Song')
    expect(tags.artist).toBe('Container')
    expect(tags.trackNumber).toBe(7)
    expect(tags.duration).toBeCloseTo(5, 3)
  })
})

describe('format dispatch', () => {
  it('routes each container to its own parser', async () => {
    const flac = viewToFile(buildFlac(['TITLE=F']), 'a.flac')
    expect((await readTags(flac)).title).toBe('F')

    const wav = viewToFile(buildWav({ INAM: 'W' }), 'a.wav')
    expect((await readTags(wav)).title).toBe('W')

    const mp3 = viewToFile(buildId3([{ id: 'TIT2', text: 'M' }]), 'a.mp3')
    expect((await readTags(mp3)).title).toBe('M')
  })

  it('returns nothing for a file it cannot recognise', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'a.bin')
    expect(await readTags(junk)).toEqual({})
  })
})

describe('filename fallback', () => {
  it('splits Artist - Title', () => {
    expect(fallbackTitleAndArtist('Daft Punk - Around the World.mp3')).toEqual({
      artist: 'Daft Punk',
      title: 'Around the World',
    })
  })

  it('accepts an en dash', () => {
    expect(fallbackTitleAndArtist('Artist – Title.flac')).toEqual({
      artist: 'Artist',
      title: 'Title',
    })
  })

  it('keeps a plain filename as the title', () => {
    expect(fallbackTitleAndArtist('recording01.wav')).toEqual({
      artist: '',
      title: 'recording01',
    })
  })

  it('keeps later separators in the title', () => {
    expect(fallbackTitleAndArtist('A - B - C.m4a')).toEqual({ artist: 'A', title: 'B - C' })
  })

  it('pulls the leading number out of a track tag', () => {
    expect(leadingNumber('3/12')).toBe(3)
    expect(leadingNumber('no digits')).toBeUndefined()
    expect(leadingNumber('0')).toBeUndefined()
  })
})

describe('extension filter', () => {
  it('accepts what iOS can decode and rejects what it cannot', () => {
    expect(looksImportable('a.MP3')).toBe(true)
    expect(looksImportable('a.flac')).toBe(true)
    expect(looksImportable('a.ogg')).toBe(false)
    expect(looksImportable('a.txt')).toBe(false)
    expect(fileExtension('no-extension')).toBe('')
    expect(displayFormat('song.m4a')).toBe('M4A')
  })
})
