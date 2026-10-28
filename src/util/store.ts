/**
 * Minimal observable store.
 *
 * Exists so the app can feed `useSyncExternalStore` without pulling in a state library: the
 * whole contract is "hold an immutable snapshot, tell subscribers when it is replaced".
 * Playback must keep running regardless of what React is doing, so the stores own the state
 * and the components only read it.
 */
export class Store<T> {
  private snapshot: T
  private readonly listeners = new Set<() => void>()

  constructor(initial: T) {
    this.snapshot = initial
  }

  get state(): T {
    return this.snapshot
  }

  getSnapshot = (): T => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected set(next: T): void {
    if (Object.is(next, this.snapshot)) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  protected update(mutate: (current: T) => T): void {
    this.set(mutate(this.snapshot))
  }
}
