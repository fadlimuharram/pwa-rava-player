import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { Store } from '../util/store'
import { createServices, type Services } from './services'
import { errorMessage } from '../util/log'

const ServicesContext = createContext<Services | null>(null)

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (services === null) throw new Error('useServices must be used inside <AppProvider>')
  return services
}

/** Subscribes a component to one store. Re-renders only when that store's snapshot changes. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

interface Props {
  readonly children: ReactNode
  readonly fallback: ReactNode
  readonly renderError: (message: string) => ReactNode
}

export function AppProvider({ children, fallback, renderError }: Props): ReactNode {
  const [services, setServices] = useState<Services | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createServices()
      .then((created) => {
        if (!cancelled) setServices(created)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error !== null) return renderError(error)
  if (services === null) return fallback
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
}
