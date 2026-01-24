import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import { EmbeddingConfig, SparseVector } from './types'

// Re-export SparseVector for backwards compatibility
export type { SparseVector }

/**
 * Custom error for missing API credentials
 */
export class EmbeddingCredentialsError extends Error {
  constructor(
    public provider: string,
    public envVar: string,
    message?: string
  ) {
    super(message || `${provider} API key not configured. Set the ${envVar} in Settings.`)
    this.name = 'EmbeddingCredentialsError'
  }
}

/**
 * Result from embedding generation - either dense or sparse
 */
export type EmbeddingResult =
  | { type: 'dense'; values: number[][] }
  | { type: 'sparse'; sparseValues: SparseVector[] }

/**
 * Service for generating embeddings using Pinecone Inference or OpenAI
 */
export class EmbeddingService {
  private openaiClient: OpenAI | null = null
  private pineconeClient: Pinecone | null = null

  /**
   * Set the Pinecone client instance (passed from PineconeService)
   */
  setPineconeClient(client: Pinecone): void {
    this.pineconeClient = client
  }

  /**
   * Generate embeddings for an array of texts.
   * Returns EmbeddingResult which can be either dense or sparse based on the model.
   */
  async generateEmbeddings(texts: string[], config: EmbeddingConfig): Promise<EmbeddingResult> {
    const isSparse = config.vectorType === 'sparse'

    switch (config.provider) {
      case 'pinecone':
        return isSparse
          ? this.generatePineconeSparseEmbeddings(texts, config)
          : this.generatePineconeDenseEmbeddings(texts, config)
      case 'openai':
        if (isSparse) {
          throw new Error('OpenAI does not support sparse embeddings')
        }
        return this.generateOpenAIEmbeddings(texts, config)
      default:
        throw new Error(`Unsupported embedding provider: ${config.provider}`)
    }
  }

  /**
   * Generate both dense and sparse embeddings in parallel for hybrid search.
   * Used for indexes that support hybrid queries (dense + dotproduct metric).
   */
  async generateHybridEmbeddings(
    texts: string[],
    denseConfig: EmbeddingConfig,
    sparseConfig: EmbeddingConfig
  ): Promise<{
    dense: { type: 'dense'; values: number[][] }
    sparse: { type: 'sparse'; sparseValues: SparseVector[] }
  }> {
    // Validate configs
    if (denseConfig.vectorType !== 'dense') {
      throw new Error('Dense config must have vectorType "dense"')
    }
    if (sparseConfig.vectorType !== 'sparse') {
      throw new Error('Sparse config must have vectorType "sparse"')
    }

    // Generate both embeddings in parallel
    const [denseResult, sparseResult] = await Promise.all([
      this.generateEmbeddings(texts, denseConfig),
      this.generateEmbeddings(texts, sparseConfig),
    ])

    // Type guards
    if (denseResult.type !== 'dense') {
      throw new Error('Expected dense embeddings but got sparse')
    }
    if (sparseResult.type !== 'sparse') {
      throw new Error('Expected sparse embeddings but got dense')
    }

    return {
      dense: denseResult,
      sparse: sparseResult,
    }
  }

  /**
   * Generate dense embeddings using Pinecone Inference API
   */
  private async generatePineconeDenseEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResult> {
    if (!this.pineconeClient) {
      throw new Error('Pinecone client not initialized. Please connect first.')
    }

    const inputType = config.inputType || 'passage'

    const params: Record<string, unknown> = {
      inputType,
      truncate: 'END',
    }

    // Only pass dimension for models that support it
    if (config.modelName === 'llama-text-embed-v2' && config.dimensions) {
      params.dimension = config.dimensions
    }

    const response = await this.pineconeClient.inference.embed(
      config.modelName,
      texts,
      params as Record<string, string>
    )

    const values = response.data.map(item => {
      const embedding = item as unknown as { values?: number[] | Float32Array }
      if (!embedding.values) {
        throw new Error('Pinecone inference returned empty embedding values')
      }
      // SDK may return TypedArrays - convert to regular arrays
      return Array.from(embedding.values)
    })

    return { type: 'dense', values }
  }

  /**
   * Generate sparse embeddings using Pinecone Inference API
   */
  private async generatePineconeSparseEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResult> {
    if (!this.pineconeClient) {
      throw new Error('Pinecone client not initialized. Please connect first.')
    }

    const inputType = config.inputType || 'passage'

    const response = await this.pineconeClient.inference.embed(
      config.modelName,
      texts,
      { inputType, truncate: 'END' } as Record<string, string>
    )

    const sparseValues: SparseVector[] = response.data.map(item => {
      // SDK returns sparseValues and sparseIndices as separate top-level properties
      const embedding = item as unknown as {
        sparseValues?: number[] | Float32Array
        sparseIndices?: number[] | Uint32Array
      }
      if (!embedding.sparseValues || !embedding.sparseIndices) {
        throw new Error('Pinecone inference returned empty sparse embedding values')
      }
      return {
        indices: Array.from(embedding.sparseIndices),
        values: Array.from(embedding.sparseValues),
      }
    })

    return { type: 'sparse', sparseValues }
  }

  /**
   * Generate dense embeddings using OpenAI
   */
  private async generateOpenAIEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResult> {
    const apiKeyEnvVar = config.apiKeyEnvVar || 'OPENAI_API_KEY'
    const apiKey = process.env[apiKeyEnvVar]

    if (!apiKey) {
      throw new EmbeddingCredentialsError('OpenAI', apiKeyEnvVar)
    }

    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({ apiKey })
    }

    const params: OpenAI.EmbeddingCreateParams = {
      model: config.modelName,
      input: texts,
    }

    // Pass dimensions if specified (for models that support variable dimensions)
    if (config.dimensions) {
      params.dimensions = config.dimensions
    }

    const response = await this.openaiClient.embeddings.create(params)

    return { type: 'dense', values: response.data.map(d => d.embedding) }
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService()
