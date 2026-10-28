/**
 * Logging that is quiet in production and never records a filename, a track title or any other
 * piece of the user's content — only counts, formats and error messages.
 */
const enabled = import.meta.env.DEV

type Scope = 'audio' | 'library' | 'import' | 'storage' | 'sw'

const emit = (level: 'debug' | 'warn' | 'error', scope: Scope, message: string): void => {
  if (!enabled && level === 'debug') return
  const line = `[rava:${scope}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.debug(line)
}

export const log = {
  debug: (scope: Scope, message: string) => {
    emit('debug', scope, message)
  },
  warn: (scope: Scope, message: string) => {
    emit('warn', scope, message)
  },
  error: (scope: Scope, message: string) => {
    emit('error', scope, message)
  },
}

/** Narrows an unknown catch value to a message without leaking object internals. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
