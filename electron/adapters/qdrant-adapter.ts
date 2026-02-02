/**
 * Qdrant Database Adapter
 * 
 * Implements the VectorDatabase interface for Qdrant.
 * 
 * Key differences from Pinecone:
 * - Collections instead of Indexes
 * - Points instead of Vectors
 * - Payloads instead of Metadata
 * - No native namespaces (use payload filtering for partitioning)
 * - Scroll-based pagination instead of token-based
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import { BaseVectorAdapter } from './base-adapter'
import {
  DatabaseProvider,
  DatabaseCapabilities,
  ConnectionConfig,
  QdrantConnectionConfig,
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
  SparseVector,
} from './types'

// Qdrant distance metric mapping
const DISTANCE_MAP: Record<string, DistanceMetric> = {
  'Cosine': 'cosine',
  'Euclid': 'euclidean',
  'Dot': 'dotproduct',
  'Manhattan': 'manhattan',
}

const REVERSE_DISTANCE_MAP: Record<DistanceMetric, string> = {
  'cosine': 'Cosine',
  'euclidean': 'Euclid',
  'dotproduct': 'Dot',
  'manhattan': 'Manhattan',
}

export class QdrantAdapter extends BaseVectorAdapter {
  readonly provider: DatabaseProvider = 'qdrant'
  
  readonly capabilities: DatabaseCapabilities = {
    supportsNamespaces: false, // Use payload filtering instead
    supportsSparseVectors: true,
    supportsHybridSearch: true,
    supportsIntegratedEmbeddings: false, // External embedding required
    supportsReranking: false, // External reranking required
    supportedMetrics: ['cosine', 'euclidean', 'dotproduct', 'manhattan'],
    maxDimension: 65535,
    supportsVectorListing: true,
    supportsMetadataUpdate: true,
  }

  private client: QdrantClient | null = null

  // ============================================================================
  // Connection
  // ============================================================================

  async connect(config: ConnectionConfig): Promise<void> {
    const qdrantConfig = config as QdrantConnectionConfig
    
    // Parse URL to extract host and port
    const url = new URL(qdrantConfig.url)
    const isHttps = url.protocol === 'https:'
    
    this.client = new QdrantClient({
      url: qdrantConfig.url,
      apiKey: qdrantConfig.apiKey,
    })

    // Test connection by listing collections
    await this.client.getCollections()
    
    this.config = config
    this.connected = true
  }

  protected onDisconnect(): void {
    this.client = null
  }

  // ============================================================================
  // Collection Operations
  // ============================================================================

  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureConnected()
    
    const response = await this.withRetry(() => this.client!.getCollections())
    
    const collections: CollectionInfo[] = []
    
    for (const coll of response.collections) {
      // Get detailed info for each collection
      const info = await this.withRetry(() => this.client!.getCollection(coll.name))
      
      // Determine vector config
      let dimension: number | undefined
      let metric: DistanceMetric = 'cosine'
      let vectorType: 'dense' | 'sparse' | 'hybrid' = 'dense'
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vectorsConfig = info.config?.params?.vectors as any
      if (vectorsConfig) {
        if (typeof vectorsConfig === 'object' && 'size' in vectorsConfig && typeof vectorsConfig.size === 'number') {
          // Single vector config
          dimension = vectorsConfig.size
          metric = DISTANCE_MAP[vectorsConfig.distance as string] || 'cosine'
        } else if (typeof vectorsConfig === 'object') {
          // Named vectors - get first one for display
          const firstKey = Object.keys(vectorsConfig)[0]
          const firstVector = firstKey ? vectorsConfig[firstKey] : null
          if (firstVector && typeof firstVector === 'object' && 'size' in firstVector && typeof firstVector.size === 'number') {
            dimension = firstVector.size
            metric = DISTANCE_MAP[firstVector.distance as string] || 'cosine'
          }
        }
      }
      
      // Check for sparse vectors
      if (info.config?.params?.sparse_vectors) {
        vectorType = dimension ? 'hybrid' : 'sparse'
      }
      
      collections.push({
        name: coll.name,
        dimension,
        metric,
        vectorType,
        ready: info.status === 'green',
        status: info.status || 'unknown',
        vectorCount: info.points_count ?? undefined,
        providerMetadata: {
          indexed_vectors_count: info.indexed_vectors_count,
          config: info.config,
        },
      })
    }
    
    return collections
  }

  async getCollectionStats(name: string): Promise<CollectionStats> {
    this.ensureConnected()
    this.validateCollectionName(name)

    const info = await this.withRetry(() => this.client!.getCollection(name))
    
    // Qdrant doesn't have namespaces - return single "default" namespace
    const vectorCount = info.points_count || 0
    
    // Get dimension from config
    let dimension = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vectorsConfig = info.config?.params?.vectors as any
    if (vectorsConfig && typeof vectorsConfig === 'object' && 'size' in vectorsConfig && typeof vectorsConfig.size === 'number') {
      dimension = vectorsConfig.size
    }

    return {
      namespaces: {
        '': { vectorCount },
      },
      dimension,
      totalVectorCount: vectorCount,
    }
  }

  async createCollection(params: CreateCollectionParams): Promise<void> {
    this.ensureConnected()
    
    const metric = REVERSE_DISTANCE_MAP[params.metric || 'cosine'] as 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan'
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {}
    
    // Dense vectors
    if (params.vectorType !== 'sparse' && params.dimension) {
      createParams.vectors = {
        size: params.dimension,
        distance: metric,
      }
    }
    
    // Sparse vectors
    if (params.vectorType === 'sparse' || params.vectorType === 'hybrid') {
      createParams.sparse_vectors = {
        sparse: {}, // Default sparse vector config
      }
    }

    await this.withRetry(() => 
      this.client!.createCollection(params.name, createParams)
    )
  }

  async deleteCollection(name: string): Promise<void> {
    this.ensureConnected()
    this.validateCollectionName(name)

    await this.withRetry(() => this.client!.deleteCollection(name))
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  async listVectors(params: ListParams): Promise<PaginatedResult<VectorRecord>> {
    this.ensureConnected()
    
    const limit = params.limit || 100
    
    // Parse cursor as offset (Qdrant uses scroll with offset)
    const offset = params.cursor ? parseInt(params.cursor, 10) : 0
    
    const response = await this.withRetry(() => 
      this.client!.scroll(params.collectionName, {
        limit,
        offset,
        with_payload: true,
        with_vector: true,
      })
    )

    const items: VectorRecord[] = response.points.map(point => ({
      id: String(point.id),
      values: Array.isArray(point.vector) ? point.vector as number[] : undefined,
      metadata: point.payload as Record<string, unknown> | null,
    }))

    const hasMore = items.length === limit
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
    
    // Convert string IDs to Qdrant point IDs (can be string or number)
    const pointIds = ids.map(id => {
      const num = parseInt(id, 10)
      return isNaN(num) ? id : num
    })

    const response = await this.withRetry(() => 
      this.client!.retrieve(collectionName, {
        ids: pointIds,
        with_payload: true,
        with_vector: true,
      })
    )

    return response.map(point => ({
      id: String(point.id),
      values: Array.isArray(point.vector) ? point.vector as number[] : undefined,
      metadata: point.payload as Record<string, unknown> | null,
    }))
  }

  async queryVectors(params: QueryParams): Promise<QueryResult> {
    this.ensureConnected()
    
    if (!params.vector && !params.sparseVector && !params.id) {
      throw new Error('Query requires vector, sparseVector, or id')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let results: any[]

    if (params.id) {
      // Query by ID - use recommend API
      const queryId = params.id
      const response = await this.withRetry(() =>
        this.client!.recommend(params.collectionName, {
          positive: [queryId],
          limit: params.topK || 10,
          with_payload: params.includeMetadata ?? true,
          with_vector: params.includeValues ?? false,
          filter: params.filter ? this.translateQdrantFilter(params.filter) : undefined,
        })
      )
      results = response
    } else {
      // Query by vector
      const response = await this.withRetry(() =>
        this.client!.search(params.collectionName, {
          vector: params.vector!,
          limit: params.topK || 10,
          with_payload: params.includeMetadata ?? true,
          with_vector: params.includeValues ?? false,
          filter: params.filter ? this.translateQdrantFilter(params.filter) : undefined,
        })
      )
      results = response
    }

    return {
      matches: results.map(result => ({
        id: String(result.id),
        score: result.score || 0,
        values: Array.isArray(result.vector) ? result.vector as number[] : undefined,
        metadata: (result.payload || null) as Record<string, unknown> | null,
      })),
      namespace: '',
    }
  }

  async upsertVectors(params: UpsertParams): Promise<void> {
    this.ensureConnected()
    
    const BATCH_SIZE = 100

    for (const batch of this.batch(params.vectors, BATCH_SIZE)) {
      const points = batch.map((v, idx) => ({
        id: v.id || idx,
        vector: v.values || [],
        payload: v.metadata || {},
      }))
      
      await this.withRetry(() => 
        this.client!.upsert(params.collectionName, {
          wait: true,
          points,
        })
      )
    }
  }

  async updateVector(params: UpdateParams): Promise<void> {
    this.ensureConnected()
    
    const pointId = parseInt(params.id, 10)
    const id = isNaN(pointId) ? params.id : pointId

    // Update payload if provided
    if (params.metadata) {
      await this.withRetry(() =>
        this.client!.setPayload(params.collectionName, {
          wait: true,
          points: [id],
          payload: params.metadata!,
        })
      )
    }

    // Update vector if provided (requires upsert in Qdrant)
    if (params.values) {
      await this.upsertVectors({
        collectionName: params.collectionName,
        vectors: [{
          id: params.id,
          values: params.values,
          metadata: params.metadata,
        }],
      })
    }
  }

  async deleteVectors(params: DeleteParams): Promise<void> {
    this.ensureConnected()
    
    if (params.deleteAll) {
      // Delete all points by using a filter that matches everything
      // Or delete and recreate collection
      const info = await this.client!.getCollection(params.collectionName)
      await this.client!.deleteCollection(params.collectionName)
      
      // Recreate with same config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vectorsConfig = info.config?.params?.vectors as any
      if (vectorsConfig && typeof vectorsConfig === 'object' && 'size' in vectorsConfig) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this.client as any).createCollection(params.collectionName, {
          vectors: {
            size: vectorsConfig.size,
            distance: vectorsConfig.distance,
          },
        })
      }
    } else if (params.ids && params.ids.length > 0) {
      const pointIds = params.ids.map(id => {
        const num = parseInt(id, 10)
        return isNaN(num) ? id : num
      })
      
      await this.withRetry(() =>
        this.client!.delete(params.collectionName, {
          wait: true,
          points: pointIds,
        })
      )
    } else if (params.filter) {
      const filter = this.translateQdrantFilter(params.filter)
      await this.withRetry(() =>
        this.client!.delete(params.collectionName, {
          wait: true,
          filter: filter as Record<string, unknown>,
        })
      )
    }
  }

  // ============================================================================
  // Filter Translation
  // ============================================================================

  private translateQdrantFilter(filter: Record<string, unknown>): Record<string, unknown> {
    // Basic translation - Qdrant filter format is similar but not identical
    // This handles simple cases; complex filters may need more work
    
    const conditions: unknown[] = []
    
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        // Handle operators
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          switch (op) {
            case '$eq':
              conditions.push({ key, match: { value: opValue } })
              break
            case '$ne':
              conditions.push({ key, match: { value: opValue, except: true } })
              break
            case '$gt':
              conditions.push({ key, range: { gt: opValue } })
              break
            case '$gte':
              conditions.push({ key, range: { gte: opValue } })
              break
            case '$lt':
              conditions.push({ key, range: { lt: opValue } })
              break
            case '$lte':
              conditions.push({ key, range: { lte: opValue } })
              break
            case '$in':
              conditions.push({ key, match: { any: opValue } })
              break
          }
        }
      } else {
        // Simple equality
        conditions.push({ key, match: { value } })
      }
    }
    
    return conditions.length === 1 
      ? { must: conditions }
      : { must: conditions }
  }
}
