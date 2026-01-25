/** Virtual scrolling configuration */
export const VIRTUALIZATION = {
  ROW_HEIGHT: 32,
  OVERSCAN: 10,
} as const

/** Pagination configuration */
export const PAGINATION = {
  VECTORS_PER_PAGE: 100,
  INITIAL_LOAD_LIMIT: 1000,
} as const

/** Query timing configuration (in milliseconds) */
export const QUERY = {
  STALE_TIME_INDEXES: 2 * 60 * 1000,      // 2 minutes
  STALE_TIME_STATS: 30 * 1000,            // 30 seconds
  STALE_TIME_VECTORS: 5 * 60 * 1000,      // 5 minutes
  GC_TIME_VECTORS: 10 * 60 * 1000,        // 10 minutes
  DEBOUNCE_SEARCH: 300,                   // 300ms
} as const

/** Query state cache configuration */
export const QUERY_CACHE = {
  MAX_CACHED_NAMESPACES: 5,
  RESULTS_TTL_MS: 2 * 60 * 1000,          // 2 minutes
  MAX_RESULTS_PER_NAMESPACE: 500,
} as const
