import { Pinecone, Index, RecordMetadata, PineconeRecord } from '@pinecone-database/pinecone'
import {
  ConnectionProfile,
  IndexInfo,
  IndexStats,
  VectorRecord,
  QueryVectorsParams,
  QueryResult,
  UpsertVectorsParams,
  CreateVectorParams,
  UpdateVectorParams,
  DeleteVectorsParams,
  FetchVectorsParams,
  ListVectorsParams,
  ListVectorsResult,
  CreateIndexParams,
  BatchImportParams,
  BatchImportResult,
  CloneIndexParams,
  CloneProgress,
  CloneResult,
  EmbeddingConfig,
} from './types'
import { EmbeddingService } from './embedding-service'

/**
 * Main Pinecone service class
 */
class PineconeService {
  private client: Pinecone | null = null
  private embeddingService: EmbeddingService | null = null
  private profile: ConnectionProfile | null = null
  private indexCache: Map<string, Index<RecordMetadata>> = new Map()

  getProfile(): ConnectionProfile | null {
    return this.profile
  }

  /**
   * Connect to Pinecone with the given profile
   */
  async connect(profile: ConnectionProfile): Promise<void> {
    try {
      this.client = new Pinecone({
        apiKey: profile.apiKey,
      })

      // Test connection by listing indexes
      await this.client.listIndexes()

      // Initialize embedding service and pass Pinecone client
      this.embeddingService = new EmbeddingService()
      this.embeddingService.setPineconeClient(this.client)

      // Store profile on successful connection
      this.profile = profile
      this.indexCache.clear()
    } catch (error) {
      this.client = null
      this.embeddingService = null
      this.profile = null
      throw error
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.client = null
    this.embeddingService = null
    this.profile = null
    this.indexCache.clear()
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null
  }

  /**
   * Get or create an index reference
   */
  private getIndex(indexName: string): Index<RecordMetadata> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    let index = this.indexCache.get(indexName)
    if (!index) {
      index = this.client.index(indexName)
      this.indexCache.set(indexName, index)
    }
    return index
  }

  /**
   * Get embedding config for an index
   */
  private getEmbeddingConfig(indexName: string): EmbeddingConfig | undefined {
    if (!this.profile) return undefined

    // Check for index-specific override first
    const override = this.profile.embeddingOverrides?.[indexName]
    if (override) return override

    // Fall back to default config
    return this.profile.defaultEmbeddingConfig
  }

  /**
   * List all indexes
   */
  async listIndexes(): Promise<IndexInfo[]> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    const response = await this.client.listIndexes()
    const indexes = response.indexes || []

