/**
 * Database Adapter Factory
 * 
 * Creates the appropriate adapter based on connection configuration.
 * Lazy-loads SDK dependencies to minimize bundle impact.
 */

import {
  VectorDatabase,
  DatabaseProvider,
  ConnectionConfig,
  DatabaseAdapterFactory,
  PineconeConnectionConfig,
  QdrantConnectionConfig,
  WeaviateConnectionConfig,
} from './types'

// Lazy-loaded adapter instances
let pineconeAdapterModule: typeof import('./pinecone-adapter') | null = null
let qdrantAdapterModule: typeof import('./qdrant-adapter') | null = null
let weaviateAdapterModule: typeof import('./weaviate-adapter') | null = null

/**
 * Create a database adapter for the given configuration
 */
export async function createDatabaseAdapter(config: ConnectionConfig): Promise<VectorDatabase> {
  switch (config.provider) {
    case 'pinecone':
      return createPineconeAdapter(config as PineconeConnectionConfig)
    case 'qdrant':
      return createQdrantAdapter(config as QdrantConnectionConfig)
    case 'weaviate':
      return createWeaviateAdapter(config as WeaviateConnectionConfig)
    default:
      throw new Error(`Unknown database provider: ${(config as ConnectionConfig).provider}`)
  }
}

async function createPineconeAdapter(config: PineconeConnectionConfig): Promise<VectorDatabase> {
  if (!pineconeAdapterModule) {
    pineconeAdapterModule = await import('./pinecone-adapter')
  }
  const adapter = new pineconeAdapterModule.PineconeAdapter()
  await adapter.connect(config)
  return adapter
}

async function createQdrantAdapter(config: QdrantConnectionConfig): Promise<VectorDatabase> {
  if (!qdrantAdapterModule) {
    qdrantAdapterModule = await import('./qdrant-adapter')
  }
  const adapter = new qdrantAdapterModule.QdrantAdapter()
  await adapter.connect(config)
  return adapter
}

async function createWeaviateAdapter(config: WeaviateConnectionConfig): Promise<VectorDatabase> {
  if (!weaviateAdapterModule) {
    weaviateAdapterModule = await import('./weaviate-adapter')
  }
  const adapter = new weaviateAdapterModule.WeaviateAdapter()
  await adapter.connect(config)
  return adapter
}

/**
 * Get list of supported database providers
 */
export function getSupportedProviders(): DatabaseProvider[] {
  return ['pinecone', 'qdrant', 'weaviate']
}

/**
 * Factory class implementation (for dependency injection patterns)
 */
export class VectorDatabaseFactory implements DatabaseAdapterFactory {
  private adapterCache = new Map<string, VectorDatabase>()

  async create(config: ConnectionConfig): Promise<VectorDatabase> {
    // Use connection name as cache key
    const cacheKey = `${config.provider}:${config.name}`
    
    // Return cached adapter if exists and connected
    const cached = this.adapterCache.get(cacheKey)
    if (cached?.isConnected()) {
      return cached
    }
    
    // Create new adapter
    const adapter = await createDatabaseAdapter(config)
    this.adapterCache.set(cacheKey, adapter)
    return adapter
  }

  getSupportedProviders(): DatabaseProvider[] {
    return getSupportedProviders()
  }

  /**
   * Disconnect and remove a specific adapter from cache
   */
  removeAdapter(provider: DatabaseProvider, name: string): void {
    const cacheKey = `${provider}:${name}`
    const adapter = this.adapterCache.get(cacheKey)
    if (adapter) {
      adapter.disconnect()
      this.adapterCache.delete(cacheKey)
    }
  }

  /**
   * Disconnect all cached adapters
   */
  disconnectAll(): void {
    for (const adapter of this.adapterCache.values()) {
      adapter.disconnect()
    }
    this.adapterCache.clear()
  }
}

// Singleton factory instance
export const databaseFactory = new VectorDatabaseFactory()
