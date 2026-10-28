import { errorMessage } from '../util/log'

export class UnsupportedAudioError extends Error {
  constructor(fileName: string, cause?: string) {
    super(
      `“${fileName}” could not be decoded by this browser.${cause === undefined ? '' : ` ${cause}`}`,
    )
    this.name = 'UnsupportedAudioError'
  }
}

/**
 * Opens the file with the same decoder that will play it.
 *
 * This is the PWA equivalent of the native app's `AVAudioFile` probe: nothing enters the
 * library until the browser has shown it can decode it, so the library can never contain a
 * track that silently fails. It also yields an authoritative duration, which matters for
 * VBR MP3s where the container header lies.
 */
export async function probeAudio(
  blob: Blob,
  fileName: string,
  timeoutMs = 20_000,
): Promise<number> {
  const url = URL.createObjectURL(blob)
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.muted = true

  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new UnsupportedAudioError(fileName, 'The browser took too long to read it.'))
      }, timeoutMs)

      const cleanup = (): void => {
        window.clearTimeout(timer)
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('error', onError)
        audio.removeAttribute('src')
        audio.load()
      }

      const onLoaded = (): void => {
        const duration = audio.duration
        cleanup()
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new UnsupportedAudioError(fileName, 'It reports no playable duration.'))
          return
        }
        resolve(duration)
      }

      const onError = (): void => {
        const code = audio.error?.code
        cleanup()
        reject(
          new UnsupportedAudioError(
            fileName,
            code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
              ? 'The format or codec is not supported.'
              : 'The file may be corrupted.',
          ),
        )
      }

      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('error', onError)
      audio.src = url
      audio.load()
    })
  } catch (error) {
    if (error instanceof UnsupportedAudioError) throw error
    throw new UnsupportedAudioError(fileName, errorMessage(error))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Extensions worth attempting. This is only a first filter — `probeAudio` is the authority,
 * because which codecs actually decode varies by browser and by OS version.
 *
 * Ogg Vorbis, Opus and WMA are left out on purpose: Safari on iOS cannot decode them, and
 * offering them would only produce failures at import time.
 */
export const IMPORTABLE_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'm4b',
  'aac',
  'adts',
  'wav',
  'wave',
  'aif',
  'aiff',
  'aifc',
  'caf',
  'flac',
  'mp4',
])

export const fileExtension = (name: string): string => {
  const index = name.lastIndexOf('.')
  return index < 0 ? '' : name.slice(index + 1).toLowerCase()
}

export const looksImportable = (name: string): boolean =>
  IMPORTABLE_EXTENSIONS.has(fileExtension(name))

export const displayFormat = (name: string): string => fileExtension(name).toUpperCase()