    return indexes.map((idx) => ({
      name: idx.name,
      dimension: idx.dimension,
      metric: idx.metric as 'cosine' | 'euclidean' | 'dotproduct',
      host: idx.host,
      status: {
        ready: idx.status?.ready ?? false,
        state: idx.status?.state ?? 'unknown',
      },
      spec: {
        serverless: idx.spec?.serverless ? {
          cloud: idx.spec.serverless.cloud as 'aws' | 'gcp' | 'azure',
          region: idx.spec.serverless.region,
        } : undefined,
        pod: idx.spec?.pod ? {
          environment: idx.spec.pod.environment,
          podType: idx.spec.pod.podType,
          pods: idx.spec.pod.pods,
          replicas: idx.spec.pod.replicas,
          shards: idx.spec.pod.shards,
        } : undefined,
      },
      deletionProtection: idx.deletionProtection as 'enabled' | 'disabled' | undefined,
    }))
  }

  /**
   * Get index statistics including namespace information
   */
  async getIndexStats(indexName: string): Promise<IndexStats> {
    const index = this.getIndex(indexName)
    const stats = await index.describeIndexStats()

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
      indexFullness: stats.indexFullness || 0,
      totalVectorCount: stats.totalRecordCount || 0,
    }
  }

  /**
   * List vectors in an index (paginated)
   */
  async listVectors(params: ListVectorsParams): Promise<ListVectorsResult> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    const response = await ns.listPaginated({
      prefix: params.prefix,
      limit: params.limit || 100,
      paginationToken: params.paginationToken,
    })

    return {
      vectors: response.vectors?.map((v) => ({ id: v.id || '' })) || [],
      pagination: response.pagination ? { next: response.pagination.next } : undefined,
      namespace: params.namespace || '',
      usage: response.usage ? { readUnits: response.usage.readUnits || 0 } : undefined,
    }
  }

  /**
   * Fetch vectors by ID
   */
  async fetchVectors(params: FetchVectorsParams): Promise<VectorRecord[]> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    const response = await ns.fetch(params.ids)

    if (!response.records) return []

    return Object.values(response.records).map((record) => ({
      id: record.id,
      values: record.values || [],
      metadata: record.metadata || null,
      sparseValues: record.sparseValues,
    }))
  }

  /**
   * Query vectors by similarity
   */
  async queryVectors(
    params: QueryVectorsParams,
    embeddingConfigOverride?: EmbeddingConfig
  ): Promise<QueryResult> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    let queryVector = params.vector

    // If queryText is provided, generate embedding
    if (params.queryText && !queryVector) {
      const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
      if (!embeddingConfig) {
        throw new Error(
          'No embedding configuration found. Please configure an embedding provider to search by text.'
        )
      }

      // Use inputType: 'query' for search operations
      const embeddings = await this.embeddingService!.generateEmbeddings(
        [params.queryText],
        { ...embeddingConfig, inputType: 'query' }
      )
      queryVector = embeddings[0]
    }

    if (!queryVector) {
      throw new Error('Either vector or queryText must be provided for querying.')
    }

    const response = await ns.query({
      vector: queryVector,
      topK: params.topK || 10,
      filter: params.filter,
      includeValues: params.includeValues ?? false,
      includeMetadata: params.includeMetadata ?? true,
    })

    return {
      matches: response.matches.map((match) => ({
        id: match.id,
        score: match.score || 0,
        values: match.values,
        metadata: match.metadata,
        sparseValues: match.sparseValues,
      })),
      namespace: params.namespace || '',
      usage: response.usage ? { readUnits: response.usage.readUnits || 0 } : undefined,
    }
  }

  /**
   * Upsert vectors
   */
  async upsertVectors(params: UpsertVectorsParams): Promise<void> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    // Pinecone has a limit of 100 vectors per upsert
    const BATCH_SIZE = 100
    const vectors = params.vectors

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE).map(v => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata as RecordMetadata | undefined,
        sparseValues: v.sparseValues,
      }))
      await ns.upsert(batch)
    }
  }

  /**
   * Create a single vector (with optional embedding generation)
   */
  async createVector(
    params: CreateVectorParams,
    embeddingConfigOverride?: EmbeddingConfig
  ): Promise<void> {
    let values = params.values

    // Generate embedding if requested
    if (params.generateEmbedding && params.text) {
      const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
      if (!embeddingConfig) {
        throw new Error('No embedding configuration found. Please configure an embedding provider.')
      }

      // Use inputType: 'passage' for upsert operations
      const embeddings = await this.embeddingService!.generateEmbeddings(
        [params.text],
        { ...embeddingConfig, inputType: 'passage' }
      )
      values = embeddings[0]
    }

    if (!values) {
      throw new Error('Either values or text with generateEmbedding must be provided.')
    }

    // Build metadata, including text if provided
    const metadata: Record<string, unknown> = { ...params.metadata }
    if (params.text) {
      metadata._text = params.text
    }

    await this.upsertVectors({
      indexName: params.indexName,
      namespace: params.namespace,
      vectors: [{ id: params.id, values, metadata }],
    })
  }

  /**
   * Update a vector
   */
  async updateVector(
    params: UpdateVectorParams,
    embeddingConfigOverride?: EmbeddingConfig
  ): Promise<void> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    let values = params.values

    // Regenerate embedding if requested
    if (params.regenerateEmbedding && params.text) {
      const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
      if (!embeddingConfig) {
        throw new Error('No embedding configuration found. Please configure an embedding provider.')
      }

      // Use inputType: 'passage' for upsert operations
      const embeddings = await this.embeddingService!.generateEmbeddings(
        [params.text],
        { ...embeddingConfig, inputType: 'passage' }
      )
      values = embeddings[0]
    }

    // Build metadata update
    const metadata: Record<string, unknown> = { ...params.metadata }
    if (params.text) {
      metadata._text = params.text
    }

    // Use update for metadata-only changes, upsert for value changes
    if (values) {
      await ns.upsert([{
        id: params.id,
        values,
        metadata: Object.keys(metadata).length > 0 ? metadata as RecordMetadata : undefined,
      }])
    } else if (Object.keys(metadata).length > 0) {
      await ns.update({
        id: params.id,
        metadata: metadata as RecordMetadata,
      })
    }
  }

  /**
   * Delete vectors
   */
  async deleteVectors(params: DeleteVectorsParams): Promise<void> {
    const index = this.getIndex(params.indexName)
    const ns = params.namespace ? index.namespace(params.namespace) : index

    if (params.deleteAll) {
      await ns.deleteAll()
    } else if (params.ids && params.ids.length > 0) {
      await ns.deleteMany(params.ids)
    } else if (params.filter) {
      // Note: deleteMany with filter requires serverless indexes
      await ns.deleteMany({ filter: params.filter })
    }
  }

  /**
   * Batch import vectors with optional embedding generation
   */
  async batchImport(
    params: BatchImportParams,
    embeddingConfigOverride?: EmbeddingConfig,
    onProgress?: (current: number, total: number) => void
  ): Promise<BatchImportResult> {
    const BATCH_SIZE = 100
    const errors: string[] = []
    let upsertedCount = 0

    const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)

    // Process in batches
    for (let i = 0; i < params.vectors.length; i += BATCH_SIZE) {
      const batch = params.vectors.slice(i, i + BATCH_SIZE)

      try {
        let vectorsToUpsert: Array<{
          id: string
          values: number[]
          metadata?: Record<string, unknown>
        }> = []

        if (params.generateEmbeddings && embeddingConfig) {
          // Generate embeddings for texts
          const textsToEmbed = batch
            .filter((v) => v.text && !v.values)
            .map((v) => v.text!)

          let embeddings: number[][] = []
          if (textsToEmbed.length > 0) {
            // Use inputType: 'passage' for upsert operations
            embeddings = await this.embeddingService!.generateEmbeddings(
              textsToEmbed,
              { ...embeddingConfig, inputType: 'passage' }
            )
          }

          let embeddingIndex = 0
          vectorsToUpsert = batch.map((v) => {
            const values = v.values || embeddings[embeddingIndex++]
            const metadata: Record<string, unknown> = { ...v.metadata }
            if (v.text) metadata._text = v.text
            return { id: v.id, values, metadata }
          })
        } else {
          // Use provided values directly
          vectorsToUpsert = batch
            .filter((v) => v.values)
            .map((v) => ({
              id: v.id,
              values: v.values!,
              metadata: v.metadata,
            }))
        }

        if (vectorsToUpsert.length > 0) {
          await this.upsertVectors({
            indexName: params.indexName,
            namespace: params.namespace,
            vectors: vectorsToUpsert,
          })
          upsertedCount += vectorsToUpsert.length
        }

        onProgress?.(Math.min(i + BATCH_SIZE, params.vectors.length), params.vectors.length)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${message}`)
      }
    }

    return { upsertedCount, errors }
  }

  /**
   * Create a new index
   */
  async createIndex(params: CreateIndexParams): Promise<void> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    await this.client.createIndex({
      name: params.name,
      dimension: params.dimension,
      metric: params.metric || 'cosine',
      spec: params.spec,
      deletionProtection: params.deletionProtection,
      waitUntilReady: true,
    })

    // Clear cache to pick up new index
    this.indexCache.delete(params.name)
  }

  /**
   * Delete an index
   */
  async deleteIndex(indexName: string): Promise<void> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    await this.client.deleteIndex(indexName)
    this.indexCache.delete(indexName)
  }

  /**
   * Clone vectors from one index/namespace to another
   */
  async cloneIndex(
    params: CloneIndexParams,
    embeddingConfigOverride: EmbeddingConfig | null,
    onProgress: (progress: CloneProgress) => void,
    signal?: AbortSignal
  ): Promise<CloneResult> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    const BATCH_SIZE = 100

    try {
      // Phase 1: Get source index stats
      onProgress({
        phase: 'creating',
        totalVectors: 0,
        processedVectors: 0,
        message: 'Analyzing source index...',
      })

      if (signal?.aborted) {
        return { success: false, totalVectors: 0, copiedVectors: 0, error: 'Operation cancelled' }
      }

      const sourceStats = await this.getIndexStats(params.sourceIndexName)
      const sourceNamespace = params.sourceNamespace || ''
      const totalVectors = sourceStats.namespaces[sourceNamespace]?.vectorCount || 0

      if (totalVectors === 0) {
        onProgress({
          phase: 'complete',
          totalVectors: 0,
          processedVectors: 0,
          message: 'Source is empty, nothing to clone.',
        })
        return { success: true, totalVectors: 0, copiedVectors: 0 }
      }

      // Phase 2: Copy vectors in batches
      let processedVectors = 0
      let paginationToken: string | undefined

      const sourceIndex = this.getIndex(params.sourceIndexName)
      const sourceNs = sourceNamespace ? sourceIndex.namespace(sourceNamespace) : sourceIndex

      const targetIndex = this.getIndex(params.targetIndexName)
      const targetNs = params.targetNamespace
        ? targetIndex.namespace(params.targetNamespace)
        : targetIndex

      const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.sourceIndexName)

      do {
        if (signal?.aborted) {
          return {
            success: false,
            totalVectors,
            copiedVectors: processedVectors,
            error: 'Operation cancelled',
          }
        }

        onProgress({
          phase: 'copying',
          totalVectors,
          processedVectors,
          message: `Copying vectors... ${processedVectors}/${totalVectors}`,
        })

        // List vector IDs
        const listResult = await sourceNs.listPaginated({
          limit: BATCH_SIZE,
          paginationToken,
        })

        const ids = listResult.vectors?.map((v) => v.id || '').filter(Boolean) || []
        paginationToken = listResult.pagination?.next

        if (ids.length === 0) break

        // Fetch full vectors
        const fetchResult = await sourceNs.fetch(ids)
        const records = Object.values(fetchResult.records || {})

        if (records.length === 0) continue

        // Prepare vectors for upsert
        let vectorsToUpsert: Array<{
          id: string
          values: number[]
          metadata?: Record<string, unknown>
        }>

        if (params.regenerateEmbeddings && embeddingConfig) {
          // Extract texts and regenerate embeddings
          const textsToEmbed: string[] = []
          const textIndices: number[] = []

          records.forEach((record, idx) => {
            const text = (record.metadata as Record<string, unknown>)?._text as string | undefined
            if (text) {
              textsToEmbed.push(text)
              textIndices.push(idx)
            }
          })

          let newEmbeddings: number[][] = []
          if (textsToEmbed.length > 0) {
            // Use inputType: 'passage' for upsert operations
            newEmbeddings = await this.embeddingService!.generateEmbeddings(
              textsToEmbed,
              { ...embeddingConfig, inputType: 'passage' }
            )
          }

          vectorsToUpsert = records.map((record, idx) => {
            const embeddingIdx = textIndices.indexOf(idx)
            const values = embeddingIdx >= 0 ? newEmbeddings[embeddingIdx] : record.values || []
            return {
              id: record.id,
              values,
              metadata: record.metadata as RecordMetadata | undefined,
            }
          })
        } else {
          // Copy vectors as-is
          vectorsToUpsert = records.map((record) => ({
            id: record.id,
            values: record.values || [],
            metadata: record.metadata as RecordMetadata | undefined,
          }))
        }

        // Upsert to target
        await targetNs.upsert(vectorsToUpsert as PineconeRecord[])
        processedVectors += vectorsToUpsert.length

      } while (paginationToken)

      // Phase 3: Complete
      onProgress({
        phase: 'complete',
        totalVectors,
        processedVectors,
        message: `Copied ${processedVectors} vectors`,
      })

      return {
        success: true,
        totalVectors,
        copiedVectors: processedVectors,
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clone index'

      onProgress({
        phase: 'error',
        totalVectors: 0,
        processedVectors: 0,
        message,
      })

      return {
        success: false,
        totalVectors: 0,
        copiedVectors: 0,
        error: message,
      }
    }
  }

  /**
   * Get all vectors in a namespace (for display in UI)
   * This fetches vectors in batches and returns them all
   */
  async getAllVectors(
    indexName: string,
    namespace?: string,
    limit: number = 1000
  ): Promise<VectorRecord[]> {
    const allVectors: VectorRecord[] = []
    let paginationToken: string | undefined
    const BATCH_SIZE = 100

    const index = this.getIndex(indexName)
    const ns = namespace ? index.namespace(namespace) : index

    do {
      // List vector IDs
      const listResult = await ns.listPaginated({
        limit: Math.min(BATCH_SIZE, limit - allVectors.length),
        paginationToken,
      })

      const ids = listResult.vectors?.map((v) => v.id || '').filter(Boolean) || []
      paginationToken = listResult.pagination?.next

      if (ids.length === 0) break

      // Fetch full vectors
      const fetchResult = await ns.fetch(ids)
      const records = Object.values(fetchResult.records || {})

      allVectors.push(
        ...records.map((record) => ({
          id: record.id,
          values: record.values || [],
          metadata: record.metadata || null,
          sparseValues: record.sparseValues,
        }))
      )

      // Stop if we've reached the limit
      if (allVectors.length >= limit) break

    } while (paginationToken)

    return allVectors
  }
}

/**
 * Connection pool for managing multiple Pinecone connections
 */
class PineconeConnectionPool {
  private connections: Map<string, { service: PineconeService; refCount: number }> = new Map()

  /**
   * Connect to a profile (or increment refCount if already connected)
   */
  async connect(profileId: string, profile: ConnectionProfile): Promise<PineconeService> {
    const existing = this.connections.get(profileId)

    if (existing) {
      existing.refCount++
      console.log(`[Pinecone Pool] Reusing connection for profile ${profileId} (refCount: ${existing.refCount})`)
      return existing.service
    }

    const service = new PineconeService()
    await service.connect(profile)

    this.connections.set(profileId, {
      service,
      refCount: 1,
    })

    console.log(`[Pinecone Pool] Created new connection for profile ${profileId}`)
    return service
  }

  /**
   * Decrement refCount for a profile connection
   */
  disconnect(profileId: string): void {
    const connection = this.connections.get(profileId)

    if (!connection) {
      console.warn(`[Pinecone Pool] Attempted to disconnect unknown profile ${profileId}`)
      return
    }

    connection.refCount--
    console.log(`[Pinecone Pool] Decremented refCount for profile ${profileId} (refCount: ${connection.refCount})`)

    if (connection.refCount <= 0) {
      connection.service.disconnect()
      this.connections.delete(profileId)
      console.log(`[Pinecone Pool] Disconnected and removed profile ${profileId}`)
    }
  }

  /**
   * Get an existing connection
   */
  getConnection(profileId: string): PineconeService | null {
    return this.connections.get(profileId)?.service || null
  }

  /**
   * Check if a profile is connected
   */
  isConnected(profileId: string): boolean {
    return this.connections.has(profileId)
  }

  /**
   * Get refCount for a profile
   */
  getRefCount(profileId: string): number {
    return this.connections.get(profileId)?.refCount || 0
  }
}

// Export singleton connection pool
export const pineconeConnectionPool = new PineconeConnectionPool()

// Export singleton service for backwards compatibility
export const pineconeService = new PineconeService()
