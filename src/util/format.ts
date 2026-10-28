/** `3:07` or `1:02:33`. Returns `--:--` for unknown or invalid durations. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}

/** `1 hr 12 min` — used for album and playlist totals. */
export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`
  if (minutes > 0) return `${minutes} min`
  return `${total} sec`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unit] ?? 'B'}`
}

export const formatSongCount = (count: number): string =>
  count === 1 ? '1 song' : `${count} songs`

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
]

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now
  const absolute = Math.abs(delta)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
  for (const [unit, size] of RELATIVE_UNITS) {
    if (absolute >= size) return formatter.format(Math.round(delta / size), unit)
  }
  return formatter.format(Math.round(delta / 1000), 'second')
}
