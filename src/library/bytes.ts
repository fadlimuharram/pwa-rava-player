/** Small cursor over a DataView, so the tag parsers read like the specs they implement. */
export class ByteReader {
  private offset = 0

  constructor(private readonly view: DataView) {}

  get position(): number {
    return this.offset
  }

  get remaining(): number {
    return this.view.byteLength - this.offset
  }

  seek(offset: number): void {
    this.offset = Math.min(Math.max(offset, 0), this.view.byteLength)
  }

  skip(count: number): void {
    this.seek(this.offset + count)
  }

  u8(): number {
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  u16(littleEndian = false): number {
    const value = this.view.getUint16(this.offset, littleEndian)
    this.offset += 2
    return value
  }

  u24(): number {
    return (this.u8() << 16) | (this.u8() << 8) | this.u8()
  }

  u32(littleEndian = false): number {
    const value = this.view.getUint32(this.offset, littleEndian)
    this.offset += 4
    return value
  }

  u64(): number {
    // Durations never approach 2^53, so collapsing to a Number is safe and keeps the
    // arithmetic in the same type as everything else.
    const high = this.u32()
    const low = this.u32()
    return high * 0x1_0000_0000 + low
  }

  bytes(length: number): Uint8Array {
    const start = this.view.byteOffset + this.offset
    const clamped = Math.max(0, Math.min(length, this.remaining))
    this.offset += clamped
    return new Uint8Array(this.view.buffer, start, clamped)
  }

  ascii(length: number): string {
    return latin1(this.bytes(length))
  }
}

export const latin1 = (bytes: Uint8Array): string => {
  let result = ''
  for (const byte of bytes) result += String.fromCharCode(byte)
  return result
}

const utf8Decoder = new TextDecoder('utf-8')
const utf16Decoder = new TextDecoder('utf-16le')
const utf16beDecoder = new TextDecoder('utf-16be')

/** Decodes an ID3 text payload according to its leading encoding byte. */
export function decodeId3Text(encoding: number, bytes: Uint8Array): string {
  switch (encoding) {
    case 0:
      return trimNulls(latin1(bytes))
    case 1: {
      if (bytes.length >= 2) {
        const [b0, b1] = [bytes[0], bytes[1]]
        if (b0 === 0xff && b1 === 0xfe) return trimNulls(utf16Decoder.decode(bytes.subarray(2)))
        if (b0 === 0xfe && b1 === 0xff) return trimNulls(utf16beDecoder.decode(bytes.subarray(2)))
      }
      return trimNulls(utf16Decoder.decode(bytes))
    }
    case 2:
      return trimNulls(utf16beDecoder.decode(bytes))
    default:
      return trimNulls(utf8Decoder.decode(bytes))
  }
}

export const decodeUtf8 = (bytes: Uint8Array): string => trimNulls(utf8Decoder.decode(bytes))

export const trimNulls = (value: string): string => value.replace(/\0+$/g, '').trim()

/** ID3v2 sizes are stored seven bits per byte so they can never look like a frame sync. */
export function synchsafe(bytes: Uint8Array): number {
  let value = 0
  for (const byte of bytes) value = (value << 7) | (byte & 0x7f)
  return value
}

export const readFileSlice = async (file: Blob, start: number, end: number): Promise<DataView> => {
  const buffer = await file.slice(start, end).arrayBuffer()
  return new DataView(buffer)
}

export const bytesStartWith = (view: DataView, offset: number, magic: string): boolean => {
  if (offset + magic.length > view.byteLength) return false
  for (let i = 0; i < magic.length; i += 1) {
    if (view.getUint8(offset + i) !== magic.charCodeAt(i)) return false
  }
  return true
}
