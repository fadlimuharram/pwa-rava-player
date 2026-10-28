import { newId, type RepeatMode } from './types'

/**
 * One slot in the play queue. The same track can appear more than once, so the entry owns its
 * own identity instead of using the track id.
 */
export interface QueueEntry {
  readonly id: string
  readonly trackId: string
}

/**
 * The play queue, as a plain immutable value.
 *
 * Every function here returns a new state object: no audio, no storage, no React. That makes
 * each ordering rule directly testable, and gives React a fresh identity to re-render on.
 */
export interface QueueState {
  /** Entries in the order they will actually play (shuffled order when shuffle is on). */
  readonly entries: readonly QueueEntry[]
  /** Entries in their original order. Restored when shuffle is turned off. */
  readonly originalEntries: readonly QueueEntry[]
  readonly currentIndex: number | null
  readonly isShuffled: boolean
  readonly repeatMode: RepeatMode
}

export type Rng = () => number

export const emptyQueue = (): QueueState => ({
  entries: [],
  originalEntries: [],
  currentIndex: null,
  isShuffled: false,
  repeatMode: 'off',
})

export const currentEntry = (state: QueueState): QueueEntry | null => {
  if (state.currentIndex === null) return null
  return state.entries[state.currentIndex] ?? null
}

export const currentTrackId = (state: QueueState): string | null =>
  currentEntry(state)?.trackId ?? null

/** Entries after the current one, which is what the Up Next list shows. */
export const upcomingEntries = (state: QueueState): readonly QueueEntry[] => {
  if (state.currentIndex === null) return []
  return state.entries.slice(state.currentIndex + 1)
}

const makeEntries = (trackIds: readonly string[]): QueueEntry[] =>
  trackIds.map((trackId) => ({ id: newId(), trackId }))

/** Fisher–Yates, with the randomness injected so tests can pin the permutation. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const a = result[i]
    const b = result[j]
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }
  return result
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/**
 * Replaces the queue and makes `startIndex` the current entry.
 *
 * When shuffle is on the chosen track still plays first; the rest are shuffled behind it.
 */
