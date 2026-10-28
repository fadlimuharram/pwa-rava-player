import { useState, type ReactNode } from 'react'
import { useStore } from '../../app/AppProvider'
import type { ProgressStore } from '../../audio/playbackController'
import { formatDuration } from '../../util/format'

interface Props {
  readonly progress: ProgressStore
  readonly onSeek: (seconds: number) => void
}

/**
 * Position slider with elapsed and remaining labels.
 *
 * It subscribes to `ProgressStore` rather than the whole player, so the several-times-a-second
 * position update redraws this strip instead of the entire Now Playing screen.
 */
export function Scrubber({ progress, onSeek }: Props): ReactNode {
  const { currentTime, duration } = useStore(progress)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)
  const displayed = scrubbing ? scrubValue : currentTime
  const max = duration > 0 ? duration : 0.01

  return (
    <div className="scrubber">
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(displayed, max)}
        aria-label="Playback position"
        aria-valuetext={formatDuration(displayed)}
        onChange={(event) => {
          setScrubbing(true)
          setScrubValue(Number(event.target.value))
        }}
        onPointerUp={() => {
          if (!scrubbing) return
          onSeek(scrubValue)
          setScrubbing(false)
        }}
        onKeyUp={() => {
          if (!scrubbing) return
          onSeek(scrubValue)
          setScrubbing(false)
        }}
      />
      <div className="scrubber__times">
        <span>{formatDuration(displayed)}</span>
        <span>-{formatDuration(Math.max(duration - displayed, 0))}</span>
      </div>
    </div>
  )
}

/** Thin bar on the mini player; same reason for its own subscription. */
export function MiniProgressBar({ progress }: { readonly progress: ProgressStore }): ReactNode {
  const { currentTime, duration } = useStore(progress)
  const fraction = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0
  return (
    <div className="mini__progress" aria-hidden="true">
      <span style={{ width: `${(fraction * 100).toFixed(2)}%` }} />
    </div>
  )
}
