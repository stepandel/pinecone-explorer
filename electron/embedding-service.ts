import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import { EmbeddingConfig } from './types'

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
 * Sparse vector representation
 */
export interface SparseVector {
  indices: number[]
  values: number[]
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
   * Generate dense embeddings using Pinecone Inference API
   */
  private async generatePineconeDenseEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResult> {
    if (!this.pineconeClient) {
      throw new Error('Pinecone client not initialized. Please connect first.')
    }

    const modelName = config.modelName || 'llama-text-embed-v2'
    const inputType = config.inputType || 'passage'

    const params: Record<string, unknown> = {
      inputType,
      truncate: 'END',
    }

    // Only pass dimension for models that support it
    if (modelName === 'llama-text-embed-v2' && config.dimensions) {
      params.dimension = config.dimensions
    }

    const response = await this.pineconeClient.inference.embed(
      modelName,
      texts,
      params as Record<string, string>
    )

    const values = response.data.map(item => {
      const embedding = item as unknown as { values?: number[] }
      if (!embedding.values) {
        throw new Error('Pinecone inference returned empty embedding values')
      }
      return embedding.values
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

    const modelName = config.modelName || 'pinecone-sparse-english-v0'
    const inputType = config.inputType || 'passage'

    const response = await this.pineconeClient.inference.embed(
      modelName,
      texts,
      { inputType, truncate: 'END' } as Record<string, string>
    )

    const sparseValues: SparseVector[] = response.data.map(item => {
      const embedding = item as unknown as {
        sparseValues?: { indices: number[]; values: number[] }
      }
      if (!embedding.sparseValues) {
        throw new Error('Pinecone inference returned empty sparse embedding values')
      }
      return {
        indices: embedding.sparseValues.indices,
        values: embedding.sparseValues.values,
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

    const modelName = config.modelName || 'text-embedding-3-small'

    const response = await this.openaiClient.embeddings.create({
      model: modelName,
      input: texts,
    })

    return { type: 'dense', values: response.data.map(d => d.embedding) }
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService()
