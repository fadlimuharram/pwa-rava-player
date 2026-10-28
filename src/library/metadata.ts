import {
  ByteReader,
  bytesStartWith,
  decodeId3Text,
  decodeUtf8,
  latin1,
  readFileSlice,
  synchsafe,
  trimNulls,
} from './bytes'

export interface EmbeddedPicture {
  readonly mimeType: string
  readonly data: Uint8Array
}

export interface ExtractedMetadata {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  composer?: string
  year?: number
  trackNumber?: number
  discNumber?: number
  /** Only set by containers that state it exactly (FLAC, WAV, MP4). */
  duration?: number
  picture?: EmbeddedPicture
  lyrics?: string
}

/**
 * How much of the file to read for tags.
 *
 * ID3 and FLAC put their tags at the front, and an embedded cover is rarely above a megabyte.
 * MP4 is the exception — `moov` can sit at either end — so that parser asks for a tail slice
 * of its own rather than making every format pay for it.
 */
const HEAD_BYTES = 2 * 1024 * 1024
const TAIL_BYTES = 2 * 1024 * 1024

export async function readTags(file: File): Promise<ExtractedMetadata> {
  const head = await readFileSlice(file, 0, Math.min(HEAD_BYTES, file.size))

  if (bytesStartWith(head, 0, 'fLaC')) return parseFlac(head)
  if (bytesStartWith(head, 0, 'RIFF') && bytesStartWith(head, 8, 'WAVE')) return parseRiff(head)
  if (bytesStartWith(head, 0, 'FORM')) return parseAiff(head)
  if (bytesStartWith(head, 4, 'ftyp')) return parseMp4(file, head)
  if (bytesStartWith(head, 0, 'ID3')) return parseId3(head)

  // Some encoders put ID3 after a leading chunk; a short scan finds it without a full read.
  for (let offset = 0; offset < Math.min(head.byteLength - 3, 64 * 1024); offset += 1) {
    if (bytesStartWith(head, offset, 'ID3')) {
      return parseId3(head, offset)
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// ID3v2 (MP3, and anything else that prepends a tag)
// ---------------------------------------------------------------------------

const ID3_TEXT_FRAMES: Record<string, keyof ExtractedMetadata> = {
  TIT2: 'title',
  TT2: 'title',
  TPE1: 'artist',
  TP1: 'artist',
  TALB: 'album',
  TAL: 'album',
  TPE2: 'albumArtist',
  TP2: 'albumArtist',
  TCON: 'genre',
  TCO: 'genre',
  TCOM: 'composer',
  TCM: 'composer',
}

export function parseId3(view: DataView, start = 0): ExtractedMetadata {
  const result: ExtractedMetadata = {}
  const reader = new ByteReader(view)
  reader.seek(start + 3)

  const majorVersion = reader.u8()
  reader.skip(1) // revision
  const flags = reader.u8()
  const tagSize = synchsafe(reader.bytes(4))
  const tagEnd = Math.min(start + 10 + tagSize, view.byteLength)

  // An extended header sits between the header and the first frame.
  if ((flags & 0x40) !== 0) {
    const extendedSize = majorVersion >= 4 ? synchsafe(reader.bytes(4)) : reader.u32() + 4
    reader.skip(Math.max(0, extendedSize - 4))
  }

  const idLength = majorVersion <= 2 ? 3 : 4

  while (reader.position + idLength + (idLength === 3 ? 3 : 6) <= tagEnd) {
    const frameId = reader.ascii(idLength)
    if (frameId.trim() === '' || frameId.charCodeAt(0) === 0) break

    let frameSize: number
    if (idLength === 3) {
      frameSize = reader.u24()
    } else {
      // Only v2.4 declares synchsafe frame sizes; v2.3 writes a plain integer.
      frameSize = majorVersion >= 4 ? synchsafe(reader.bytes(4)) : reader.u32()
      reader.skip(2) // frame flags
    }
    if (frameSize <= 0 || reader.position + frameSize > tagEnd) break

    const payload = reader.bytes(frameSize)
    applyId3Frame(result, frameId, payload)
  }
  return result
}

function applyId3Frame(result: ExtractedMetadata, frameId: string, payload: Uint8Array): void {
  const textKey = ID3_TEXT_FRAMES[frameId]
  if (textKey !== undefined) {
    const value = decodeId3Text(payload[0] ?? 0, payload.subarray(1))
    if (value !== '') assignString(result, textKey, cleanGenre(frameId, value))
    return
  }

  switch (frameId) {
    case 'TRCK':
    case 'TRK': {
      setNumber(
        result,
        'trackNumber',
        leadingNumber(decodeId3Text(payload[0] ?? 0, payload.subarray(1))),
      )
      return
    }
    case 'TPOS':
    case 'TPA': {
      setNumber(
        result,
        'discNumber',
        leadingNumber(decodeId3Text(payload[0] ?? 0, payload.subarray(1))),
      )
      return
    }
    case 'TYER':
    case 'TYE':
    case 'TDRC':
    case 'TDRL': {
      setNumber(result, 'year', leadingNumber(decodeId3Text(payload[0] ?? 0, payload.subarray(1))))
      return
    }
    case 'USLT':
    case 'ULT': {
      if (result.lyrics !== undefined) return
      const encoding = payload[0] ?? 0
      let cursor = 4 // encoding byte + 3-character language code
      cursor = skipTerminator(payload, cursor, encoding)
      result.lyrics = decodeId3Text(encoding, payload.subarray(cursor))
      return
    }
    case 'APIC': {
      if (result.picture !== undefined) return
      const encoding = payload[0] ?? 0
      let cursor = 1
      const mimeEnd = indexOfByte(payload, 0, cursor)
      const mimeType = latin1(payload.subarray(cursor, mimeEnd)) || 'image/jpeg'
      cursor = mimeEnd + 1
      cursor += 1 // picture type
      cursor = skipTerminator(payload, cursor, encoding)
      result.picture = { mimeType, data: payload.subarray(cursor) }
      return
    }
    case 'PIC': {
      if (result.picture !== undefined) return
      const encoding = payload[0] ?? 0
      let cursor = 1
      const format = latin1(payload.subarray(cursor, cursor + 3)).toLowerCase()
      cursor += 3
      cursor += 1 // picture type
      cursor = skipTerminator(payload, cursor, encoding)
      result.picture = {
        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
        data: payload.subarray(cursor),
      }
      return
    }
    default:
      return
  }
}

/** `(17)` and `(17)Rock` are legal ID3v1-style genre references inside a v2 text frame. */
function cleanGenre(frameId: string, value: string): string {
  if (frameId !== 'TCON' && frameId !== 'TCO') return value
  const named = /^\((\d+)\)(.*)$/.exec(value)
  if (named === null) return value
  const trailing = (named[2] ?? '').trim()
  if (trailing !== '') return trailing
  return ID3V1_GENRES[Number(named[1])] ?? value
}

const indexOfByte = (bytes: Uint8Array, needle: number, from: number): number => {
  for (let i = from; i < bytes.length; i += 1) if (bytes[i] === needle) return i
  return bytes.length
}

/** UTF-16 strings are terminated by two null bytes, everything else by one. */
function skipTerminator(bytes: Uint8Array, from: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = from; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2
    }
    return bytes.length
  }
  return Math.min(indexOfByte(bytes, 0, from) + 1, bytes.length)
}

// ---------------------------------------------------------------------------
// MP4 / M4A
// ---------------------------------------------------------------------------

const MP4_KEYS: Record<string, keyof ExtractedMetadata> = {
  '©nam': 'title',
  '©ART': 'artist',
  '©alb': 'album',
  aART: 'albumArtist',
  '©gen': 'genre',
  '©wrt': 'composer',
  '©lyr': 'lyrics',
}

export async function parseMp4(file: File, head: DataView): Promise<ExtractedMetadata> {
  const result = scanMp4(head, 0, head.byteLength, {})
  if (result.title !== undefined || result.duration !== undefined) return result

  // Faststart files keep `moov` at the front; the rest keep it at the very end.
  if (file.size > head.byteLength) {
    const tailStart = Math.max(0, file.size - TAIL_BYTES)
    const tail = await readFileSlice(file, tailStart, file.size)
    return scanMp4(tail, 0, tail.byteLength, result)
  }
  return result
}

const MP4_CONTAINERS = new Set(['moov', 'udta', 'trak', 'mdia', 'ilst'])

function scanMp4(
  view: DataView,
  start: number,
  end: number,
  result: ExtractedMetadata,
): ExtractedMetadata {
  let cursor = start
  while (cursor + 8 <= end) {
    const reader = new ByteReader(view)
    reader.seek(cursor)
    let size = reader.u32()
    const type = reader.ascii(4)
    let bodyStart = cursor + 8

    if (size === 1) {
      if (bodyStart + 8 > end) break
      size = reader.u64()
      bodyStart += 8
    }
    if (size < 8) break
    const bodyEnd = Math.min(cursor + size, end)

    if (MP4_CONTAINERS.has(type)) {
      scanMp4(view, bodyStart, bodyEnd, result)
    } else if (type === 'meta') {
      // `meta` is a full box: four bytes of version/flags before its children.
      scanMp4(view, bodyStart + 4, bodyEnd, result)
    } else if (type === 'mvhd') {
      readMvhd(view, bodyStart, result)
    } else if (
      type.startsWith('©') ||
      type === 'aART' ||
      type === 'trkn' ||
      type === 'disk' ||
      type === 'covr' ||
      type === 'gnre'
    ) {
      readIlstItem(view, type, bodyStart, bodyEnd, result)
    }
    cursor += size
  }
  return result
}

function readMvhd(view: DataView, start: number, result: ExtractedMetadata): void {
  if (result.duration !== undefined) return
  const reader = new ByteReader(view)
  reader.seek(start)
  const version = reader.u8()
  reader.skip(3) // flags
  let timescale: number
  let duration: number
  if (version === 1) {
    reader.skip(16) // creation + modification time
    timescale = reader.u32()
    duration = reader.u64()
  } else {
    reader.skip(8)
    timescale = reader.u32()
    duration = reader.u32()
  }
  if (timescale > 0 && duration > 0) result.duration = duration / timescale
}

function readIlstItem(
  view: DataView,
  type: string,
  start: number,
  end: number,
  result: ExtractedMetadata,
): void {
  const reader = new ByteReader(view)
  reader.seek(start)
  if (start + 8 > end) return
  const dataSize = reader.u32()
  const dataType = reader.ascii(4)
  if (dataType !== 'data' || dataSize < 16) return

  const wellKnownType = reader.u32() & 0x00ff_ffff
  reader.skip(4) // locale
  const payloadLength = Math.min(dataSize - 16, end - reader.position)
  const payload = reader.bytes(payloadLength)

  if (type === 'covr') {
    if (result.picture === undefined) {
      result.picture = {
        mimeType: wellKnownType === 14 ? 'image/png' : 'image/jpeg',
        data: payload,
      }
    }
    return
  }

  if (type === 'trkn' || type === 'disk') {
    // Both are a pair of 16-bit numbers: index then total, after two reserved bytes.
    const index = payload.length >= 4 ? ((payload[2] ?? 0) << 8) | (payload[3] ?? 0) : 0
    if (index > 0) {
      if (type === 'trkn') result.trackNumber ??= index
      else result.discNumber ??= index
    }
    return
  }

  if (type === 'gnre') {
    const code = payload.length >= 2 ? ((payload[0] ?? 0) << 8) | (payload[1] ?? 0) : 0
    const name = ID3V1_GENRES[code - 1]
    if (name !== undefined) result.genre ??= name
    return
  }

  const value = decodeUtf8(payload)
  if (value === '') return
  if (type === '©day') {
    setNumber(result, 'year', leadingNumber(value))
    return
  }
  const key = MP4_KEYS[type]
  if (key !== undefined) assignString(result, key, value)
}

// ---------------------------------------------------------------------------
// FLAC
// ---------------------------------------------------------------------------

const VORBIS_KEYS: Record<string, keyof ExtractedMetadata> = {
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUM: 'album',
  ALBUMARTIST: 'albumArtist',
  'ALBUM ARTIST': 'albumArtist',
  GENRE: 'genre',
  COMPOSER: 'composer',
  LYRICS: 'lyrics',
  UNSYNCEDLYRICS: 'lyrics',
}

export function parseFlac(view: DataView): ExtractedMetadata {
  const result: ExtractedMetadata = {}
  const reader = new ByteReader(view)
  reader.seek(4)

  while (reader.remaining > 4) {
    const header = reader.u8()
    const isLast = (header & 0x80) !== 0
    const blockType = header & 0x7f
    const length = reader.u24()
    if (length > reader.remaining) break
    const blockStart = reader.position

    if (blockType === 0) readFlacStreamInfo(view, blockStart, result)
    else if (blockType === 4) readVorbisComment(view, blockStart, length, result)
    else if (blockType === 6) readFlacPicture(view, blockStart, result)

    reader.seek(blockStart + length)
    if (isLast) break
  }
  return result
}

function readFlacStreamInfo(view: DataView, start: number, result: ExtractedMetadata): void {
  if (start + 18 > view.byteLength) return
  // Sample rate is 20 bits and total samples 36 bits, both unaligned, so they are assembled
  // by hand from bytes 10..17 of the block.
  const b = (offset: number): number => view.getUint8(start + offset)
  const sampleRate = (b(10) << 12) | (b(11) << 4) | (b(12) >> 4)
  const totalSamples =
    b(13) * 0x1_00_00_00 + (b(14) << 16) + (b(15) << 8) + b(16) + (b(12) & 0x0f) * 0x1_00_00_00_00
  if (sampleRate > 0 && totalSamples > 0) result.duration = totalSamples / sampleRate
}

function readVorbisComment(
  view: DataView,
  start: number,
  length: number,
  result: ExtractedMetadata,
): void {
  const reader = new ByteReader(view)
  reader.seek(start)
  const vendorLength = reader.u32(true)
  reader.skip(vendorLength)
  const count = reader.u32(true)
  const end = start + length

  for (let i = 0; i < count && reader.position + 4 <= end; i += 1) {
    const itemLength = reader.u32(true)
    if (itemLength > reader.remaining) break
    const text = decodeUtf8(reader.bytes(itemLength))
    const separator = text.indexOf('=')
    if (separator < 0) continue
    const key = text.slice(0, separator).toUpperCase()
    const value = text.slice(separator + 1).trim()
    if (value === '') continue

    if (key === 'TRACKNUMBER') setNumber(result, 'trackNumber', leadingNumber(value))
    else if (key === 'DISCNUMBER') setNumber(result, 'discNumber', leadingNumber(value))
    else if (key === 'DATE' || key === 'YEAR') setNumber(result, 'year', leadingNumber(value))
    else {
      const mapped = VORBIS_KEYS[key]
      if (mapped !== undefined) assignString(result, mapped, value)
    }
  }
}

function readFlacPicture(view: DataView, start: number, result: ExtractedMetadata): void {
  if (result.picture !== undefined) return
  const reader = new ByteReader(view)
  reader.seek(start)
  reader.skip(4) // picture type
  const mimeLength = reader.u32()
  const mimeType = reader.ascii(mimeLength) || 'image/jpeg'
  const descriptionLength = reader.u32()
  reader.skip(descriptionLength)
  reader.skip(16) // width, height, depth, colour count
  const dataLength = reader.u32()
  if (dataLength <= 0 || dataLength > reader.remaining) return
  result.picture = { mimeType, data: reader.bytes(dataLength) }
}

// ---------------------------------------------------------------------------
// RIFF / WAVE and AIFF
// ---------------------------------------------------------------------------

const RIFF_INFO_KEYS: Record<string, keyof ExtractedMetadata> = {
  INAM: 'title',
  IART: 'artist',
  IPRD: 'album',
  IGNR: 'genre',
  IMUS: 'composer',
}

export function parseRiff(view: DataView): ExtractedMetadata {
  const result: ExtractedMetadata = {}
  const reader = new ByteReader(view)
  reader.seek(12)
  let byteRate = 0

  while (reader.remaining >= 8) {
    const chunkId = reader.ascii(4)
    const chunkSize = reader.u32(true)
    const chunkStart = reader.position
    if (chunkSize < 0) break

    if (chunkId === 'fmt ') {
      reader.skip(8) // format tag, channels, sample rate
      byteRate = reader.u32(true)
    } else if (chunkId === 'data') {
      if (byteRate > 0) result.duration = chunkSize / byteRate
    } else if (chunkId === 'LIST' && reader.remaining >= 4 && reader.ascii(4) === 'INFO') {
      readRiffInfo(view, reader.position, chunkStart + chunkSize, result)
    }

    // RIFF chunks are padded to an even length.
    reader.seek(chunkStart + chunkSize + (chunkSize % 2))
    if (reader.position <= chunkStart) break
  }
  return result
}

function readRiffInfo(view: DataView, start: number, end: number, result: ExtractedMetadata): void {
  const reader = new ByteReader(view)
  reader.seek(start)
  while (reader.position + 8 <= end) {
    const id = reader.ascii(4)
    const size = reader.u32(true)
    if (size <= 0 || reader.position + size > end) break
    const value = trimNulls(latin1(reader.bytes(size)))
    if (id === 'ICRD') setNumber(result, 'year', leadingNumber(value))
    else if (id === 'ITRK') setNumber(result, 'trackNumber', leadingNumber(value))
    else {
      const key = RIFF_INFO_KEYS[id]
      if (key !== undefined && value !== '') assignString(result, key, value)
    }
    reader.skip(size % 2)
  }
}

const AIFF_KEYS: Record<string, keyof ExtractedMetadata> = {
  NAME: 'title',
  AUTH: 'artist',
}

export function parseAiff(view: DataView): ExtractedMetadata {
  const result: ExtractedMetadata = {}
  const reader = new ByteReader(view)
  reader.seek(12)

  while (reader.remaining >= 8) {
    const chunkId = reader.ascii(4)
    const chunkSize = reader.u32()
    const chunkStart = reader.position
    if (chunkSize < 0) break

    if (chunkId === 'COMM' && chunkSize >= 18) {
      reader.skip(2) // channels
      const frames = reader.u32()
      reader.skip(2) // bits per sample
      const sampleRate = readExtendedFloat80(view, reader.position)
      if (sampleRate > 0 && frames > 0) result.duration = frames / sampleRate
    } else if (chunkId === 'ID3 ' || chunkId === 'id3 ') {
      Object.assign(result, parseId3(view, chunkStart))
    } else {
      const key = AIFF_KEYS[chunkId]
      if (key !== undefined) {
        const value = trimNulls(latin1(reader.bytes(Math.min(chunkSize, reader.remaining))))
        if (value !== '') assignString(result, key, value)
      }
    }

    reader.seek(chunkStart + chunkSize + (chunkSize % 2))
    if (reader.position <= chunkStart) break
  }
  return result
}

/** AIFF stores its sample rate as an 80-bit IEEE extended float. */
function readExtendedFloat80(view: DataView, offset: number): number {
  if (offset + 10 > view.byteLength) return 0
  const exponent = view.getUint16(offset) & 0x7fff
  const high = view.getUint32(offset + 2)
  const low = view.getUint32(offset + 6)
  if (exponent === 0 && high === 0 && low === 0) return 0
  const mantissa = high * 0x1_0000_0000 + low
  return mantissa * Math.pow(2, exponent - 16383 - 63)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Assigns a numeric tag only when the parser actually found one.
 *
 * `exactOptionalPropertyTypes` draws a distinction between "absent" and "present but
 * undefined", and `??=` with a possibly-undefined right-hand side would write the latter.
 */
function setNumber(
  result: ExtractedMetadata,
  key: 'year' | 'trackNumber' | 'discNumber' | 'duration',
  value: number | undefined,
): void {
  if (value === undefined || result[key] !== undefined) return
  result[key] = value
}

/** Keeps the string-valued keys of `ExtractedMetadata` type-safe without a cast. */
function assignString(
  result: ExtractedMetadata,
  key: keyof ExtractedMetadata,
  value: string,
): void {
  switch (key) {
    case 'title':
    case 'artist':
    case 'album':
    case 'albumArtist':
    case 'genre':
    case 'composer':
    case 'lyrics':
      result[key] ??= value
      return
    default:
      return
  }
}

/** Track and disc tags arrive as `3`, `3/12` or a raw number depending on the container. */
export function leadingNumber(value: string): number | undefined {
  const match = /\d+/.exec(value)
  if (match === null) return undefined
  const parsed = Number(match[0])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** Falls back to the filename, splitting the common `Artist - Title` convention. */
export function fallbackTitleAndArtist(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^./\\]+$/, '')
  for (const separator of [' - ', ' – ', ' — ', '_-_']) {
    const index = base.indexOf(separator)
    if (index > 0) {
      const artist = base.slice(0, index).trim()
      const title = base.slice(index + separator.length).trim()
      if (artist !== '' && title !== '') return { title, artist }
    }
  }
  return { title: base === '' ? fileName : base, artist: '' }
}

const ID3V1_GENRES: readonly string[] = [
  'Blues',
  'Classic Rock',
  'Country',
  'Dance',
  'Disco',
  'Funk',
  'Grunge',
  'Hip-Hop',
  'Jazz',
  'Metal',
  'New Age',
  'Oldies',
  'Other',
  'Pop',
  'R&B',
  'Rap',
  'Reggae',
  'Rock',
  'Techno',
  'Industrial',
  'Alternative',
  'Ska',
  'Death Metal',
  'Pranks',
  'Soundtrack',
  'Euro-Techno',
  'Ambient',
  'Trip-Hop',
  'Vocal',
  'Jazz+Funk',
  'Fusion',
  'Trance',
  'Classical',
  'Instrumental',
  'Acid',
  'House',
  'Game',
  'Sound Clip',
  'Gospel',
  'Noise',
  'Alternative Rock',
  'Bass',
  'Soul',
  'Punk',
  'Space',
  'Meditative',
  'Instrumental Pop',
  'Instrumental Rock',
  'Ethnic',
  'Gothic',
  'Darkwave',
  'Techno-Industrial',
  'Electronic',
  'Pop-Folk',
  'Eurodance',
  'Dream',
  'Southern Rock',
  'Comedy',
  'Cult',
  'Gangsta',
  'Top 40',
  'Christian Rap',
  'Pop/Funk',
  'Jungle',
  'Native American',
  'Cabaret',
  'New Wave',
  'Psychedelic',
  'Rave',
  'Showtunes',
  'Trailer',
  'Lo-Fi',
  'Tribal',
  'Acid Punk',
  'Acid Jazz',
  'Polka',
  'Retro',
  'Musical',
  'Rock & Roll',
  'Hard Rock',
]
