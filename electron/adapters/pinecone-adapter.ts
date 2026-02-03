/**
 * Pinecone Database Adapter
 * 
 * Implements the VectorDatabase interface for Pinecone.
 * This is a refactoring of the existing PineconeService to fit the unified interface.
 */

import { Pinecone, Index, RecordMetadata } from '@pinecone-database/pinecone'
import { BaseVectorAdapter } from './base-adapter'
import {
  DatabaseProvider,
  DatabaseCapabilities,
  ConnectionConfig,
  PineconeConnectionConfig,
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

export class PineconeAdapter extends BaseVectorAdapter {
  readonly provider: DatabaseProvider = 'pinecone'
  
  readonly capabilities: DatabaseCapabilities = {
    supportsNamespaces: true,
    supportsSparseVectors: true,
    supportsHybridSearch: true,
    supportsIntegratedEmbeddings: true,
    supportsReranking: true,
    supportedMetrics: ['cosine', 'euclidean', 'dotproduct'],
    maxDimension: 20000,
    supportsVectorListing: true,
    supportsMetadataUpdate: true,
  }

  private client: Pinecone | null = null
  private indexCache = new Map<string, Index<RecordMetadata>>()
  private indexInfoCache = new Map<string, CollectionInfo>()

  // ============================================================================
  // Connection
  // ============================================================================

  async connect(config: ConnectionConfig): Promise<void> {
    const pineconeConfig = config as PineconeConnectionConfig
    
    this.client = new Pinecone({
      apiKey: pineconeConfig.apiKey,
    })

    // Test connection
    await this.client.listIndexes()
    
    this.config = config
    this.connected = true
    this.indexCache.clear()
    this.indexInfoCache.clear()
  }

  protected onDisconnect(): void {
    this.client = null
    this.indexCache.clear()
    this.indexInfoCache.clear()
  }

  // ============================================================================
  // Collection Operations
  // ============================================================================

  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureConnected()
    
    const response = await this.withRetry(() => this.client!.listIndexes())
    const indexes = response.indexes || []

    const collections = indexes.map((idx): CollectionInfo => {
      const vectorType = (idx as { vectorType?: string }).vectorType as 'dense' | 'sparse' | undefined
      
      const info: CollectionInfo = {
        name: idx.name,
        dimension: idx.dimension,
        metric: idx.metric as DistanceMetric,
        vectorType: vectorType === 'sparse' ? 'sparse' : 'dense',
        ready: idx.status?.ready ?? false,
        status: idx.status?.state ?? 'unknown',
        providerMetadata: {
          host: idx.host,
          spec: idx.spec,
          deletionProtection: idx.deletionProtection,
          embed: (idx as { embed?: unknown }).embed,
        },
      }
      
      return info
    })

    // Update cache
    this.indexInfoCache.clear()
    for (const info of collections) {
      this.indexInfoCache.set(info.name, info)
    }

    return collections
  }

  async getCollectionStats(name: string): Promise<CollectionStats> {
    this.ensureConnected()
    this.validateCollectionName(name)

    const index = this.getIndex(name)
    const stats = await this.withRetry(() => index.describeIndexStats())

    return {
      namespaces: stats.namespaces
        ? Object.fromEntries(
            Object.entries(stats.namespaces).map(([ns, data]) => [
              ns,
              { vectorCount: data.recordCount || 0 },
            ])
          )
        : {},
      dimension: stats.dimension || 0,
      totalVectorCount: stats.totalRecordCount || 0,
      indexFullness: stats.indexFullness || 0,
    }
  }

  async createCollection(params: CreateCollectionParams): Promise<void> {
    this.ensureConnected()
    
    const isSparse = params.vectorType === 'sparse'
    
    // Build create params
    const createParams: Record<string, unknown> = {
      name: params.name,
      metric: params.metric || (isSparse ? 'dotproduct' : 'cosine'),
      spec: params.providerOptions?.spec || {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
      waitUntilReady: true,
    }

    if (!isSparse) {
      if (!params.dimension || params.dimension <= 0) {
        throw new Error('Dimension is required for dense indexes')
      }
      createParams.dimension = params.dimension
    }

    if (isSparse) {
      createParams.vectorType = 'sparse'
    }

    const client = this.client!
    await this.withRetry(() => 
      client.createIndex(createParams as unknown as Parameters<typeof client.createIndex>[0])
    )

    this.indexCache.delete(params.name)
  }

  async deleteCollection(name: string): Promise<void> {
    this.ensureConnected()
    this.validateCollectionName(name)

    await this.withRetry(() => this.client!.deleteIndex(name))
    this.indexCache.delete(name)
    this.indexInfoCache.delete(name)
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  async listVectors(params: ListParams): Promise<PaginatedResult<VectorRecord>> {
    this.ensureConnected()
    
    const ns = this.getNamespace(params.collectionName, params.namespace)
    
    const response = await this.withRetry(() => ns.listPaginated({
      prefix: params.prefix,
      limit: params.limit || 100,
      paginationToken: params.cursor,
    }))

    // List only returns IDs, need to fetch full records
    const ids = response.vectors?.map(v => v.id || '').filter(Boolean) || []
    
    let items: VectorRecord[] = []
    if (ids.length > 0) {
      items = await this.fetchVectors(params.collectionName, ids, params.namespace)
    }

    return {
      items,
      nextCursor: response.pagination?.next,
      hasMore: !!response.pagination?.next,
    }
  }

  async fetchVectors(
    collectionName: string, 
    ids: string[], 
    namespace?: string
  ): Promise<VectorRecord[]> {
    this.ensureConnected()
    
    const ns = this.getNamespace(collectionName, namespace)
    const response = await this.withRetry(() => ns.fetch(ids))

    if (!response.records) return []

    return Object.values(response.records).map((record): VectorRecord => ({
      id: record.id,
      values: record.values || undefined,
      sparseValues: record.sparseValues,
      metadata: record.metadata || null,
    }))
  }

  async queryVectors(params: QueryParams): Promise<QueryResult> {
    this.ensureConnected()
    
    const index = this.getIndex(params.collectionName)
    const target = params.namespace !== undefined
      ? index.namespace(params.namespace)
      : index

    // Build query params
    const queryParams: Record<string, unknown> = {
      topK: params.topK || 10,
      filter: params.filter,
      includeValues: params.includeValues ?? false,
      includeMetadata: params.includeMetadata ?? true,
    }

    // Query by ID
    if (params.id) {
      queryParams.id = params.id
    }
    // Query by vector
    else if (params.vector) {
      queryParams.vector = params.vector
      if (params.sparseVector) {
        queryParams.sparseVector = params.sparseVector
      }
    }
    // Query by sparse vector only
    else if (params.sparseVector) {
      queryParams.sparseVector = params.sparseVector
    }
    else {
      throw new Error('Query requires vector, sparseVector, or id')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await this.withRetry(() => target.query(queryParams as any))

    return {
      matches: response.matches.map((match): VectorRecord => ({
        id: match.id,
        score: match.score || 0,
        values: match.values,
        metadata: match.metadata,
        sparseValues: match.sparseValues,
      })),
      namespace: params.namespace ?? '',
      usage: response.usage ? { readUnits: response.usage.readUnits || 0 } : undefined,
    }
  }

  async upsertVectors(params: UpsertParams): Promise<void> {
    this.ensureConnected()
    
    const ns = this.getNamespace(params.collectionName, params.namespace)
    const BATCH_SIZE = 100

    for (const batch of this.batch(params.vectors, BATCH_SIZE)) {
      const records = batch.map(v => ({
        id: v.id,
        values: v.values,
        sparseValues: v.sparseValues,
        metadata: v.metadata as RecordMetadata | undefined,
      }))
      
      await this.withRetry(() => ns.upsert(records))
    }
  }

  async updateVector(params: UpdateParams): Promise<void> {
    this.ensureConnected()
    
    const ns = this.getNamespace(params.collectionName, params.namespace)

    // Pinecone update only supports metadata updates
    // For vector updates, use upsert
    if (params.values || params.sparseValues) {
      await this.upsertVectors({
        collectionName: params.collectionName,
        namespace: params.namespace,
        vectors: [{
          id: params.id,
          values: params.values,
          sparseValues: params.sparseValues,
          metadata: params.metadata,
        }],
      })
    } else if (params.metadata) {
      await this.withRetry(() => ns.update({
        id: params.id,
        metadata: params.metadata as RecordMetadata,
      }))
    }
  }

  async deleteVectors(params: DeleteParams): Promise<void> {
    this.ensureConnected()
    
    const ns = this.getNamespace(params.collectionName, params.namespace)

    if (params.deleteAll) {
      await this.withRetry(() => ns.deleteAll())
    } else if (params.ids && params.ids.length > 0) {
      await this.withRetry(() => ns.deleteMany(params.ids!))
    } else if (params.filter) {
      await this.withRetry(() => ns.deleteMany({ filter: params.filter! }))
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getIndex(name: string): Index<RecordMetadata> {
    if (!this.client) {
      throw new Error('Pinecone client not connected')
    }

    let index = this.indexCache.get(name)
    if (!index) {
      index = this.client.index(name)
      this.indexCache.set(name, index)
    }
    return index
  }

  private getNamespace(indexName: string, namespace?: string) {
    const index = this.getIndex(indexName)
    return namespace ? index.namespace(namespace) : index
  }
}
