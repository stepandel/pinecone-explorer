import { createContext, useContext, useCallback, useRef, ReactNode } from 'react'
import { QueryScope, MetadataFilter } from '../types/filters'
import { LocalVectorRecord } from '../types/vectors'
import { QUERY_CACHE } from '../constants/ui'

// Query parameters for a namespace
export interface NamespaceQueryParams {
  scope: QueryScope
  searchText: string
  idSearch: string
  topK: number
  filters: MetadataFilter[]
  alpha: number
}

// Cached search results with timestamp
interface CachedSearchResults {
  results: LocalVectorRecord[]
  timestamp: number
}

// Internal state for a namespace
interface NamespaceQueryState {
  params: NamespaceQueryParams
  searchResults: CachedSearchResults | null
  lastAccessed: number
}

// Namespace key format: `${indexName}::${namespace}`
type NamespaceKey = string

// Default query parameters
function createDefaultParams(defaultAlpha: number = 0.5): NamespaceQueryParams {
  return {
    scope: 'namespace',
    searchText: '',
    idSearch: '',
    topK: 10,
    filters: [],
    alpha: defaultAlpha,
  }
}

// Context value interface
interface QueryStateContextValue {
  getParams: (indexName: string, namespace: string | undefined, defaultAlpha?: number) => NamespaceQueryParams
  saveParams: (indexName: string, namespace: string | undefined, params: NamespaceQueryParams) => void
  getSearchResults: (indexName: string, namespace: string | undefined) => LocalVectorRecord[] | null
  saveSearchResults: (indexName: string, namespace: string | undefined, results: LocalVectorRecord[]) => void
  clearIndex: (indexName: string) => void
}

const QueryStateContext = createContext<QueryStateContextValue | null>(null)

interface QueryStateProviderProps {
  children: ReactNode
}

export function QueryStateProvider({ children }: QueryStateProviderProps) {
  // Use ref for Map storage to avoid re-renders on state updates
  const stateMapRef = useRef<Map<NamespaceKey, NamespaceQueryState>>(new Map())
  // Track access order for LRU eviction
  const accessOrderRef = useRef<NamespaceKey[]>([])

  // Create namespace key
  const makeKey = (indexName: string, namespace: string | undefined): NamespaceKey => {
    return `${indexName}::${namespace ?? ''}`
  }

  // Update access order for LRU
  const touchKey = (key: NamespaceKey) => {
    const order = accessOrderRef.current
    const idx = order.indexOf(key)
    if (idx !== -1) {
      order.splice(idx, 1)
    }
    order.push(key)
  }

  // Evict oldest entries if over limit
  const evictIfNeeded = () => {
    const order = accessOrderRef.current
    const stateMap = stateMapRef.current

    while (order.length > QUERY_CACHE.MAX_CACHED_NAMESPACES) {
      const oldestKey = order.shift()
      if (oldestKey) {
        stateMap.delete(oldestKey)
      }
    }
  }

  const getParams = useCallback((
    indexName: string,
    namespace: string | undefined,
    defaultAlpha: number = 0.5
  ): NamespaceQueryParams => {
    const key = makeKey(indexName, namespace)
    const state = stateMapRef.current.get(key)

    if (state) {
      touchKey(key)
      state.lastAccessed = Date.now()
      return { ...state.params }
    }

    return createDefaultParams(defaultAlpha)
  }, [])

  const saveParams = useCallback((
    indexName: string,
    namespace: string | undefined,
    params: NamespaceQueryParams
  ) => {
    const key = makeKey(indexName, namespace)
    const stateMap = stateMapRef.current
    const existing = stateMap.get(key)

    stateMap.set(key, {
      params: { ...params },
      searchResults: existing?.searchResults ?? null,
      lastAccessed: Date.now(),
    })

    touchKey(key)
    evictIfNeeded()
  }, [])

  const getSearchResults = useCallback((
    indexName: string,
    namespace: string | undefined
  ): LocalVectorRecord[] | null => {
    const key = makeKey(indexName, namespace)
    const state = stateMapRef.current.get(key)

    if (!state?.searchResults) {
      return null
    }

    // Check TTL
    const age = Date.now() - state.searchResults.timestamp
    if (age > QUERY_CACHE.RESULTS_TTL_MS) {
      // Expired - clear results
      state.searchResults = null
      return null
    }

    touchKey(key)
    state.lastAccessed = Date.now()
    return state.searchResults.results
  }, [])

  const saveSearchResults = useCallback((
    indexName: string,
    namespace: string | undefined,
    results: LocalVectorRecord[]
  ) => {
    const key = makeKey(indexName, namespace)
    const stateMap = stateMapRef.current
    const existing = stateMap.get(key)

    // Truncate results if over limit to prevent memory bloat
    const truncatedResults = results.slice(0, QUERY_CACHE.MAX_RESULTS_PER_NAMESPACE)

    if (existing) {
      existing.searchResults = {
        results: truncatedResults,
        timestamp: Date.now(),
      }
      existing.lastAccessed = Date.now()
    } else {
      // Create entry with default params if none exists
      stateMap.set(key, {
        params: createDefaultParams(),
        searchResults: {
          results: truncatedResults,
          timestamp: Date.now(),
        },
        lastAccessed: Date.now(),
      })
    }

    touchKey(key)
    evictIfNeeded()
  }, [])

  const clearIndex = useCallback((indexName: string) => {
    const stateMap = stateMapRef.current
    const order = accessOrderRef.current
    const prefix = `${indexName}::`

    // Remove all entries for this index
    for (const key of Array.from(stateMap.keys())) {
      if (key.startsWith(prefix)) {
        stateMap.delete(key)
        const idx = order.indexOf(key)
        if (idx !== -1) {
          order.splice(idx, 1)
        }
      }
    }
  }, [])

  const value: QueryStateContextValue = {
    getParams,
    saveParams,
    getSearchResults,
    saveSearchResults,
    clearIndex,
  }

  return (
    <QueryStateContext.Provider value={value}>
      {children}
    </QueryStateContext.Provider>
  )
}

export function useQueryState() {
  const context = useContext(QueryStateContext)
  if (!context) {
    throw new Error('useQueryState must be used within a QueryStateProvider')
  }
  return context
}
