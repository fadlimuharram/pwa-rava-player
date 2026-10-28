import { Database, requestPersistentStorage, type StorageEstimateSummary } from '../library/db'
import { ArtworkCache } from '../library/artwork'
import { LibraryStore } from '../library/libraryStore'
import { ImportService } from '../library/importService'
import { SettingsStore } from '../audio/settings'
import { PlaybackController } from '../audio/playbackController'
import { log } from '../util/log'

export interface Services {
  readonly db: Database
  readonly artwork: ArtworkCache
  readonly library: LibraryStore
  readonly imports: ImportService
  readonly settings: SettingsStore
  readonly player: PlaybackController
  readonly storage: StorageEstimateSummary
}

/**
 * Builds the long-lived services once, in dependency order.
 *
 * Everything here outlives React. Components read these stores; they never construct one, so
 * there is exactly one database connection, one library and one player for the page.
 */
export async function createServices(): Promise<Services> {
  const db = await Database.open()
  const artwork = new ArtworkCache(db)
  const library = new LibraryStore(db)
  const imports = new ImportService(db, library, artwork)
  const settings = new SettingsStore()
  const player = new PlaybackController(library, settings, artwork)

  const storage = await requestPersistentStorage()
  if (!storage.persisted) {
    log.warn(
      'storage',
      'Storage is not marked persistent; the browser may evict the library after long disuse.',
    )
  }

  await library.load()
  player.restoreLastSession()
  if (settings.state.equalizerEnabled) player.applyEqualizer()

  return { db, artwork, library, imports, settings, player, storage }
}
