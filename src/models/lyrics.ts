export interface LyricLine {
  readonly id: string
  /** `null` for plain, unsynchronised lyrics. */
  readonly timestamp: number | null
  readonly text: string
}

const METADATA_TAGS = ['ti:', 'ar:', 'al:', 'by:', 'offset:', 'length:', 're:', 've:']

/** `mm:ss`, `mm:ss.xx` or `mm:ss:xx`. */
function parseTimestamp(value: string): number | null {
  const parts = value.replace(',', '.').split(':')
  if (parts.length < 2) return null
  const minutes = Number(parts[0])
  const seconds = Number(parts[1])
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
  if (parts.length === 2) return minutes * 60 + seconds
  const fractionText = parts[2] ?? ''
  const fraction = Number(fractionText)
  if (!Number.isFinite(fraction)) return null
  return minutes * 60 + seconds + fraction / Math.pow(10, fractionText.length)
}

function splitTimestamps(line: string): { stamps: number[]; text: string } {
  const stamps: number[] = []
  let rest = line
  while (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close < 0) break
    const seconds = parseTimestamp(rest.slice(1, close))
    if (seconds === null) break
    stamps.push(seconds)
    rest = rest.slice(close + 1)
  }
  return { stamps, text: rest }
}

const isMetadataTag = (line: string): boolean =>
  line.startsWith('[') && METADATA_TAGS.some((tag) => line.slice(1).startsWith(tag))

/** Parses both plain embedded lyrics and timestamped LRC. */
export function parseLyrics(raw: string): LyricLine[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const result: LyricLine[] = []
  let sawTimestamp = false
  let counter = 0

  for (const line of lines) {
    const { stamps, text } = splitTimestamps(line)
    if (stamps.length === 0) {
      const trimmed = line.trim()
      if (trimmed === '' || isMetadataTag(trimmed)) continue
      counter += 1
      result.push({ id: `l${counter}`, timestamp: null, text: trimmed })
    } else {
      sawTimestamp = true
      const trimmed = text.trim()
      for (const stamp of stamps) {
        counter += 1
        result.push({ id: `l${counter}`, timestamp: stamp, text: trimmed })
      }
    }
  }

  if (sawTimestamp) {
    return result
      .filter((line) => line.timestamp !== null)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  }
  return result
}

export const isSynchronized = (lines: readonly LyricLine[]): boolean =>
  lines.some((line) => line.timestamp !== null)

/** Index of the line that should be highlighted at `time`. */
export function activeLyricIndex(lines: readonly LyricLine[], time: number): number | null {
  if (lines.length === 0) return null
  let result: number | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const stamp = lines[index]?.timestamp
    if (stamp === null || stamp === undefined) continue
    if (stamp <= time) result = index
    else break
  }
  return result
}
