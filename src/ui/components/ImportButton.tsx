import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useServices, useStore } from '../../app/AppProvider'
import { summaryDetail, summaryHeadline, type ImportSummary } from '../../library/importService'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/**
 * iPad on iOS 13+ reports a desktop Safari user agent, so the touch-point count is what
 * separates it from a real Mac. `navigator.platform` would be simpler but is deprecated.
 */
const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

/** Folder picking only exists where `webkitdirectory` is real; on iOS Safari it is not. */
export const supportsDirectoryPicker = (): boolean =>
  'webkitdirectory' in HTMLInputElement.prototype && !isIos()

/**
 * The only way audio gets into the app.
 *
 * On iOS the button opens the multi-file picker straight away, because a folder option there
 * would be a dead control. Where directories really work, a small sheet offers both.
 */
export function ImportButton(): ReactNode {
  const { imports } = useServices()
  const importState = useStore(imports)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [choosing, setChoosing] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const canPickFolder = supportsDirectoryPicker()

  useEffect(() => {
    if (summary === null) return undefined
    const handle = window.setTimeout(() => {
      setSummary(null)
    }, 6000)
    return () => {
      window.clearTimeout(handle)
    }
  }, [summary])

  const run = async (files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return
    setSummary(await imports.importFiles([...files]))
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.aac,.wav,.aiff,.aif,.flac,.caf,.lrc"
        className="visually-hidden"
        onChange={(event) => {
          void run(event.target.files)
          event.target.value = ''
        }}
      />
      {canPickFolder && (
        <input
          ref={folderInput}
          type="file"
          multiple
          // React has no typing for the non-standard attributes; the cast stays on this line.
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          className="visually-hidden"
          onChange={(event) => {
            void run(event.target.files)
            event.target.value = ''
          }}
        />
      )}

      <button
        className="icon-button"
        onClick={() => {
          if (canPickFolder) setChoosing(true)
          else fileInput.current?.click()
        }}
        disabled={importState.progress !== null}
        aria-label="Import music"
      >
        <Icon name="plus" />
      </button>

      {choosing && (
        <Sheet
          title="Import music"
          onClose={() => {
            setChoosing(false)
          }}
        >
          <div className="list-group">
            <button
              className="list-item"
              onClick={() => {
                setChoosing(false)
                fileInput.current?.click()
              }}
            >
              <Icon name="note" size={20} />
              Import songs…
            </button>
            <button
              className="list-item"
              onClick={() => {
                setChoosing(false)
                folderInput.current?.click()
              }}
            >
              <Icon name="folder" size={20} />
              Import folder…
            </button>
          </div>
          <p className="note">
            Files are copied into this app&rsquo;s private storage on your device. Nothing is
            uploaded, and your originals are never changed or deleted.
          </p>
        </Sheet>
      )}

      {summary !== null && (
        <div
          className="toast"
          role="status"
          onClick={() => {
            setSummary(null)
          }}
        >
          <strong>{summaryHeadline(summary)}</strong>
          {summaryDetail(summary) !== '' && <div>{summaryDetail(summary)}</div>}
          {summary.failures[0] !== undefined && (
            <div>
              {summary.failures[0].fileName}: {summary.failures[0].reason}
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** Live progress while a large selection is being imported. */
export function ImportProgressBanner(): ReactNode {
  const { imports } = useServices()
  const { progress } = useStore(imports)
  if (progress === null) return null
  const fraction = progress.total > 0 ? progress.processed / progress.total : 0

  return (
    <div className="banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ flex: 1 }}>
          Importing {progress.processed + 1} of {progress.total}
        </strong>
        <button
          onClick={() => {
            imports.cancel()
          }}
          style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}
        >
          Cancel
        </button>
      </div>
      <div className="progressbar">
        <span style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
      </div>
      <div className="row__subtitle">{progress.currentFileName}</div>
    </div>
  )
}
