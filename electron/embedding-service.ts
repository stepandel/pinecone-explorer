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
   * Generate embeddings for an array of texts
   */
  async generateEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    switch (config.provider) {
      case 'pinecone':
        return this.generatePineconeEmbeddings(texts, config)
      case 'openai':
        return this.generateOpenAIEmbeddings(texts, config)
      default:
        throw new Error(`Unsupported embedding provider: ${config.provider}`)
    }
  }

  /**
   * Get the dimension for a given embedding model
   */
  getDimension(config: EmbeddingConfig): number {
    const modelDimensions: Record<string, number> = {
      // OpenAI models
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      // Pinecone models (default dimensions)
      'llama-text-embed-v2': 1024,
      'multilingual-e5-large': 1024,
    }

    const modelName = config.modelName || this.getDefaultModel(config.provider)

    // For Pinecone models with variable dimensions, use the configured dimension
    if (config.provider === 'pinecone' && config.dimensions) {
      return config.dimensions
    }

    return modelDimensions[modelName] || 1024
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: 'pinecone' | 'openai'): string {
    const defaults: Record<'pinecone' | 'openai', string> = {
      pinecone: 'llama-text-embed-v2',
      openai: 'text-embedding-3-small',
    }
    return defaults[provider]
  }

  /**
   * Generate embeddings using Pinecone Inference API
   */
  private async generatePineconeEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    if (!this.pineconeClient) {
      throw new Error('Pinecone client not initialized. Please connect first.')
    }

    const modelName = config.modelName || 'llama-text-embed-v2'
    const inputType = config.inputType || 'passage'

    // Build parameters for Pinecone inference
    const params: {
      inputType: 'query' | 'passage'
      truncate: 'END' | 'NONE'
      dimensions?: number
    } = {
      inputType,
      truncate: 'END',
    }

    // Only pass dimensions for models that support it (llama-text-embed-v2)
    if (modelName === 'llama-text-embed-v2' && config.dimensions) {
      params.dimensions = config.dimensions
    }

    const response = await this.pineconeClient.inference.embed(
      modelName,
      texts,
      params
    )

    // Extract values from the response
    return response.data.map(item => {
      if (!item.values) {
        throw new Error('Pinecone inference returned empty embedding values')
      }
      return item.values as number[]
    })
  }

  /**
   * Generate embeddings using OpenAI
   */
  private async generateOpenAIEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
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

    return response.data.map((d) => d.embedding)
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService()
