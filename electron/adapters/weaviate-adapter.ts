/**
 * Weaviate Database Adapter
 * 
 * Implements the VectorDatabase interface for Weaviate.
 * 
 * Key differences from Pinecone:
 * - Collections (classes) instead of Indexes
 * - Objects instead of Vectors
 * - Properties instead of Metadata
 * - Schema-based approach (need to define properties)
 * - GraphQL-style queries
 * - Multi-tenancy for partitioning (instead of namespaces)
 * - Certainty/Distance instead of Score
 */

import weaviate, { WeaviateClient } from 'weaviate-client'
import { BaseVectorAdapter } from './base-adapter'
import {
  DatabaseProvider,
  DatabaseCapabilities,
  ConnectionConfig,
  WeaviateConnectionConfig,
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
  DistanceMetric,
} from './types'

// Weaviate distance metric mapping
const DISTANCE_MAP: Record<string, DistanceMetric> = {
  'cosine': 'cosine',
  'l2-squared': 'euclidean',
  'dot': 'dotproduct',
  'manhattan': 'manhattan',
}

const REVERSE_DISTANCE_MAP: Record<DistanceMetric, string> = {
  'cosine': 'cosine',
  'euclidean': 'l2-squared',
  'dotproduct': 'dot',
  'manhattan': 'manhattan',
}

export class WeaviateAdapter extends BaseVectorAdapter {
  readonly provider: DatabaseProvider = 'weaviate'
  
  readonly capabilities: DatabaseCapabilities = {
    supportsNamespaces: true, // Via multi-tenancy
    supportsSparseVectors: false, // BM25 hybrid instead
    supportsHybridSearch: true, // BM25 + vector
    supportsIntegratedEmbeddings: true, // Vectorizer modules
    supportsReranking: false, // External reranking required
    supportedMetrics: ['cosine', 'euclidean', 'dotproduct', 'manhattan'],
    maxDimension: 65535,
    supportsVectorListing: true,
    supportsMetadataUpdate: true,
  }

  private client: WeaviateClient | null = null

  // ============================================================================
  // Connection
  // ============================================================================

  async connect(config: ConnectionConfig): Promise<void> {
    const weaviateConfig = config as WeaviateConnectionConfig
    
    // Parse connection based on config
    if (weaviateConfig.host.includes('weaviate.network') || weaviateConfig.host.includes('wcs.api.weaviate.io')) {
      // Weaviate Cloud
      this.client = await weaviate.connectToWeaviateCloud(
        weaviateConfig.host,
        { authCredentials: new weaviate.ApiKey(weaviateConfig.apiKey || '') }
      )
    } else {
      // Local/Custom deployment
      this.client = await weaviate.connectToLocal({
        host: weaviateConfig.host.replace(/:\d+$/, ''),
        port: parseInt(weaviateConfig.host.split(':').pop() || '8080', 10),
        grpcPort: 50051, // Default gRPC port
      })
    }

    // Test connection by checking readiness
    const ready = await this.client.isReady()
    if (!ready) {
      throw new Error('Weaviate server is not ready')
    }
    
    this.config = config
    this.connected = true
  }

  protected onDisconnect(): void {
    if (this.client) {
      this.client.close()
    }
    this.client = null
  }

  // ============================================================================
  // Collection Operations
  // ============================================================================

  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureConnected()
    
    const collections = await this.client!.collections.listAll()
    
