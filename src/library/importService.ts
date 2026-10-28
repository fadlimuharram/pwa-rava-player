import { Store } from '../util/store'
import { errorMessage, log } from '../util/log'
import { newId, type Track } from '../models/types'
import { fallbackTitleAndArtist, readTags } from './metadata'
import { fileFingerprint } from './fingerprint'
import { displayFormat, looksImportable, probeAudio, UnsupportedAudioError } from './probe'
import { StorageQuotaError, type Database } from './db'
import { ArtworkCache } from './artwork'
import type { LibraryStore } from './libraryStore'

export interface ImportFailure {
  readonly id: string
  readonly fileName: string
  readonly reason: string
}

/** Outcome of one import run, shown to the user when it finishes. */
export interface ImportSummary {
  imported: number
  duplicates: number
  unsupported: number
  failures: ImportFailure[]
  cancelled: boolean
}

export interface ImportProgress {
  readonly processed: number
  readonly total: number
  readonly currentFileName: string
}

export interface ImportState {
  readonly progress: ImportProgress | null
  readonly lastSummary: ImportSummary | null
}

export const emptySummary = (): ImportSummary => ({
  imported: 0,
  duplicates: 0,
  unsupported: 0,
  failures: [],
  cancelled: false,
})

export const summarySkipped = (summary: ImportSummary): number =>
  summary.duplicates + summary.unsupported + summary.failures.length

export function summaryHeadline(summary: ImportSummary): string {
  if (summary.cancelled) return 'Import cancelled'
  if (summary.imported === 0 && summarySkipped(summary) === 0) return 'Nothing to import'
  return summary.imported === 1 ? '1 song imported' : `${summary.imported} songs imported`
}

export function summaryDetail(summary: ImportSummary): string {
  const parts: string[] = []
  if (summary.duplicates > 0) parts.push(`${summary.duplicates} already in library`)
  if (summary.unsupported > 0) parts.push(`${summary.unsupported} unsupported`)
  if (summary.failures.length > 0) parts.push(`${summary.failures.length} failed`)
  return parts.join(' • ')
}

/**
 * Turns picked files into library tracks.
 *
 * Deliberately strict: a file is only added once the browser has decoded it, so the library
 * cannot contain a track that silently fails to play.
 */
export class ImportService extends Store<ImportState> {
  private cancelled = false
  /**
   * Fingerprints seen during the current run. The library store only learns about a track once
   * it has been written, so without this two copies of the same file inside one selection
   * would both slip through.
   */
  private seen = new Set<string>()

  constructor(
    private readonly db: Database,
    private readonly library: LibraryStore,
    private readonly artwork: ArtworkCache,
  ) {
    super({ progress: null, lastSummary: null })
  }

  get isImporting(): boolean {
    return this.state.progress !== null
  }

  cancel(): void {
    this.cancelled = true
  }

  async importFiles(files: readonly File[]): Promise<ImportSummary> {
    this.cancelled = false
    this.seen = new Set()

    // `.lrc` files picked alongside the audio become that track's lyrics.
    const lyricsByBaseName = new Map<string, File>()
    const audioFiles: File[] = []
    for (const file of files) {
      if (/\.lrc$/i.test(file.name)) {
        lyricsByBaseName.set(baseName(file.name).toLowerCase(), file)
      } else {
        audioFiles.push(file)
      }
    }

    const summary = emptySummary()
    if (audioFiles.length === 0) {
      this.update((state) => ({ ...state, progress: null, lastSummary: summary }))
      return summary
    }

    for (let index = 0; index < audioFiles.length; index += 1) {
      const file = audioFiles[index]
      if (file === undefined) continue
      if (this.cancelled) {
        summary.cancelled = true
        break
      }
      this.update((state) => ({
        ...state,
        progress: { processed: index, total: audioFiles.length, currentFileName: file.name },
      }))

      try {
        const track = await this.buildTrack(file, lyricsByBaseName)
        await this.db.addTrackWithAudio(track, file)
        this.library.registerImported(track)
        summary.imported += 1
      } catch (error) {
        this.recordFailure(summary, file.name, error)
      }
    }

    this.update((state) => ({ ...state, progress: null, lastSummary: summary }))
    log.debug(
      'import',
      `Finished: ${summary.imported} added, ${summary.duplicates} duplicates, ${summary.failures.length} failed.`,
    )
    return summary
  }