export function replaceQueue(
  state: QueueState,
  trackIds: readonly string[],
  startIndex = 0,
  rng: Rng = Math.random,
): QueueState {
  const built = makeEntries(trackIds)
  if (built.length === 0) {
    return { ...state, entries: [], originalEntries: [], currentIndex: null }
  }
  const clamped = Math.min(Math.max(startIndex, 0), built.length - 1)
  if (state.isShuffled) {
    const rest = built.filter((_, index) => index !== clamped)
    const head = built[clamped]
    if (head === undefined) return state
    return {
      ...state,
      originalEntries: built,
      entries: [head, ...shuffled(rest, rng)],
      currentIndex: 0,
    }
  }
  return { ...state, originalEntries: built, entries: built, currentIndex: clamped }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Index that should play next, or `null` when the queue has run out.
 *
 * `automatic` is true when the current track ended by itself. Repeat-one only loops on an
 * automatic advance: pressing Next always moves to a different track.
 */
export function nextIndex(state: QueueState, automatic: boolean): number | null {
  if (state.entries.length === 0) return null
  if (state.currentIndex === null) return 0
  if (automatic && state.repeatMode === 'one') return state.currentIndex
  const candidate = state.currentIndex + 1
  if (candidate < state.entries.length) return candidate
  return state.repeatMode === 'off' ? null : 0
}

export function advanceQueue(
  state: QueueState,
  automatic: boolean,
): { state: QueueState; entry: QueueEntry | null } {
  const index = nextIndex(state, automatic)
  if (index === null) return { state, entry: null }
  return { state: { ...state, currentIndex: index }, entry: state.entries[index] ?? null }
}

export function previousIndex(state: QueueState): number | null {
  if (state.entries.length === 0) return null
  if (state.currentIndex === null) return 0
  if (state.currentIndex - 1 >= 0) return state.currentIndex - 1
  return state.repeatMode === 'off' ? 0 : state.entries.length - 1
}

export function rewindQueue(state: QueueState): {
  state: QueueState
  entry: QueueEntry | null
} {
  const index = previousIndex(state)
  if (index === null) return { state, entry: null }
  return { state: { ...state, currentIndex: index }, entry: state.entries[index] ?? null }
}

export function jumpToEntry(
  state: QueueState,
  entryId: string,
): { state: QueueState; entry: QueueEntry | null } {
  const index = state.entries.findIndex((entry) => entry.id === entryId)
  if (index < 0) return { state, entry: null }
  return { state: { ...state, currentIndex: index }, entry: state.entries[index] ?? null }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** Inserts right after the current entry. */
export function playNext(state: QueueState, trackIds: readonly string[]): QueueState {
  const additions = makeEntries(trackIds)
  if (additions.length === 0) return state
  if (state.currentIndex === null || state.entries.length === 0) {
    const entries = [...additions, ...state.entries]
    return { ...state, entries, originalEntries: entries, currentIndex: state.currentIndex ?? 0 }
  }
  const entries = [...state.entries]
  entries.splice(state.currentIndex + 1, 0, ...additions)
  return { ...state, entries, originalEntries: [...state.originalEntries, ...additions] }
}

export function appendToQueue(state: QueueState, trackIds: readonly string[]): QueueState {
  const additions = makeEntries(trackIds)
  if (additions.length === 0) return state
  return {
    ...state,
    entries: [...state.entries, ...additions],
    originalEntries: [...state.originalEntries, ...additions],
    currentIndex: state.currentIndex ?? 0,
  }
}

/**
 * Removes an entry, keeping `currentIndex` pointing at the same entry when possible.
 * `removedCurrent` says whether the entry that was removed was the one playing.
 */
export function removeEntry(
  state: QueueState,
  entryId: string,
): { state: QueueState; removedCurrent: boolean } {
  const index = state.entries.findIndex((entry) => entry.id === entryId)
  if (index < 0) return { state, removedCurrent: false }

  const removedCurrent = index === state.currentIndex
  const entries = state.entries.filter((entry) => entry.id !== entryId)
  const originalEntries = state.originalEntries.filter((entry) => entry.id !== entryId)

  let currentIndex = state.currentIndex
  if (entries.length === 0) {
    currentIndex = null
  } else if (currentIndex !== null) {
    if (index < currentIndex) currentIndex -= 1
    else if (removedCurrent) currentIndex = Math.min(currentIndex, entries.length - 1)
  }
  return { state: { ...state, entries, originalEntries, currentIndex }, removedCurrent }
}

export function moveEntry(state: QueueState, from: number, to: number): QueueState {
  if (from === to) return state
  const entries = [...state.entries]
  const [moved] = entries.splice(from, 1)
  if (moved === undefined) return state
  entries.splice(to, 0, moved)

  const currentId = currentEntry(state)?.id
  const currentIndex =
    currentId === undefined
      ? state.currentIndex
      : (() => {
          const found = entries.findIndex((entry) => entry.id === currentId)
          return found < 0 ? state.currentIndex : found
        })()
  return { ...state, entries, currentIndex }
}

/** Clears everything except the entry that is playing right now. */
export function clearUpcoming(state: QueueState): QueueState {
  const keep = currentEntry(state)
  if (keep === null) return { ...state, entries: [], originalEntries: [], currentIndex: null }
  return { ...state, entries: [keep], originalEntries: [keep], currentIndex: 0 }
}

export const clearQueue = (state: QueueState): QueueState => ({
  ...state,
  entries: [],
  originalEntries: [],
  currentIndex: null,
})

/** Drops every entry pointing at `trackId` — used when a track leaves the library. */
export function removeTrackFromQueue(state: QueueState, trackId: string): QueueState {
  const currentId = currentEntry(state)?.id
  const entries = state.entries.filter((entry) => entry.trackId !== trackId)
  const originalEntries = state.originalEntries.filter((entry) => entry.trackId !== trackId)

  let currentIndex: number | null
  if (entries.length === 0) {
    currentIndex = null
  } else {
    const found = currentId === undefined ? -1 : entries.findIndex((e) => e.id === currentId)
    currentIndex = found >= 0 ? found : Math.min(state.currentIndex ?? 0, entries.length - 1)
  }
  return { ...state, entries, originalEntries, currentIndex }
}

// ---------------------------------------------------------------------------
// Shuffle
// ---------------------------------------------------------------------------

/** Turns shuffle on or off while keeping the current track playing. */
export function setShuffled(
  state: QueueState,
  isShuffled: boolean,
  rng: Rng = Math.random,
): QueueState {
  if (isShuffled === state.isShuffled) return state
  if (state.entries.length === 0) return { ...state, isShuffled }

  const current = currentEntry(state)
  if (isShuffled) {
    const rest = state.entries.filter((entry) => entry.id !== current?.id)
    const entries = current === null ? shuffled(rest, rng) : [current, ...shuffled(rest, rng)]
    return { ...state, isShuffled, entries, currentIndex: 0 }
  }

  const entries = state.originalEntries
  const found = current === null ? -1 : entries.findIndex((entry) => entry.id === current.id)
  return { ...state, isShuffled, entries, currentIndex: found >= 0 ? found : 0 }
}

export const setRepeatMode = (state: QueueState, repeatMode: RepeatMode): QueueState => ({
  ...state,
  repeatMode,
})
