import { describe, expect, it } from 'vitest'
import {
  advanceQueue,
  appendToQueue,
  clearUpcoming,
  currentEntry,
  currentTrackId,
  emptyQueue,
  jumpToEntry,
  moveEntry,
  nextIndex,
  playNext,
  previousIndex,
  removeEntry,
  removeTrackFromQueue,
  replaceQueue,
  rewindQueue,
  setRepeatMode,
  setShuffled,
  upcomingEntries,
} from '../src/models/queue'
import { nextRepeatMode } from '../src/models/types'
import { seededRng } from './helpers'

const IDS = ['a', 'b', 'c', 'd', 'e']
const build = (startIndex = 0) => replaceQueue(emptyQueue(), IDS, startIndex)

describe('queue ordering', () => {
  it('starts at the requested index', () => {
    const queue = build(2)
    expect(queue.entries).toHaveLength(5)
    expect(currentTrackId(queue)).toBe('c')
    expect(upcomingEntries(queue).map((e) => e.trackId)).toEqual(['d', 'e'])
  })

  it('clamps an out-of-range start index', () => {
    expect(currentTrackId(build(99))).toBe('e')
  })

  it('clears when replaced with nothing', () => {
    const queue = replaceQueue(build(), [])
    expect(queue.entries).toHaveLength(0)
    expect(queue.currentIndex).toBeNull()
  })

  it('advances forward through the queue', () => {
    let queue = build()
    const first = advanceQueue(queue, true)
    expect(first.entry?.trackId).toBe('b')
    queue = first.state
    expect(advanceQueue(queue, true).entry?.trackId).toBe('c')
  })

  it('gives duplicate tracks distinct entry identities', () => {
    const queue = replaceQueue(emptyQueue(), ['a', 'a'])
    expect(queue.entries[0]?.id).not.toBe(queue.entries[1]?.id)
  })
})

describe('repeat', () => {
  it('stops at the end when repeat is off', () => {
    const queue = build(4)
    expect(nextIndex(queue, true)).toBeNull()
    const result = advanceQueue(queue, true)
    expect(result.entry).toBeNull()
    expect(currentTrackId(result.state)).toBe('e')
  })

  it('wraps to the start when repeat-all is on', () => {
    const queue = setRepeatMode(build(4), 'all')
    expect(advanceQueue(queue, true).entry?.trackId).toBe('a')
  })

  it('repeats one only on an automatic advance', () => {
    const queue = setRepeatMode(build(1), 'one')
    expect(advanceQueue(queue, true).entry?.trackId).toBe('b')
    expect(advanceQueue(queue, false).entry?.trackId).toBe('c')
  })

  it('wraps backwards only when repeat is on', () => {
    expect(previousIndex(build(0))).toBe(0)
    expect(rewindQueue(setRepeatMode(build(0), 'all')).entry?.trackId).toBe('e')
  })

  it('cycles modes off -> all -> one -> off', () => {
    expect(nextRepeatMode('off')).toBe('all')
    expect(nextRepeatMode('all')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })
})

describe('shuffle', () => {
  it('keeps the current track playing', () => {
    const queue = setShuffled(build(3), true, seededRng(42))
    expect(queue.isShuffled).toBe(true)
    expect(currentTrackId(queue)).toBe('d')
    expect(new Set(queue.entries.map((e) => e.trackId))).toEqual(new Set(IDS))
  })

  it('restores the original order and position when switched off', () => {
    const rng = seededRng(7)
    const shuffledQueue = setShuffled(build(1), true, rng)
    const restored = setShuffled(shuffledQueue, false, rng)
    expect(restored.isShuffled).toBe(false)
    expect(restored.entries.map((e) => e.trackId)).toEqual(IDS)
    expect(currentTrackId(restored)).toBe('b')
  })

  it('is deterministic for a given seed', () => {
    const first = setShuffled(build(), true, seededRng(99)).entries.map((e) => e.trackId)
    const second = setShuffled(build(), true, seededRng(99)).entries.map((e) => e.trackId)
    expect(first).toEqual(second)
  })

  it('is safe on an empty queue', () => {
    const queue = setShuffled(emptyQueue(), true, seededRng(1))
    expect(queue.entries).toHaveLength(0)
    expect(queue.currentIndex).toBeNull()
  })

  it('puts the chosen track first when building a shuffled queue', () => {
    const shuffledEmpty = setShuffled(emptyQueue(), true, seededRng(3))
    const queue = replaceQueue(shuffledEmpty, IDS, 2, seededRng(3))
    expect(currentTrackId(queue)).toBe('c')
    expect(queue.currentIndex).toBe(0)
  })
})

describe('queue editing', () => {
  it('inserts play-next directly after the current entry', () => {
    const queue = playNext(build(0), ['x'])
    expect(upcomingEntries(queue)[0]?.trackId).toBe('x')
    expect(queue.entries).toHaveLength(6)
  })

  it('appends to the end', () => {
    const queue = appendToQueue(build(), ['x'])
    expect(queue.entries.at(-1)?.trackId).toBe('x')
  })

  it('selects the first entry when appending to an empty queue', () => {
    expect(appendToQueue(emptyQueue(), ['a', 'b']).currentIndex).toBe(0)
  })

  it('keeps the current track when an earlier entry is removed', () => {
    const queue = build(3)
    const target = queue.entries[1]
    expect(target).toBeDefined()
    const result = removeEntry(queue, target!.id)
    expect(result.removedCurrent).toBe(false)
    expect(currentTrackId(result.state)).toBe('d')
  })

  it('reports removal of the entry that was playing', () => {
    const queue = build(2)
    const current = currentEntry(queue)
    expect(current).not.toBeNull()
    const result = removeEntry(queue, current!.id)
    expect(result.removedCurrent).toBe(true)
    expect(currentTrackId(result.state)).toBe('d')
  })

  it('empties the queue when the last entry is removed', () => {
    const queue = replaceQueue(emptyQueue(), ['a'])
    const result = removeEntry(queue, currentEntry(queue)!.id)
    expect(result.state.entries).toHaveLength(0)
    expect(result.state.currentIndex).toBeNull()
  })

  it('keeps the current track selected after a move', () => {
    const queue = moveEntry(build(0), 0, 2)
    expect(currentTrackId(queue)).toBe('a')
    expect(queue.entries[2]?.trackId).toBe('a')
  })

  it('clears up next but keeps the current track', () => {
    const queue = clearUpcoming(build(2))
    expect(queue.entries).toHaveLength(1)
    expect(currentTrackId(queue)).toBe('c')
    expect(upcomingEntries(queue)).toHaveLength(0)
  })

  it('removes every occurrence of a track', () => {
    const queue = removeTrackFromQueue(replaceQueue(emptyQueue(), ['a', 'b', 'a'], 1), 'a')
    expect(queue.entries.map((e) => e.trackId)).toEqual(['b'])
    expect(currentTrackId(queue)).toBe('b')
  })

  it('jumps to a specific entry', () => {
    const queue = build(0)
    const target = queue.entries[3]
    expect(target).toBeDefined()
    const result = jumpToEntry(queue, target!.id)
    expect(currentTrackId(result.state)).toBe('d')
  })
})
