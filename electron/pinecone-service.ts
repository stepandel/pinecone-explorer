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
import { EmbeddingService, SparseVector, EmbeddingResult } from './embedding-service'

/**
 * Main Pinecone service class
 */
class PineconeService {
  private static readonly BATCH_SIZE = 100

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
   * Get namespace reference for an index
   */
  private getNamespace(indexName: string, namespace?: string) {
    const index = this.getIndex(indexName)
    return namespace ? index.namespace(namespace) : index
  }

  /**
   * Generate embedding for a single text and return as values or sparseValues
   */
  private async generateSingleEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<{ values?: number[]; sparseValues?: SparseVector }> {
    const result = await this.embeddingService!.generateEmbeddings(
      [text],
      { ...config, inputType: 'passage' }
    )
    return result.type === 'dense'
      ? { values: result.values[0] }
      : { sparseValues: result.sparseValues[0] }
  }

  /**
   * Generate embeddings for multiple texts and return indexed results
   */
  private async generateBatchEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResult | null> {
    if (texts.length === 0) return null
    return this.embeddingService!.generateEmbeddings(
      texts,
      { ...config, inputType: 'passage' }
    )
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
    const ns = this.getNamespace(params.indexName, params.namespace)

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
    const ns = this.getNamespace(params.indexName, params.namespace)

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
    const ns = this.getNamespace(params.indexName, params.namespace)
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
      const embeddingResult = await this.embeddingService!.generateEmbeddings(
        [params.queryText],
        { ...embeddingConfig, inputType: 'query' }
      )
      if (embeddingResult.type === 'dense') {
        queryVector = embeddingResult.values[0]
      } else {
        // Sparse-only queries require hybrid search with a dense vector
        // For now, throw an error - user should provide vector directly for sparse indexes
        throw new Error('Text-based queries are not yet supported for sparse indexes. Please provide a vector directly.')
      }
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
    const ns = this.getNamespace(params.indexName, params.namespace)

    for (let i = 0; i < params.vectors.length; i += PineconeService.BATCH_SIZE) {
      const batch = params.vectors.slice(i, i + PineconeService.BATCH_SIZE).map(v => ({
        id: v.id,
        values: v.values || [],
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
    const metadata: Record<string, unknown> = { ...params.metadata }
    if (params.text) metadata._text = params.text

    let embedding: { values?: number[]; sparseValues?: SparseVector } = { values: params.values }

    if (params.generateEmbedding && params.text) {
      const config = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
      if (!config) {
        throw new Error('No embedding configuration found. Please configure an embedding provider.')
      }
      embedding = await this.generateSingleEmbedding(params.text, config)
    }

    if (!embedding.values && !embedding.sparseValues) {
      throw new Error('Either values or text with generateEmbedding must be provided.')
    }

    await this.upsertVectors({
      indexName: params.indexName,
      namespace: params.namespace,
      vectors: [{ id: params.id, ...embedding, metadata }],
    })
  }

  /**
   * Update a vector
   */
  async updateVector(
    params: UpdateVectorParams,
    embeddingConfigOverride?: EmbeddingConfig
  ): Promise<void> {
    const ns = this.getNamespace(params.indexName, params.namespace)

    const metadata: Record<string, unknown> = { ...params.metadata }
    if (params.text) metadata._text = params.text

    let embedding: { values?: number[]; sparseValues?: SparseVector } = { values: params.values }

    if (params.regenerateEmbedding && params.text) {
      const config = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
      if (!config) {
        throw new Error('No embedding configuration found. Please configure an embedding provider.')
      }
      embedding = await this.generateSingleEmbedding(params.text, config)
    }

    // Use upsert for value changes, update for metadata-only changes
    if (embedding.values || embedding.sparseValues) {
      await ns.upsert([{
        id: params.id,
        values: embedding.values || [],
        sparseValues: embedding.sparseValues,
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
    const ns = this.getNamespace(params.indexName, params.namespace)

    if (params.deleteAll) {
      await ns.deleteAll()
    } else if (params.ids && params.ids.length > 0) {
      await ns.deleteMany(params.ids)
    } else if (params.filter) {
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
    const errors: string[] = []
    let upsertedCount = 0
    const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)

    for (let i = 0; i < params.vectors.length; i += PineconeService.BATCH_SIZE) {
      const batch = params.vectors.slice(i, i + PineconeService.BATCH_SIZE)

      try {
        const vectorsToUpsert = await this.prepareBatchVectors(batch, params.generateEmbeddings, embeddingConfig)

        if (vectorsToUpsert.length > 0) {
          await this.upsertVectors({
            indexName: params.indexName,
            namespace: params.namespace,
            vectors: vectorsToUpsert,
          })
          upsertedCount += vectorsToUpsert.length
        }

        onProgress?.(Math.min(i + PineconeService.BATCH_SIZE, params.vectors.length), params.vectors.length)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Batch ${Math.floor(i / PineconeService.BATCH_SIZE) + 1}: ${message}`)
      }
    }

    return { upsertedCount, errors }
  }

  /**
   * Prepare a batch of vectors for upsert, optionally generating embeddings
   */
  private async prepareBatchVectors(
    batch: Array<{ id: string; text?: string; values?: number[]; metadata?: Record<string, unknown> }>,
    generateEmbeddings?: boolean,
    embeddingConfig?: EmbeddingConfig
  ): Promise<Array<{ id: string; values?: number[]; sparseValues?: SparseVector; metadata?: Record<string, unknown> }>> {
    if (!generateEmbeddings || !embeddingConfig) {
      return batch.filter(v => v.values).map(v => ({
        id: v.id,
        values: v.values!,
        metadata: v.metadata,
      }))
    }

    const textsToEmbed = batch.filter(v => v.text && !v.values).map(v => v.text!)
    const embeddingResult = await this.generateBatchEmbeddings(textsToEmbed, embeddingConfig)

    let embeddingIndex = 0
    return batch.map(v => {
      const metadata: Record<string, unknown> = { ...v.metadata }
      if (v.text) metadata._text = v.text

      if (v.values) {
        return { id: v.id, values: v.values, metadata }
      } else if (embeddingResult?.type === 'dense') {
        return { id: v.id, values: embeddingResult.values[embeddingIndex++], metadata }
      } else if (embeddingResult?.type === 'sparse') {
        return { id: v.id, sparseValues: embeddingResult.sparseValues[embeddingIndex++], metadata }
      }
      return { id: v.id, metadata }
    })
  }

  /**
   * Create a new index
   */
  async createIndex(params: CreateIndexParams): Promise<void> {
    if (!this.client) {
      throw new Error('Pinecone client not connected. Please connect first.')
    }

    const isSparse = params.vectorType === 'sparse'

    // If embed config is provided, use createIndexForModel for integrated inference
    if (params.embed) {
      // Extract cloud and region from serverless spec
      const spec = params.spec as { serverless?: { cloud: string; region: string } }
      if (!spec.serverless) {
        throw new Error('Integrated inference indexes require serverless spec')
      }

      await this.client.createIndexForModel({
        name: params.name,
        cloud: spec.serverless.cloud as 'aws' | 'gcp' | 'azure',
        region: spec.serverless.region,
        embed: {
          model: params.embed.model,
          fieldMap: params.embed.fieldMap,
          metric: params.embed.metric || params.metric,
        },
        deletionProtection: params.deletionProtection,
        waitUntilReady: true,
      })

      // Clear cache to pick up new index
      this.indexCache.delete(params.name)
      return
    }

    // Standard index creation (without integrated inference)
    // Build the create index request
    // For sparse indexes: omit dimension, set vectorType
    // For dense indexes: require dimension
    const createParams: Record<string, unknown> = {
      name: params.name,
      metric: params.metric || (isSparse ? 'dotproduct' : 'cosine'),
      spec: params.spec,
      deletionProtection: params.deletionProtection,
      waitUntilReady: true,
    }

    // Only add dimension for dense indexes
    if (!isSparse) {
      if (!params.dimension || params.dimension <= 0) {
        throw new Error('Dimension is required for dense indexes')
      }
      createParams.dimension = params.dimension
    }

    // Add vectorType if sparse (dense is the default, no need to specify)
    if (isSparse) {
      createParams.vectorType = 'sparse'
    }

    await this.client.createIndex(createParams as unknown as Parameters<typeof this.client.createIndex>[0])

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
   * Clone all vectors from one index to another, preserving all namespaces.
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

    try {
      // Phase 1: Analyze source
      onProgress({ phase: 'creating', totalVectors: 0, processedVectors: 0, message: 'Analyzing source index...' })

      if (signal?.aborted) {
        return { success: false, totalVectors: 0, copiedVectors: 0, error: 'Operation cancelled' }
      }

      const sourceStats = await this.getIndexStats(params.sourceIndexName)
      const embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.sourceIndexName)
      const namespacesToCopy = Object.keys(sourceStats.namespaces)

      const totalVectors = namespacesToCopy.reduce(
        (sum, ns) => sum + (sourceStats.namespaces[ns]?.vectorCount || 0),
        0
      )

      if (totalVectors === 0) {
        onProgress({ phase: 'complete', totalVectors: 0, processedVectors: 0, message: 'Source is empty, nothing to clone.' })
        return { success: true, totalVectors: 0, copiedVectors: 0 }
      }

      // Phase 2: Copy vectors from each namespace
      let processedVectors = 0
      let dimensionValidated = false

      for (const namespace of namespacesToCopy) {
        if (signal?.aborted) {
          return { success: false, totalVectors, copiedVectors: processedVectors, error: 'Operation cancelled' }
        }

        const nsLabel = namespace || '(default)'
        const result = await this.cloneNamespace({
          sourceIndexName: params.sourceIndexName,
          sourceNamespace: namespace,
          targetIndexName: params.targetIndexName,
          targetNamespace: namespace,
          regenerateEmbeddings: params.regenerateEmbeddings,
          textField: params.textField,
          embeddingConfig,
          validateDimensions: !dimensionValidated,
          onProgress: (copied) => {
            onProgress({
              phase: 'copying',
              totalVectors,
              processedVectors: processedVectors + copied,
              message: `Copying ${nsLabel}... ${processedVectors + copied}/${totalVectors}`
            })
          },
          signal,
        })

        processedVectors += result.copiedVectors
        if (result.copiedVectors > 0) dimensionValidated = true

        if (!result.success) {
          return { success: false, totalVectors, copiedVectors: processedVectors, error: result.error }
        }
      }

      // Phase 3: Complete
      onProgress({ phase: 'complete', totalVectors, processedVectors, message: `Copied ${processedVectors} vectors` })
      return { success: true, totalVectors, copiedVectors: processedVectors }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clone index'
      onProgress({ phase: 'error', totalVectors: 0, processedVectors: 0, message })
      return { success: false, totalVectors: 0, copiedVectors: 0, error: message }
    }
  }

  /**
   * Clone vectors from one namespace to another.
   * Can be used independently or as part of cloneIndex.
   */
  async cloneNamespace(params: {
    sourceIndexName: string
    sourceNamespace: string
    targetIndexName: string
    targetNamespace: string
    regenerateEmbeddings?: boolean
    textField?: string
    embeddingConfig?: EmbeddingConfig | null
    validateDimensions?: boolean
    onProgress?: (copiedSoFar: number) => void
    signal?: AbortSignal
  }): Promise<{ success: boolean; copiedVectors: number; error?: string }> {
    const {
      sourceIndexName,
      sourceNamespace,
      targetIndexName,
      targetNamespace,
      regenerateEmbeddings,
      textField,
      embeddingConfig,
      validateDimensions = true,
      onProgress,
      signal,
    } = params

    const sourceNs = this.getNamespace(sourceIndexName, sourceNamespace)
    const targetNs = this.getNamespace(targetIndexName, targetNamespace)

    let copiedVectors = 0
    let dimensionValidated = !validateDimensions
    let paginationToken: string | undefined

    try {
      do {
        if (signal?.aborted) {
          return { success: false, copiedVectors, error: 'Operation cancelled' }
        }

        const listResult = await sourceNs.listPaginated({ limit: PineconeService.BATCH_SIZE, paginationToken })
        const ids = listResult.vectors?.map(v => v.id || '').filter(Boolean) || []
        paginationToken = listResult.pagination?.next

        if (ids.length === 0) break

        const fetchResult = await sourceNs.fetch(ids)
        const records = Object.values(fetchResult.records || {})
        if (records.length === 0) continue

        const vectorsToUpsert = await this.prepareCloneVectors(
          records,
          regenerateEmbeddings,
          embeddingConfig,
          textField
        )

        // Validate dimensions on first batch if requested
        if (!dimensionValidated && vectorsToUpsert.length > 0) {
          await this.validateCloneDimensions(vectorsToUpsert, targetIndexName)
          dimensionValidated = true
        }

        await targetNs.upsert(vectorsToUpsert as PineconeRecord[])
        copiedVectors += vectorsToUpsert.length
        onProgress?.(copiedVectors)

      } while (paginationToken)

      return { success: true, copiedVectors }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clone namespace'
      return { success: false, copiedVectors, error: message }
    }
  }

  /**
   * Prepare vectors for cloning, optionally regenerating embeddings
   */
  private async prepareCloneVectors(
    records: Array<{ id: string; values?: number[]; sparseValues?: unknown; metadata?: unknown }>,
    regenerateEmbeddings?: boolean,
    embeddingConfig?: EmbeddingConfig | null,
    textField: string = '_text'
  ): Promise<Array<{ id: string; values?: number[]; sparseValues?: SparseVector; metadata?: Record<string, unknown> }>> {
    if (!regenerateEmbeddings || !embeddingConfig) {
      return records.map(record => ({
        id: record.id,
        values: record.values || undefined,
        sparseValues: record.sparseValues as SparseVector | undefined,
        metadata: record.metadata as Record<string, unknown> | undefined,
      }))
    }

    // Extract texts for embedding generation
    const textsToEmbed: string[] = []
    const textIndices: number[] = []

    records.forEach((record, idx) => {
      const text = (record.metadata as Record<string, unknown>)?.[textField] as string | undefined
      if (text) {
        textsToEmbed.push(text)
        textIndices.push(idx)
      }
    })

    // Validate dimension compatibility for vectors without text
    const vectorsWithoutText = records.length - textsToEmbed.length
    if (vectorsWithoutText > 0) {
      const targetDimension = embeddingConfig.dimensions
      const sourceDimension = records[0]?.values?.length
      if (sourceDimension && targetDimension && sourceDimension !== targetDimension) {
        throw new Error(
          `Cannot clone: ${vectorsWithoutText} vectors have no '${textField}' metadata and their dimensions (${sourceDimension}) ` +
          `don't match target model dimensions (${targetDimension}). All vectors must have '${textField}' metadata for embedding regeneration.`
        )
      }
    }

    const embeddingResult = await this.generateBatchEmbeddings(textsToEmbed, embeddingConfig)

    return records.map((record, idx) => {
      const embeddingIdx = textIndices.indexOf(idx)

      if (embeddingIdx >= 0 && embeddingResult) {
        return embeddingResult.type === 'sparse'
          ? { id: record.id, sparseValues: embeddingResult.sparseValues[embeddingIdx], metadata: record.metadata as Record<string, unknown> }
          : { id: record.id, values: embeddingResult.values[embeddingIdx], metadata: record.metadata as Record<string, unknown> }
      }

      return {
        id: record.id,
        values: record.values || undefined,
        sparseValues: record.sparseValues as SparseVector | undefined,
        metadata: record.metadata as Record<string, unknown> | undefined,
      }
    })
  }

  /**
   * Validate that vector dimensions match target index
   */
  private async validateCloneDimensions(
    vectors: Array<{ values?: number[] }>,
    targetIndexName: string
  ): Promise<void> {
    const firstWithValues = vectors.find(v => v.values && v.values.length > 0)
    if (!firstWithValues?.values) return

    const targetInfo = await this.client!.describeIndex(targetIndexName)
    if (targetInfo.dimension && firstWithValues.values.length !== targetInfo.dimension) {
      throw new Error(
        `Dimension mismatch: Generated embeddings have ${firstWithValues.values.length} dimensions ` +
        `but target index expects ${targetInfo.dimension} dimensions`
      )
    }
  }

  /**
   * Get all vectors in a namespace (for display in UI)
   */
  async getAllVectors(
    indexName: string,
    namespace?: string,
    limit: number = 1000
  ): Promise<VectorRecord[]> {
    const ns = this.getNamespace(indexName, namespace)
    const allVectors: VectorRecord[] = []
    let paginationToken: string | undefined

    do {
      const listResult = await ns.listPaginated({
        limit: Math.min(PineconeService.BATCH_SIZE, limit - allVectors.length),
        paginationToken,
      })

      const ids = listResult.vectors?.map(v => v.id || '').filter(Boolean) || []
      paginationToken = listResult.pagination?.next

      if (ids.length === 0) break

      const fetchResult = await ns.fetch(ids)
      const records = Object.values(fetchResult.records || {})

      allVectors.push(...records.map(record => ({
        id: record.id,
        values: record.values || [],
        metadata: record.metadata || null,
        sparseValues: record.sparseValues,
      })))

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
      return existing.service
    }

    const service = new PineconeService()
    await service.connect(profile)
    this.connections.set(profileId, { service, refCount: 1 })
    return service
  }

  /**
   * Decrement refCount for a profile connection
   */
  disconnect(profileId: string): void {
    const connection = this.connections.get(profileId)
    if (!connection) return

    connection.refCount--
    if (connection.refCount <= 0) {
      connection.service.disconnect()
      this.connections.delete(profileId)
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
