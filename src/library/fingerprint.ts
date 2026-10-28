const CHUNK_SIZE = 256 * 1024

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * Content fingerprint used for duplicate detection.
 *
 * Hashing a whole 60 MB lossless file on every import would stall the UI, so the fingerprint
 * is the file size plus a SHA-256 of the head and tail chunks. Two different songs practically
 * never collide on all three; two copies of the same file always match, whatever they are named.
 */
export async function fileFingerprint(file: Blob): Promise<string> {
  const parts: BlobPart[] = [new TextEncoder().encode(`${file.size}:`)]
  parts.push(file.slice(0, Math.min(CHUNK_SIZE, file.size)))
  if (file.size > CHUNK_SIZE * 2) {
    parts.push(file.slice(file.size - CHUNK_SIZE, file.size))
  }
  const buffer = await new Blob(parts).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return toHex(digest)
}

/** Fallback identity when the bytes cannot be read: metadata plus rounded duration. */
export async function metadataFingerprint(
  title: string,
  artist: string,
  album: string,
  duration: number,
): Promise<string> {
  const normalized = `${title}|${artist}|${album}|${Math.round(duration)}`.toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return `meta-${toHex(digest)}`
}
