import { Pinecone, Index, RecordMetadata, PineconeRecord } from '@pinecone-database/pinecone'
import {
  ConnectionProfile,
  IndexInfo,
  IndexEmbedConfig,
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
  HybridEmbeddingConfig,
  PaginatedVectorsResult,
  RerankConfig,
} from './types'
import { EmbeddingService, SparseVector, EmbeddingResult } from './embedding-service'
import { withRetry } from './retry-utils'
import { AssistantService } from './assistant-service'

/**
 * Main Pinecone service class
 */
class PineconeService {
  private static readonly BATCH_SIZE = 50

  private client: Pinecone | null = null
  private embeddingService: EmbeddingService | null = null
  private assistantService: AssistantService | null = null
  private profile: ConnectionProfile | null = null
  private indexCache: Map<string, Index<RecordMetadata>> = new Map()
  private indexInfoCache: Map<string, IndexInfo> = new Map()

  getProfile(): ConnectionProfile | null {
    return this.profile
  }

  /**
   * Get the AssistantService for this connection
   */
  getAssistantService(): AssistantService {
    if (!this.client) {
      throw new Error('Not connected to Pinecone')
    }
    if (!this.assistantService) {
      this.assistantService = new AssistantService(this.client)
    }
    return this.assistantService
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
    this.assistantService = null
    this.profile = null
    this.indexCache.clear()
    this.indexInfoCache.clear()
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
   * Convert index embed config (from Pinecone API) to our EmbeddingConfig format
   */
  private convertIndexEmbedToConfig(embed: IndexEmbedConfig): EmbeddingConfig {
    return {
      provider: 'pinecone',
      modelName: embed.model,
      vectorType: embed.vectorType || 'dense',
      dimensions: embed.dimension,
      // inputType will be set at call time ('query' for search, 'passage' for upsert)
    }
  }

  /**
   * Get the text field name for embedding from an index's embed config
   * Returns the fieldMap.text value or '_text' as default
   */
  getTextFieldForIndex(indexName: string): string {
    const indexInfo = this.indexInfoCache.get(indexName)
    return indexInfo?.embed?.fieldMap?.text || '_text'
  }

  /**
   * Get embedding config for an index.
   * Priority chain:
   * 1. Index's embed config from API (authoritative - cannot be overridden)
   * 2. Per-index client override (only for indexes WITHOUT integrated inference)
   * 3. Profile default (fallback for indexes without integrated inference)
   * 4. None
   */
  private getEmbeddingConfig(indexName: string): EmbeddingConfig | undefined {
    // Check if index has integrated inference (embed config from API)
    const indexInfo = this.indexInfoCache.get(indexName)
    if (indexInfo?.embed) {
      // Index has integrated inference - this is authoritative, no override allowed
      return this.convertIndexEmbedToConfig(indexInfo.embed)
    }

    if (!this.profile) return undefined

    // Check for index-specific override
    const override = this.profile.embeddingOverrides?.[indexName]
    if (override) return override

    // Fall back to default config
    return this.profile.defaultEmbeddingConfig
  }

  /**
   * Check if an index has integrated inference (embed config from API)
   */
  hasIntegratedInference(indexName: string): boolean {
    const indexInfo = this.indexInfoCache.get(indexName)
    return !!indexInfo?.embed
  }

  /**
   * Check if an index supports hybrid search.
   * Hybrid search requires: dense vector type + dotproduct metric
   */
  isHybridCapable(indexName: string): boolean {
    const info = this.indexInfoCache.get(indexName)
    if (!info) return false
    const isDense = !info.vectorType || info.vectorType === 'dense'
    return isDense && info.metric === 'dotproduct'
  }

  /**
   * Get hybrid embedding config for an index from profile overrides
   */
  getHybridEmbeddingConfig(indexName: string): HybridEmbeddingConfig | null {
    return this.profile?.hybridEmbeddingOverrides?.[indexName] ?? null
  }

  /**
   * Apply alpha weighting to dense and sparse vectors for hybrid search.
   * alpha=1.0 → pure semantic (dense only)
   * alpha=0.0 → pure keyword (sparse only)
   */
  private applyAlphaWeighting(
    denseVector: number[],
    sparseVector: SparseVector,
    alpha: number
  ): { vector: number[]; sparseVector: SparseVector } {
    return {
      vector: denseVector.map(v => v * alpha),
      sparseVector: {
        indices: sparseVector.indices,
        values: sparseVector.values.map(v => v * (1 - alpha)),
      },
    }
  }

  /**
   * Get index info from cache
   */
  getIndexInfo(indexName: string): IndexInfo | undefined {
    return this.indexInfoCache.get(indexName)
  }

  /**
   * Resolve the dimension for an embedding config based on the index dimension.
   * This ensures the embedding model generates vectors matching the index dimension.
   * For models with variable dimensions, uses the index dimension if supported.
   * For fixed dimension models, returns the model's dimension (caller should validate compatibility).
   */
  private resolveEmbeddingDimension(config: EmbeddingConfig, indexName: string): EmbeddingConfig {
    const indexInfo = this.indexInfoCache.get(indexName)
    const indexDimension = indexInfo?.dimension

    // Sparse models have no dimension
    if (config.vectorType === 'sparse') {
      return config
    }

    // If no index dimension or config already has matching dimension, return as-is
    if (!indexDimension || config.dimensions === indexDimension) {
      return config
    }

    // Models with variable dimensions that support the index dimension
    const variableDimensionModels: Record<string, number[]> = {
      'llama-text-embed-v2': [384, 512, 768, 1024, 2048],
      'text-embedding-3-small': [512, 1536],
      'text-embedding-3-large': [256, 1024, 3072],
    }

    const availableDimensions = variableDimensionModels[config.modelName]
    if (availableDimensions && availableDimensions.includes(indexDimension)) {
      return { ...config, dimensions: indexDimension }
    }

    // For fixed dimension models or unsupported dimensions, return original config
    // The embedding service will generate the model's default dimension
    return config
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

    const response = await withRetry(() => this.client!.listIndexes())
    const indexes = response.indexes || []

    const indexInfoList = indexes.map((idx) => {
      // Map embed config from API if present (for integrated inference indexes)
      // The Pinecone SDK returns `embed` on IndexModel for indexes created with integrated inference
      const apiEmbed = (idx as { embed?: {
        model?: string
        metric?: string
        dimension?: number
        vectorType?: string
        fieldMap?: { text?: string }
        readParameters?: Record<string, unknown>
        writeParameters?: Record<string, unknown>
      } }).embed

      const embed: IndexEmbedConfig | undefined = apiEmbed?.model ? {
        model: apiEmbed.model,
        metric: apiEmbed.metric as 'cosine' | 'euclidean' | 'dotproduct' | undefined,
        dimension: apiEmbed.dimension,
        vectorType: apiEmbed.vectorType as 'dense' | 'sparse' | undefined,
        fieldMap: apiEmbed.fieldMap?.text ? { text: apiEmbed.fieldMap.text } : undefined,
        readParameters: apiEmbed.readParameters,
        writeParameters: apiEmbed.writeParameters,
      } : undefined

      const indexInfo: IndexInfo = {
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
        vectorType: (idx as { vectorType?: string }).vectorType as 'dense' | 'sparse' | undefined,
        embed,
      }

      return indexInfo
    })

    // Update the index info cache with the latest data
    this.indexInfoCache.clear()
    for (const info of indexInfoList) {
      this.indexInfoCache.set(info.name, info)
    }

    return indexInfoList
  }

  /**
   * Get index statistics including namespace information
   */
  async getIndexStats(indexName: string): Promise<IndexStats> {
    const index = this.getIndex(indexName)
    const stats = await withRetry(() => index.describeIndexStats())

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

    const response = await withRetry(() => ns.listPaginated({
      prefix: params.prefix,
      limit: params.limit || 100,
      paginationToken: params.paginationToken,
    }))

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

    const response = await withRetry(() => ns.fetch(params.ids))

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
   * Supports three modes:
   * 1. Query by vector/text within a namespace (namespace specified)
   * 2. Query by vector/text across all namespaces (namespace omitted)
   * 3. Query by existing vector ID (id specified) - finds similar vectors using that vector's embedding
   *
   * For hybrid indexes (dense + dotproduct), if hybrid config is set and alpha is provided,
   * generates both dense and sparse embeddings and applies alpha weighting.
   */
  async queryVectors(
    params: QueryVectorsParams,
    embeddingConfigOverride?: EmbeddingConfig,
    hybridConfigOverride?: HybridEmbeddingConfig
  ): Promise<QueryResult> {
    // If reranking is enabled, delegate to searchWithRerank
    if (params.rerank?.enabled) {
      return this.searchWithRerank(
        params as QueryVectorsParams & { rerank: RerankConfig },
        embeddingConfigOverride,
        hybridConfigOverride
      )
    }

    const index = this.getIndex(params.indexName)

    // Only scope to namespace if explicitly provided
    const target = params.namespace !== undefined
      ? index.namespace(params.namespace)
      : index

    // Query by ID mode - use existing vector's embedding as query vector
    if (params.id) {
      const response = await withRetry(() => target.query({
        id: params.id!,
        topK: params.topK || 10,
        filter: params.filter,
        includeValues: params.includeValues ?? false,
        includeMetadata: params.includeMetadata ?? true,
      }))

      return {
        matches: response.matches.map((match) => ({
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

    // Query by vector or text
    let queryVector = params.vector
    let querySparseVector: SparseVector | undefined

    // If queryText is provided, generate embedding
    if (params.queryText && !queryVector && !querySparseVector) {
      // Check for hybrid query: if index is hybrid-capable and we have a hybrid config + alpha
      const hybridConfig = hybridConfigOverride || this.getHybridEmbeddingConfig(params.indexName)
      const alpha = params.alpha

      if (this.isHybridCapable(params.indexName) && hybridConfig && alpha !== undefined) {
        // Hybrid query: generate both dense and sparse embeddings
        const denseConfig = this.resolveEmbeddingDimension(hybridConfig.denseConfig, params.indexName)
        const sparseConfig = hybridConfig.sparseConfig

        const hybridResult = await this.embeddingService!.generateHybridEmbeddings(
          [params.queryText],
          { ...denseConfig, inputType: 'query' },
          { ...sparseConfig, inputType: 'query' }
        )

        // Apply alpha weighting
        const weighted = this.applyAlphaWeighting(
          hybridResult.dense.values[0],
          hybridResult.sparse.sparseValues[0],
          alpha
        )
        queryVector = weighted.vector
        querySparseVector = weighted.sparseVector
      } else {
        // Standard query: single embedding type
        let embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
        if (!embeddingConfig) {
          throw new Error(
            'No embedding configuration found. Please configure an embedding provider to search by text.'
          )
        }

        // Auto-resolve dimension based on index dimension
        embeddingConfig = this.resolveEmbeddingDimension(embeddingConfig, params.indexName)

        // Use inputType: 'query' for search operations
        const embeddingResult = await this.embeddingService!.generateEmbeddings(
          [params.queryText],
          { ...embeddingConfig, inputType: 'query' }
        )
        if (embeddingResult.type === 'dense') {
          queryVector = embeddingResult.values[0]
        } else {
          querySparseVector = embeddingResult.sparseValues[0]
        }
      }
    }

    if (!queryVector && !querySparseVector) {
      throw new Error('Either vector, queryText, or id must be provided for querying.')
    }

    // Build query params
    // Note: The Pinecone REST API supports sparse-only queries, but the SDK types
    // incorrectly require a dense vector. We use type assertion to work around this.
    const queryParams = {
      topK: params.topK || 10,
      filter: params.filter,
      includeValues: params.includeValues ?? false,
      includeMetadata: params.includeMetadata ?? true,
      ...(queryVector && { vector: queryVector }),
      ...(querySparseVector && { sparseVector: querySparseVector }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await withRetry(() => target.query(queryParams as any))

    return {
      matches: response.matches.map((match) => ({
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

  /**
   * Query vectors with reranking using searchRecords API
   * Reranking applies a second-stage scoring model to improve result relevance
   * Note: searchRecords requires a specific namespace - cross-namespace queries not supported
   */
  async searchWithRerank(
    params: QueryVectorsParams & { rerank: RerankConfig },
    embeddingConfigOverride?: EmbeddingConfig,
    hybridConfigOverride?: HybridEmbeddingConfig
  ): Promise<QueryResult> {
    if (!params.namespace && params.namespace !== '') {
      throw new Error('Reranking requires a specific namespace. Cross-namespace queries are not supported with reranking.')
    }

    const index = this.getIndex(params.indexName)
    const namespace = index.namespace(params.namespace || '__default__')

    // Generate query vector if queryText is provided
    let queryVector = params.vector
    let querySparseVector: SparseVector | undefined

    if (params.queryText && !queryVector) {
      // Check for hybrid query
      const hybridConfig = hybridConfigOverride || this.getHybridEmbeddingConfig(params.indexName)
      const alpha = params.alpha

      if (this.isHybridCapable(params.indexName) && hybridConfig && alpha !== undefined) {
        // Hybrid query: generate both dense and sparse embeddings
        const denseConfig = this.resolveEmbeddingDimension(hybridConfig.denseConfig, params.indexName)
        const sparseConfig = hybridConfig.sparseConfig

        const hybridResult = await this.embeddingService!.generateHybridEmbeddings(
          [params.queryText],
          { ...denseConfig, inputType: 'query' },
          { ...sparseConfig, inputType: 'query' }
        )

        // Apply alpha weighting
        const weighted = this.applyAlphaWeighting(
          hybridResult.dense.values[0],
          hybridResult.sparse.sparseValues[0],
          alpha
        )
        queryVector = weighted.vector
        querySparseVector = weighted.sparseVector
      } else {
        // Standard query: single embedding type
        let embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
        if (!embeddingConfig) {
          throw new Error(
            'No embedding configuration found. Please configure an embedding provider to search by text.'
          )
        }
        embeddingConfig = this.resolveEmbeddingDimension(embeddingConfig, params.indexName)

        const embeddingResult = await this.embeddingService!.generateEmbeddings(
          [params.queryText],
          { ...embeddingConfig, inputType: 'query' }
        )
        if (embeddingResult.type === 'dense') {
          queryVector = embeddingResult.values[0]
        } else {
          querySparseVector = embeddingResult.sparseValues[0]
        }
      }
    }

    if (!queryVector && !querySparseVector) {
      throw new Error('Either vector or queryText must be provided for reranked queries.')
    }

    // Build searchRecords query object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {
      topK: params.topK || 10,
    }

    if (params.filter) {
      query.filter = params.filter
    }

    // Add vector to query
    if (queryVector) {
      query.vector = { values: queryVector }
    }
    if (querySparseVector) {
      query.sparseVector = querySparseVector
    }

    // Build rerank config for searchRecords
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rerank: any = {
      model: params.rerank.model,
      topN: params.rerank.topN || params.topK || 10,
      rankFields: [params.rerank.rankField],
    }

    // For vector queries, provide the original query text for reranking
    if (params.queryText) {
      rerank.query = params.queryText
    }

    // Fields to return must include the rank field
    const fields = [params.rerank.rankField]
    // Also include other common fields if metadata is requested
    if (params.includeMetadata !== false) {
      fields.push('*') // Request all fields
    }

    try {
      // Call searchRecords API
      // Type for searchRecords response
      interface SearchRecordsResponse {
        result?: {
          hits?: Array<{
            _id: string
            _score?: number
            fields?: Record<string, unknown>  // Metadata fields nested under 'fields'
            [key: string]: unknown
          }>
        }
        usage?: {
          readUnits?: number
          rerankUnits?: number
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: SearchRecordsResponse = await withRetry(() => (namespace as any).searchRecords({
        query,
        rerank,
        fields: ['*'], // Get all fields
      }))

      // Transform searchRecords response to QueryResult format
      // searchRecords returns records - field names may vary by SDK version
      const matches = (response.result?.hits || []).map((hit) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = hit as any
        // Extract ID - try multiple possible field names
        const id = h._id || h.id || ''
        // Extract score - try multiple possible field names
        const score = h._score ?? h.score ?? h.rerank_score ?? 0
        // Extract metadata - may be in 'fields' object or spread at top level
        const { _id, id: _, _score, score: __, rerank_score, fields, ...rest } = h
        const metadata = fields || (Object.keys(rest).length > 0 ? rest : undefined)

        return {
          id,
          score: typeof score === 'number' ? score : 0,
          metadata: metadata as Record<string, unknown> | undefined,
          // searchRecords doesn't return vector values by default
          values: params.includeValues ? undefined : undefined,
        }
      })

      return {
        matches,
        namespace: params.namespace || '',
        usage: response.usage ? {
          readUnits: response.usage.readUnits || 0,
          rerankUnits: response.usage.rerankUnits,
        } : undefined,
      }
    } catch (error) {
      // Provide better error messages for common issues
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('rank_fields')) {
        throw new Error(
          `Reranking failed: The field "${params.rerank.rankField}" may not exist or contain text content. ` +
          `Please select a metadata field that contains text.`
        )
      }
      if (message.includes('token') && message.includes('exceeds')) {
        // Extract token counts from error if present
        const tokenMatch = message.match(/(\d+)\s*tokens.*maximum.*?(\d+)/i)
        const docTokens = tokenMatch?.[1] || 'unknown'
        const maxTokens = tokenMatch?.[2] || '1024'
        throw new Error(
          `Reranking failed: Document exceeds token limit (${docTokens}/${maxTokens} tokens). ` +
          `Try using shorter text content or a model with higher limits (e.g., Cohere Rerank 3.5).`
        )
      }
      throw error
    }
  }

  /**
   * Upsert vectors
   */
  async upsertVectors(params: UpsertVectorsParams): Promise<void> {
    const ns = this.getNamespace(params.indexName, params.namespace)

    for (let i = 0; i < params.vectors.length; i += PineconeService.BATCH_SIZE) {
      const batch = params.vectors.slice(i, i + PineconeService.BATCH_SIZE).map(v => {
        const record: {
          id: string
          values?: number[]
          metadata?: RecordMetadata
          sparseValues?: SparseVector
        } = {
          id: v.id,
          metadata: v.metadata as RecordMetadata | undefined,
        }
        // Only include values if they exist (for dense or hybrid indexes)
        if (v.values && v.values.length > 0) {
          record.values = v.values
        }
        // Only include sparseValues if they exist (for sparse or hybrid indexes)
        if (v.sparseValues) {
          record.sparseValues = v.sparseValues
        }

        return record
      })
      await withRetry(() => ns.upsert(batch))
    }
  }

  /**
   * Create a single vector (with optional embedding generation)
   * For hybrid indexes, generates both dense and sparse embeddings if hybrid config is set.
   */
  async createVector(
    params: CreateVectorParams,
    embeddingConfigOverride?: EmbeddingConfig,
    hybridConfigOverride?: HybridEmbeddingConfig
  ): Promise<void> {
    const metadata: Record<string, unknown> = { ...params.metadata }
    // Use params.textField if provided, otherwise fall back to index's embed config or '_text'
    const textField = params.textField || this.getTextFieldForIndex(params.indexName)
    if (params.text) metadata[textField] = params.text

    let embedding: { values?: number[]; sparseValues?: SparseVector } = { values: params.values }

    if (params.generateEmbedding && params.text) {
      // Check for hybrid mode: if index is hybrid-capable and we have hybrid config
      const hybridConfig = hybridConfigOverride || this.getHybridEmbeddingConfig(params.indexName)

      if (this.isHybridCapable(params.indexName) && hybridConfig) {
        // Hybrid upsert: generate both dense and sparse embeddings
        const denseConfig = this.resolveEmbeddingDimension(hybridConfig.denseConfig, params.indexName)
        const sparseConfig = hybridConfig.sparseConfig

        const hybridResult = await this.embeddingService!.generateHybridEmbeddings(
          [params.text],
          { ...denseConfig, inputType: 'passage' },
          { ...sparseConfig, inputType: 'passage' }
        )

        embedding = {
          values: hybridResult.dense.values[0],
          sparseValues: hybridResult.sparse.sparseValues[0],
        }
      } else {
        // Standard embedding: single type
        let config = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
        if (!config) {
          throw new Error('No embedding configuration found. Please configure an embedding provider.')
        }
        // Auto-resolve dimension based on index dimension
        config = this.resolveEmbeddingDimension(config, params.indexName)
        embedding = await this.generateSingleEmbedding(params.text, config)
      }
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
   * For hybrid indexes, regenerates both dense and sparse embeddings if hybrid config is set.
   */
  async updateVector(
    params: UpdateVectorParams,
    embeddingConfigOverride?: EmbeddingConfig,
    hybridConfigOverride?: HybridEmbeddingConfig
  ): Promise<void> {
    const ns = this.getNamespace(params.indexName, params.namespace)

    const metadata: Record<string, unknown> = { ...params.metadata }
    // Use params.textField if provided, otherwise fall back to index's embed config or '_text'
    const textField = params.textField || this.getTextFieldForIndex(params.indexName)
    if (params.text) metadata[textField] = params.text

    let embedding: { values?: number[]; sparseValues?: SparseVector } = {
      values: params.values,
      sparseValues: params.sparseValues,
    }

    if (params.regenerateEmbedding) {
      // Get text to embed: explicit params.text, or from metadata field
      const textToEmbed = params.text || (metadata[textField] as string | undefined)
      if (textToEmbed && typeof textToEmbed === 'string') {
        // Check for hybrid mode
        const hybridConfig = hybridConfigOverride || this.getHybridEmbeddingConfig(params.indexName)

        if (this.isHybridCapable(params.indexName) && hybridConfig) {
          // Hybrid update: generate both dense and sparse embeddings
          const denseConfig = this.resolveEmbeddingDimension(hybridConfig.denseConfig, params.indexName)
          const sparseConfig = hybridConfig.sparseConfig

          const hybridResult = await this.embeddingService!.generateHybridEmbeddings(
            [textToEmbed],
            { ...denseConfig, inputType: 'passage' },
            { ...sparseConfig, inputType: 'passage' }
          )

          embedding = {
            values: hybridResult.dense.values[0],
            sparseValues: hybridResult.sparse.sparseValues[0],
          }
        } else {
          // Standard update: single embedding type
          let config = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
          if (!config) {
            throw new Error('No embedding configuration found. Please configure an embedding provider.')
          }
          // Auto-resolve dimension based on index dimension
          config = this.resolveEmbeddingDimension(config, params.indexName)
          embedding = await this.generateSingleEmbedding(textToEmbed, config)
        }
      }
    }

    // Use upsert for value changes, update for metadata-only changes
    if (embedding.values || embedding.sparseValues) {
      const record: {
        id: string
        values?: number[]
        sparseValues?: SparseVector
        metadata?: RecordMetadata
      } = {
        id: params.id,
        metadata: Object.keys(metadata).length > 0 ? metadata as RecordMetadata : undefined,
      }
      if (embedding.values && embedding.values.length > 0) {
        record.values = embedding.values
      }
      if (embedding.sparseValues) {
        record.sparseValues = embedding.sparseValues
      }
      await withRetry(() => ns.upsert([record]))
    } else if (Object.keys(metadata).length > 0) {
      await withRetry(() => ns.update({
        id: params.id,
        metadata: metadata as RecordMetadata,
      }))
    }
  }

  /**
   * Delete vectors
   */
  async deleteVectors(params: DeleteVectorsParams): Promise<void> {
    const ns = this.getNamespace(params.indexName, params.namespace)

    if (params.deleteAll) {
      await withRetry(() => ns.deleteAll())
    } else if (params.ids && params.ids.length > 0) {
      await withRetry(() => ns.deleteMany(params.ids!))
    } else if (params.filter) {
      await withRetry(() => ns.deleteMany({ filter: params.filter! }))
    }
  }

  /**
   * Batch import vectors with optional embedding generation
   * For hybrid indexes, generates both dense and sparse embeddings if hybrid config is set.
   */
  async batchImport(
    params: BatchImportParams,
    embeddingConfigOverride?: EmbeddingConfig,
    onProgress?: (current: number, total: number) => void,
    hybridConfigOverride?: HybridEmbeddingConfig
  ): Promise<BatchImportResult> {
    const errors: string[] = []
    let upsertedCount = 0
    let embeddingConfig = embeddingConfigOverride || this.getEmbeddingConfig(params.indexName)
    // Auto-resolve dimension based on index dimension
    if (embeddingConfig) {
      embeddingConfig = this.resolveEmbeddingDimension(embeddingConfig, params.indexName)
    }

    // Check for hybrid mode
    const hybridConfig = hybridConfigOverride || this.getHybridEmbeddingConfig(params.indexName)
    const useHybrid = this.isHybridCapable(params.indexName) && hybridConfig

    // Use params.textField if provided, otherwise fall back to index's embed config or '_text'
    const textField = params.textField || this.getTextFieldForIndex(params.indexName)

    for (let i = 0; i < params.vectors.length; i += PineconeService.BATCH_SIZE) {
      const batch = params.vectors.slice(i, i + PineconeService.BATCH_SIZE)

      try {
        const vectorsToUpsert = useHybrid
          ? await this.prepareBatchVectorsHybrid(batch, params.generateEmbeddings, hybridConfig!, textField, params.indexName)
          : await this.prepareBatchVectors(batch, params.generateEmbeddings, embeddingConfig, textField)

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
    embeddingConfig?: EmbeddingConfig,
    textField: string = '_text'
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
      if (v.text) metadata[textField] = v.text

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
   * Prepare a batch of vectors for hybrid upsert, generating both dense and sparse embeddings
   */
  private async prepareBatchVectorsHybrid(
    batch: Array<{ id: string; text?: string; values?: number[]; metadata?: Record<string, unknown> }>,
    generateEmbeddings?: boolean,
    hybridConfig?: HybridEmbeddingConfig,
    textField: string = '_text',
    indexName?: string
  ): Promise<Array<{ id: string; values?: number[]; sparseValues?: SparseVector; metadata?: Record<string, unknown> }>> {
    if (!generateEmbeddings || !hybridConfig) {
      return batch.filter(v => v.values).map(v => ({
        id: v.id,
        values: v.values!,
        metadata: v.metadata,
      }))
    }

    // Get vectors that need embeddings (have text but no values)
    const textsToEmbed = batch.filter(v => v.text && !v.values).map(v => v.text!)

    if (textsToEmbed.length === 0) {
      // No text to embed, just return vectors with existing values
      return batch.filter(v => v.values).map(v => ({
        id: v.id,
        values: v.values!,
        metadata: v.metadata,
      }))
    }

    // Auto-resolve dimension for dense config
    const denseConfig = indexName
      ? this.resolveEmbeddingDimension(hybridConfig.denseConfig, indexName)
      : hybridConfig.denseConfig

    // Generate both dense and sparse embeddings
    const hybridResult = await this.embeddingService!.generateHybridEmbeddings(
      textsToEmbed,
      { ...denseConfig, inputType: 'passage' },
      { ...hybridConfig.sparseConfig, inputType: 'passage' }
    )

    let embeddingIndex = 0
    return batch.map(v => {
      const metadata: Record<string, unknown> = { ...v.metadata }
      if (v.text) metadata[textField] = v.text

      if (v.values) {
        // Use existing values
        return { id: v.id, values: v.values, metadata }
      } else if (v.text) {
        // Use generated hybrid embeddings
        const result = {
          id: v.id,
          values: hybridResult.dense.values[embeddingIndex],
          sparseValues: hybridResult.sparse.sparseValues[embeddingIndex],
          metadata,
        }
        embeddingIndex++
        return result
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

      // Extract values before arrow function to preserve type narrowing
      const cloud = spec.serverless.cloud as 'aws' | 'gcp' | 'azure'
      const region = spec.serverless.region
      const embedModel = params.embed.model
      const embedFieldMap = params.embed.fieldMap
      const embedMetric = params.embed.metric || params.metric

      await withRetry(() => this.client!.createIndexForModel({
        name: params.name,
        cloud,
        region,
        embed: {
          model: embedModel,
          fieldMap: embedFieldMap,
          metric: embedMetric,
        },
        deletionProtection: params.deletionProtection,
        waitUntilReady: true,
      }))

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

    const client = this.client!
    await withRetry(() => client.createIndex(createParams as unknown as Parameters<typeof client.createIndex>[0]))

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

    await withRetry(() => this.client!.deleteIndex(indexName))
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
   * Uses parallel batch processing (3 concurrent upserts) for ~3x speedup.
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
      validateDimensions = true,
      onProgress,
      signal,
    } = params

    // Number of concurrent upsert operations (3x parallelization)
    const PARALLEL_UPSERTS = 3

    // Auto-resolve dimension based on target index dimension
    let embeddingConfig = params.embeddingConfig
    if (embeddingConfig) {
      embeddingConfig = this.resolveEmbeddingDimension(embeddingConfig, targetIndexName)
    }

    const sourceNs = this.getNamespace(sourceIndexName, sourceNamespace)
    const targetNs = this.getNamespace(targetIndexName, targetNamespace)

    let copiedVectors = 0
    let dimensionValidated = !validateDimensions
    let paginationToken: string | undefined

    // Track pending upsert operations for parallel processing
    const pendingUpserts: Promise<{ count: number }>[] = []

    try {
      do {
        if (signal?.aborted) {
          // Wait for any pending upserts before returning
          await Promise.allSettled(pendingUpserts)
          return { success: false, copiedVectors, error: 'Operation cancelled' }
        }

        // List next batch of vector IDs
        const listResult = await withRetry(() => sourceNs.listPaginated({ limit: PineconeService.BATCH_SIZE, paginationToken }))
        const ids = listResult.vectors?.map(v => v.id || '').filter(Boolean) || []
        paginationToken = listResult.pagination?.next

        if (ids.length === 0) break

        // Fetch vector data
        const fetchResult = await withRetry(() => sourceNs.fetch(ids))
        const records = Object.values(fetchResult.records || {})
        if (records.length === 0) continue

        // Prepare vectors (may include embedding regeneration)
        const vectorsToUpsert = await this.prepareCloneVectors(
          records,
          regenerateEmbeddings,
          embeddingConfig,
          textField
        )

        if (vectorsToUpsert.length === 0) continue

        // Validate dimensions on first batch if requested (must be sync)
        if (!dimensionValidated) {
          await this.validateCloneDimensions(vectorsToUpsert, targetIndexName)
          dimensionValidated = true
        }

        // If we have max parallel upserts in flight, wait for one to complete
        if (pendingUpserts.length >= PARALLEL_UPSERTS) {
          const completed = await Promise.race(pendingUpserts)
          copiedVectors += completed.count
          onProgress?.(copiedVectors)
          // Remove completed promise from array
          const idx = pendingUpserts.findIndex(p => p === Promise.race([p]).then(() => p))
          if (idx >= 0) pendingUpserts.splice(idx, 1)
        }

        // Queue the upsert operation (don't await)
        const upsertCount = vectorsToUpsert.length
        const upsertPromise = withRetry(() => targetNs.upsert(vectorsToUpsert as PineconeRecord[]))
          .then(() => ({ count: upsertCount }))

        pendingUpserts.push(upsertPromise)

        // Clean up completed promises from the array
        const stillPending: Promise<{ count: number }>[] = []
        for (const p of pendingUpserts) {
          const result = await Promise.race([p, Promise.resolve(null)])
          if (result === null) {
            stillPending.push(p)
          } else {
            copiedVectors += result.count
            onProgress?.(copiedVectors)
          }
        }
        pendingUpserts.length = 0
        pendingUpserts.push(...stillPending)

      } while (paginationToken)

      // Wait for all remaining upserts to complete
      const finalResults = await Promise.all(pendingUpserts)
      for (const result of finalResults) {
        copiedVectors += result.count
      }
      onProgress?.(copiedVectors)

      return { success: true, copiedVectors }

    } catch (error) {
      // Wait for pending operations before reporting error
      await Promise.allSettled(pendingUpserts)
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

    const targetInfo = await withRetry(() => this.client!.describeIndex(targetIndexName))
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
      const listResult = await withRetry(() => ns.listPaginated({
        limit: Math.min(PineconeService.BATCH_SIZE, limit - allVectors.length),
        paginationToken,
      }))

      const ids = listResult.vectors?.map(v => v.id || '').filter(Boolean) || []
      paginationToken = listResult.pagination?.next

      if (ids.length === 0) break

      const fetchResult = await withRetry(() => ns.fetch(ids))
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

  /**
   * Get vectors with server-side pagination
   * Returns a page of vectors with cursor for next page
   */
  async getVectorsPaginated(
    indexName: string,
    namespace?: string,
    pageSize: number = 100,
    cursor?: string
  ): Promise<PaginatedVectorsResult> {
    const ns = this.getNamespace(indexName, namespace)

    const listResult = await withRetry(() => ns.listPaginated({
      limit: Math.min(pageSize, PineconeService.BATCH_SIZE),
      paginationToken: cursor,
    }))

    const ids = listResult.vectors?.map(v => v.id || '').filter(Boolean) || []

    if (ids.length === 0) {
      return { vectors: [], nextCursor: undefined, hasMore: false }
    }

    const fetchResult = await withRetry(() => ns.fetch(ids))
    const vectors = Object.values(fetchResult.records || {}).map(record => ({
      id: record.id,
      values: record.values || [],
      metadata: record.metadata || null,
      sparseValues: record.sparseValues,
    }))

    return {
      vectors,
      nextCursor: listResult.pagination?.next,
      hasMore: !!listResult.pagination?.next,
    }
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
