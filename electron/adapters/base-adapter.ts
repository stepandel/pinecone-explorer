/**
 * Base adapter class with common functionality for all vector database adapters
 */

import {
  VectorDatabase,
  DatabaseProvider,
  DatabaseCapabilities,
  ConnectionConfig,
  CollectionInfo,
  CollectionStats,
  CreateCollectionParams,
  VectorRecord,
  QueryParams,
  QueryResult,
  UpsertParams,
  UpdateParams,
  DeleteParams,
  ListParams,
  PaginatedResult,
  FilterExpression,
} from './types'

export abstract class BaseVectorAdapter implements VectorDatabase {
  abstract readonly provider: DatabaseProvider
  abstract readonly capabilities: DatabaseCapabilities

  protected connected = false
  protected config: ConnectionConfig | null = null

  // ============================================================================
  // Connection (must be implemented by each adapter)
  // ============================================================================

  abstract connect(config: ConnectionConfig): Promise<void>
  
  disconnect(): void {
    this.connected = false
    this.config = null
    this.onDisconnect()
  }

  isConnected(): boolean {
    return this.connected
  }

  /** Override to clean up provider-specific resources */
  protected onDisconnect(): void {
    // Default: no-op
  }

  // ============================================================================
  // Collection Operations (must be implemented by each adapter)
  // ============================================================================

  abstract listCollections(): Promise<CollectionInfo[]>
  abstract getCollectionStats(name: string): Promise<CollectionStats>
  abstract createCollection(params: CreateCollectionParams): Promise<void>
  abstract deleteCollection(name: string): Promise<void>

  // ============================================================================
  // Vector Operations (must be implemented by each adapter)
  // ============================================================================

  abstract listVectors(params: ListParams): Promise<PaginatedResult<VectorRecord>>
  abstract fetchVectors(collectionName: string, ids: string[], namespace?: string): Promise<VectorRecord[]>
  abstract queryVectors(params: QueryParams): Promise<QueryResult>
  abstract upsertVectors(params: UpsertParams): Promise<void>
  abstract updateVector(params: UpdateParams): Promise<void>
  abstract deleteVectors(params: DeleteParams): Promise<void>

  // ============================================================================
  // Filter Translation Helpers
  // ============================================================================

  /**
   * Translate unified filter expression to provider-specific format.
   * Each adapter should override this with its own implementation.
   */
  protected translateFilter(filter: FilterExpression | Record<string, unknown>): unknown {
    // Default: pass through as-is (adapters should override)
    return filter
  }

  // ============================================================================
  // Common Utilities
  // ============================================================================

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`${this.provider} adapter not connected. Call connect() first.`)
    }
  }

  protected validateCollectionName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Collection name is required')
    }
  }

  /**
   * Batch an array into chunks of specified size
   */
  protected batch<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Retry an operation with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Don't retry on client errors (4xx)
        const status = (error as { status?: number }).status
        if (status && status >= 400 && status < 500) {
          throw lastError
        }
        
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt)
          await this.sleep(delay)
        }
      }
    }
    
    throw lastError
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