  private recordFailure(summary: ImportSummary, fileName: string, error: unknown): void {
    if (error instanceof DuplicateError) {
      summary.duplicates += 1
      return
    }
    if (error instanceof UnsupportedAudioError || error instanceof UnsupportedExtensionError) {
      summary.unsupported += 1
      return
    }
    summary.failures.push({
      id: newId(),
      fileName,
      reason:
        error instanceof StorageQuotaError
          ? error.message
          : `Could not import it. ${errorMessage(error)}`,
    })
  }

  private async buildTrack(file: File, lyricsFiles: Map<string, File>): Promise<Track> {
    if (!looksImportable(file.name)) throw new UnsupportedExtensionError(file.name)

    const fingerprint = await fileFingerprint(file)
    if (this.library.hasFingerprint(fingerprint) || this.seen.has(fingerprint)) {
      throw new DuplicateError()
    }
    this.seen.add(fingerprint)

    // Decode-probe before anything is written, so an unreadable file never uses up quota.
    const probedDuration = await probeAudio(file, file.name)
    const tags = await readTags(file)
    const fallback = fallbackTitleAndArtist(file.name)

    const artist = tags.artist ?? fallback.artist
    const album = tags.album ?? ''
    const albumArtist = tags.albumArtist ?? ''
    const trackId = newId()

    let artworkKey: string | null = null
    if (tags.picture !== undefined && tags.picture.data.byteLength > 0) {
      const key = await ArtworkCache.keyFor(
        album,
        albumArtist === '' ? artist : albumArtist,
        trackId,
      )
      // `slice()` detaches the view from the 2 MB tag buffer so only the image is retained.
      const blob = new Blob([tags.picture.data.slice()], { type: tags.picture.mimeType })
      await this.artwork.store(key, blob)
      artworkKey = key
    }

    const sidecar = lyricsFiles.get(baseName(file.name).toLowerCase())
    const lyrics = sidecar !== undefined ? await sidecar.text() : (tags.lyrics ?? '')

    return {
      id: trackId,
      title: tags.title ?? fallback.title,
      artist,
      album,
      albumArtist,
      genre: tags.genre ?? '',
      composer: tags.composer ?? '',
      year: tags.year ?? 0,
      trackNumber: tags.trackNumber ?? 0,
      discNumber: tags.discNumber ?? 0,
      duration: probedDuration,
      fileName: file.name,
      fileFormat: displayFormat(file.name),
      folderPath: relativeFolder(file),
      fingerprint,
      byteSize: file.size,
      addedAt: Date.now(),
      lastPlayedAt: null,
      playCount: 0,
      isFavorite: false,
      artworkKey,
      resumePosition: 0,
      lyrics,
      storage: 'indexeddb',
    }
  }
}

class DuplicateError extends Error {
  constructor() {
    super('This file is already in your library.')
    this.name = 'DuplicateError'
  }
}

export class UnsupportedExtensionError extends Error {
  constructor(fileName: string) {
    super(`“${fileName}” is not an audio format this browser can play.`)
    this.name = 'UnsupportedExtensionError'
  }
}

/**
 * Folder path for the Folders browser.
 *
 * `webkitRelativePath` is only populated when the picker allowed a directory, which iOS Safari
 * does not. Files picked individually land at the root, which is the honest representation of
 * what the browser told us.
 */
export function relativeFolder(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  if (relative === undefined || relative === '') return ''
  const parts = relative.split('/')
  parts.pop()
  return parts.join('/')
}

export const baseName = (fileName: string): string => fileName.replace(/\.[^./\\]+$/, '')
