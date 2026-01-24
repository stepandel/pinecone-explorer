/**
 * Retry utility with exponential backoff for handling rate limits (429s)
 * Designed for Pinecone API calls that may be rate limited
 */

export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  jitterFactor: number // 0-1, adds randomization to prevent thundering herd
}

// Default configuration optimized for Pinecone API
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,  // 30 seconds max
  backoffMultiplier: 2,
  jitterFactor: 0.1,  // ±10% jitter
}

/**
 * Check if an error is a rate limit (429) error
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false

  // Check for HTTP status code
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>

    // Direct status check
    if (err.status === 429) return true
    if (err.statusCode === 429) return true

    // Nested response check
    if (err.response && typeof err.response === 'object') {
      const response = err.response as Record<string, unknown>
      if (response.status === 429) return true
    }

    // Check error code
    if (err.code === 'RATE_LIMITED' || err.code === 'rate_limited') return true
  }

  // Check error message
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  return (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('rate_limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('quota exceeded')
  )
}

/**
 * Check if an error is retryable (rate limits + transient errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (isRateLimitError(error)) return true

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>
    const status = (err.status || err.statusCode) as number | undefined

    // Retry on server errors (5xx) and some specific client errors
    if (status && status >= 500 && status < 600) return true
    if (status === 408) return true // Request Timeout
    if (status === 503) return true // Service Unavailable
  }

  // Check for network errors
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  return (
    lowerMessage.includes('network') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('socket hang up')
  )
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs)

  // Add jitter (randomization)
  const jitterRange = cappedDelay * config.jitterFactor
  const jitter = (Math.random() * 2 - 1) * jitterRange // Random between -jitterRange and +jitterRange

  return Math.max(0, Math.round(cappedDelay + jitter))
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute a function with retry logic and exponential backoff
 * Automatically retries on rate limits (429) and transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: unknown) => void
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: unknown

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt >= fullConfig.maxRetries || !isRetryableError(error)) {
        throw error
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, fullConfig)

      // Notify caller about retry (for logging/UI updates)
      onRetry?.(attempt + 1, delay, error)

      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError
}

/**
 * Create a retry wrapper with pre-configured settings
 * Useful for wrapping multiple API calls with the same config
 */
export function createRetryWrapper(
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: unknown) => void
) {
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return withRetry(fn, config, onRetry)
  }
}
