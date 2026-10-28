import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useServices } from '../../app/AppProvider'
import { Icon } from './Icon'

/**
 * Album art with a stable, pleasant fallback.
 *
 * `hashValue` is an FNV-1a hash rather than anything built in, so the same album always gets
 * the same gradient across reloads instead of looking random each time.
 */
function stableHue(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 360
}

interface Props {
  readonly artworkKey: string | null
  readonly seed: string
  readonly size: number
  readonly rounded?: boolean
  readonly className?: string
}

export function Artwork({ artworkKey, seed, size, rounded, className }: Props): ReactNode {
  const { artwork } = useServices()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (artworkKey === null) {
      setUrl(null)
      return undefined
    }
    void artwork.url(artworkKey).then((loaded) => {
      if (!cancelled) setUrl(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [artwork, artworkKey])

  const hue = stableHue(seed)
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded === true ? '50%' : undefined,
    background:
      url === null
        ? `linear-gradient(135deg, hsl(${hue} 45% 55%), hsl(${(hue + 40) % 360} 55% 38%))`
        : undefined,
  }

  return (
    <div className={`artwork${className === undefined ? '' : ` ${className}`}`} style={style}>
      {url === null ? (
        <span className="artwork__fallback">
          <Icon name="note" size={Math.max(14, Math.round(size * 0.32))} />
        </span>
      ) : (
        <img src={url} alt="" loading="lazy" decoding="async" />
      )}
    </div>
  )
}