    return collections.map((coll): CollectionInfo => {
      // Extract vector config
      let dimension: number | undefined
      let metric: DistanceMetric = 'cosine'
      
      // Weaviate v4 collection structure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collAny = coll as any
      const vectorConfig = collAny.vectorizers?.default
      if (vectorConfig) {
        // Vector index config contains dimension and distance
        const indexConfig = collAny.vectorIndexConfig
        if (indexConfig && 'distance' in indexConfig) {
          metric = DISTANCE_MAP[indexConfig.distance as string] || 'cosine'
        }
      }
      
      return {
        name: coll.name,
        dimension,
        metric,
        vectorType: 'dense', // Weaviate primarily uses dense vectors
        ready: true, // Weaviate collections are always ready once created
        status: 'ready',
        providerMetadata: {
          multiTenancy: coll.multiTenancy,
          vectorizers: coll.vectorizers,
          generative: coll.generative,
        },
      }
    })
  }

  async getCollectionStats(name: string): Promise<CollectionStats> {
    this.ensureConnected()
    this.validateCollectionName(name)

    const collection = this.client!.collections.use(name)
    
    // Get aggregate count
    const aggregate = await collection.aggregate.overAll()
    const vectorCount = aggregate.totalCount || 0
    
    // Weaviate doesn't expose dimension easily - would need to check schema
    // For now, return 0 and let UI handle it
    
    return {
      namespaces: {
        '': { vectorCount },
      },
      dimension: 0, // Not easily available in Weaviate
      totalVectorCount: vectorCount,
    }
  }

  async createCollection(params: CreateCollectionParams): Promise<void> {
    this.ensureConnected()
    
    // Weaviate collection name must start with uppercase
    const collectionName = params.name.charAt(0).toUpperCase() + params.name.slice(1)
    
    // Map metric - Weaviate doesn't support all metrics
    const weaviateMetric = params.metric === 'manhattan' ? 'l2-squared' : REVERSE_DISTANCE_MAP[params.metric || 'cosine']
    
    await this.client!.collections.create({
      name: collectionName,
      vectorizers: weaviate.configure.vectorizer.none({
        vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
          distanceMetric: weaviateMetric as 'cosine' | 'dot' | 'l2-squared',
        }),
      }),
      // Properties will be auto-created on first insert
    })
  }

  async deleteCollection(name: string): Promise<void> {
    this.ensureConnected()
    this.validateCollectionName(name)

    await this.client!.collections.delete(name)
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  async listVectors(params: ListParams): Promise<PaginatedResult<VectorRecord>> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(params.collectionName)
    const limit = params.limit || 100
    
    // Use iterator for pagination
    let items: VectorRecord[] = []
    let count = 0
    
    // Parse cursor as offset
    const offset = params.cursor ? parseInt(params.cursor, 10) : 0
    let currentOffset = 0
    
    for await (const obj of collection.iterator({
      includeVector: true,
    })) {
      currentOffset++
      if (currentOffset <= offset) continue
      
      items.push({
        id: obj.uuid,
        values: obj.vectors?.default as number[] | undefined,
        metadata: obj.properties as Record<string, unknown>,
      })
      
      count++
      if (count >= limit) break
    }

    const hasMore = count === limit
    const nextCursor = hasMore ? String(offset + limit) : undefined

    return {
      items,
      nextCursor,
      hasMore,
    }
  }

  async fetchVectors(
    collectionName: string, 
    ids: string[], 
    namespace?: string
  ): Promise<VectorRecord[]> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(collectionName)
    const results: VectorRecord[] = []
    
    for (const id of ids) {
      try {
        const obj = await collection.query.fetchObjectById(id, {
          includeVector: true,
        })
        
        if (obj) {
          results.push({
            id: obj.uuid,
            values: obj.vectors?.default as number[] | undefined,
            metadata: obj.properties as Record<string, unknown>,
          })
        }
      } catch {
        // Object not found, skip
      }
    }
    
    return results
  }

  async queryVectors(params: QueryParams): Promise<QueryResult> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(params.collectionName)
    
    if (!params.vector && !params.queryText && !params.id) {
      throw new Error('Query requires vector, queryText, or id')
    }

    let results: Array<{
      uuid: string
      properties: Record<string, unknown>
      vectors?: { default?: number[] }
      metadata?: { distance?: number; certainty?: number }
    }>

    if (params.id) {
      // Fetch by ID and find similar
      const source = await collection.query.fetchObjectById(params.id, {
        includeVector: true,
      })
      
      if (!source || !source.vectors?.default) {
        throw new Error(`Object ${params.id} not found or has no vector`)
      }
      
      const response = await collection.query.nearVector(source.vectors.default as number[], {
        limit: params.topK || 10,
        includeVector: params.includeValues ?? false,
        returnMetadata: ['distance', 'certainty'],
      })
      results = response.objects
    } else if (params.vector) {
      // Vector search
      const response = await collection.query.nearVector(params.vector, {
        limit: params.topK || 10,
        includeVector: params.includeValues ?? false,
        returnMetadata: ['distance', 'certainty'],
      })
      results = response.objects
    } else if (params.queryText) {
      // Text search (requires vectorizer module)
      const response = await collection.query.nearText(params.queryText, {
        limit: params.topK || 10,
        includeVector: params.includeValues ?? false,
        returnMetadata: ['distance', 'certainty'],
      })
      results = response.objects
    } else {
      results = []
    }

    return {
      matches: results.map(obj => ({
        id: obj.uuid,
        // Convert Weaviate certainty (0-1) or distance to score
        score: obj.metadata?.certainty ?? (1 - (obj.metadata?.distance || 0)),
        values: params.includeValues ? (obj.vectors?.default as number[] | undefined) : undefined,
        metadata: params.includeMetadata !== false ? obj.properties : null,
      })),
      namespace: '',
    }
  }

  async upsertVectors(params: UpsertParams): Promise<void> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(params.collectionName)
    
    // Weaviate prefers batch inserts
    // Insert objects one by one to handle the complex types properly
    for (const v of params.vectors) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await collection.data.insert({
          id: v.id,
          properties: v.metadata || {},
          vectors: v.values,
        } as any)
      } catch (error) {
        // If insert fails, try update
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await collection.data.update({
            id: v.id,
            properties: v.metadata,
            vector: v.values,
          } as any)
        } catch {
          // Ignore update errors
        }
      }
    }
  }

  async updateVector(params: UpdateParams): Promise<void> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(params.collectionName)
    
    // Weaviate update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collection.data.update({
      id: params.id,
      properties: params.metadata,
      vector: params.values,
    } as any)
  }

  async deleteVectors(params: DeleteParams): Promise<void> {
    this.ensureConnected()
    
    const collection = this.client!.collections.use(params.collectionName)

    if (params.deleteAll) {
      // Delete all by iterating and deleting one by one
      const idsToDelete: string[] = []
      for await (const obj of collection.iterator()) {
        idsToDelete.push(obj.uuid)
      }
      
      // Delete in batches
      for (const id of idsToDelete) {
        try {
          await collection.data.deleteById(id)
        } catch {
          // Ignore errors for individual deletes
        }
      }
    } else if (params.ids && params.ids.length > 0) {
      // Delete by IDs one by one
      for (const id of params.ids) {
        try {
          await collection.data.deleteById(id)
        } catch {
          // Ignore errors for individual deletes
        }
      }
    } else if (params.filter) {
      // For filter-based deletion, we need to query first then delete
      // This is a limitation - Weaviate's deleteMany API is complex
      console.warn('Filter-based deletion not fully implemented for Weaviate')
    }
  }

  // ============================================================================
  // Filter Translation
  // ============================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private translateWeaviateFilter(
    filter: Record<string, unknown>,
    collection: ReturnType<WeaviateClient['collections']['use']>
  ): any {
    // Basic translation - Weaviate uses builder pattern for filters
    // This handles simple cases. Return type is 'any' due to Weaviate's complex filter types.
    
    const entries = Object.entries(filter)
    if (entries.length === 0) return null
    
    const [key, value] = entries[0]
    const filterBuilder = collection.filter.byProperty(key)
    
    if (typeof value === 'object' && value !== null) {
      const [op, opValue] = Object.entries(value as Record<string, unknown>)[0]
      
      switch (op) {
        case '$eq':
          return filterBuilder.equal(opValue as string | number | boolean)
        case '$ne':
          return filterBuilder.notEqual(opValue as string | number | boolean)
        case '$gt':
          return filterBuilder.greaterThan(opValue as number)
        case '$gte':
          return filterBuilder.greaterOrEqual(opValue as number)
        case '$lt':
          return filterBuilder.lessThan(opValue as number)
        case '$lte':
          return filterBuilder.lessOrEqual(opValue as number)
        case '$in':
          return filterBuilder.containsAny(opValue as string[])
        default:
          return null
      }
    } else {
      // Simple equality
      return filterBuilder.equal(value as string | number | boolean)
    }
  }
}
