import { newId, type Track } from '../src/models/types'

export function makeTrack(overrides: Partial<Track> = {}): Track {
  const title = overrides.title ?? 'Song'
  return {
    id: overrides.id ?? newId(),
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: '',
    genre: '',
    composer: '',
    year: 2020,
    trackNumber: 1,
    discNumber: 1,
    duration: 180,
    fileName: `${title}.mp3`,
    fileFormat: 'MP3',
    folderPath: '',
    fingerprint: newId(),
    byteSize: 1024,
    addedAt: 1_700_000_000_000,
    lastPlayedAt: null,
    playCount: 0,
    isFavorite: false,
    artworkKey: null,
    resumePosition: 0,
    lyrics: '',
    storage: 'indexeddb',
    ...overrides,
  }
}

/** Deterministic generator so shuffle tests assert a fixed permutation instead of luck. */
export function seededRng(seed: number): () => number {
  let state = seed === 0 ? 0x9e3779b9 : seed
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}

// ---------------------------------------------------------------------------
// Synthetic tag containers, so the parsers are tested against real byte layouts
// ---------------------------------------------------------------------------

/**
 * Wraps a built container in a File.
 *
 * `DataView.buffer` is `ArrayBufferLike`, which TypeScript will not accept as a `BlobPart`
 * because it could be a `SharedArrayBuffer`. Copying into a fresh array settles the type and
 * detaches the test data from the builder's buffer.
 */
export function viewToFile(view: DataView, name: string): File {
  const bytes = new Uint8Array(view.byteLength)
  for (let i = 0; i < view.byteLength; i += 1) bytes[i] = view.getUint8(i)
  return new File([bytes], name)
}

/**
 * One byte per character, Latin-1 style.
 *
 * Container type codes are raw bytes, not UTF-8: an MP4 tag atom is literally `0xA9 n a m`.
 * Running it through a UTF-8 encoder would turn `©` into two bytes and shift the whole atom.
 */
const ascii = (value: string): number[] => Array.from(value, (char) => char.charCodeAt(0) & 0xff)

const synchsafeBytes = (size: number): number[] => [
  (size >> 21) & 0x7f,
  (size >> 14) & 0x7f,
  (size >> 7) & 0x7f,
  size & 0x7f,
]

const be32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]

const le32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
]

export interface Id3Frame {
  id: string
  /** UTF-8 text payload; the encoding byte is added automatically. */
  text?: string
  raw?: number[]
}

/** Builds a valid ID3v2.3 tag followed by a byte of filler. */
export function buildId3(frames: Id3Frame[]): DataView {
  const body: number[] = []
  for (const frame of frames) {
    const payload = frame.raw ?? [3, ...new TextEncoder().encode(frame.text ?? '')]
    body.push(...ascii(frame.id), ...be32(payload.length), 0, 0, ...payload)
  }
  const bytes = [...ascii('ID3'), 3, 0, 0, ...synchsafeBytes(body.length), ...body, 0xff]
  return new DataView(new Uint8Array(bytes).buffer)
}

export function id3Picture(mime: string, data: number[]): number[] {
  return [3, ...ascii(mime), 0, 3, 0, ...data]
}

/** FLAC with a STREAMINFO block and a Vorbis comment block. */
export function buildFlac(
  comments: string[],
  sampleRate = 44_100,
  totalSamples = 441_000,
): DataView {
  const streamInfo = new Uint8Array(34)
  // Bytes 10..17 pack sample rate (20 bits), channels (3), bit depth (5) and sample count (36).
  streamInfo[10] = (sampleRate >> 12) & 0xff
  streamInfo[11] = (sampleRate >> 4) & 0xff
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | (Math.floor(totalSamples / 0x1_00_00_00_00) & 0x0f)
  streamInfo[13] = (totalSamples >>> 24) & 0xff
  streamInfo[14] = (totalSamples >>> 16) & 0xff
  streamInfo[15] = (totalSamples >>> 8) & 0xff
  streamInfo[16] = totalSamples & 0xff

  const vendor = new TextEncoder().encode('test')
  const comment: number[] = [...le32(vendor.length), ...vendor, ...le32(comments.length)]
  for (const entry of comments) {
    const encoded = new TextEncoder().encode(entry)
    comment.push(...le32(encoded.length), ...encoded)
  }

  const bytes = [
    ...ascii('fLaC'),
    0x00,
    ...be32(streamInfo.length).slice(1),
    ...streamInfo,
    0x84,
    ...be32(comment.length).slice(1),
    ...comment,
  ]
  return new DataView(new Uint8Array(bytes).buffer)
}

/** RIFF/WAVE with a fmt chunk, a data chunk and a LIST/INFO chunk. */
export function buildWav(info: Record<string, string>, seconds = 2): DataView {
  const byteRate = 44_100 * 2 * 2
  const dataSize = byteRate * seconds
  const fmt = [
    ...ascii('fmt '),
    ...le32(16),
    1,
    0,
    2,
    0,
    ...le32(44_100),
    ...le32(byteRate),
    4,
    0,
    16,
    0,
  ]

  const infoBody: number[] = [...ascii('INFO')]
  for (const [key, value] of Object.entries(info)) {
    const encoded = [...ascii(value), 0]
    if (encoded.length % 2 === 1) encoded.push(0)
    infoBody.push(...ascii(key), ...le32(encoded.length), ...encoded)
  }
  const list = [...ascii('LIST'), ...le32(infoBody.length), ...infoBody]
  const data = [...ascii('data'), ...le32(dataSize)]

  const body = [...ascii('WAVE'), ...fmt, ...list, ...data]
  return new DataView(new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]).buffer)
}

/** Minimal MP4 with ftyp, mvhd and an ilst carrying a few tags. */
export function buildMp4(tags: { name?: string; artist?: string; track?: number }): DataView {
  const atom = (type: string, payload: number[]): number[] => [
    ...be32(payload.length + 8),
    ...ascii(type),
    ...payload,
  ]
  const dataAtom = (payload: number[], wellKnown = 1): number[] =>
    atom('data', [...be32(wellKnown), ...be32(0), ...payload])

  const items: number[] = []
  if (tags.name !== undefined) {
    items.push(...atom('©nam', dataAtom([...new TextEncoder().encode(tags.name)])))
  }
  if (tags.artist !== undefined) {
    items.push(...atom('©ART', dataAtom([...new TextEncoder().encode(tags.artist)])))
  }
  if (tags.track !== undefined) {
    items.push(...atom('trkn', dataAtom([0, 0, 0, tags.track, 0, 0], 0)))
  }

  const mvhd = atom('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(1000), ...be32(5000)])
  const ilst = atom('ilst', items)
  const meta = atom('meta', [0, 0, 0, 0, ...ilst])
  const udta = atom('udta', meta)
  const moov = atom('moov', [...mvhd, ...udta])
  const ftyp = atom('ftyp', ascii('M4A isom'))

  return new DataView(new Uint8Array([...ftyp, ...moov]).buffer)
}
