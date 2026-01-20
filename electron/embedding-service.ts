import OpenAI from 'openai'
import { EmbeddingConfig, EmbeddingProviderType } from './types'

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
 * Service for generating embeddings using various providers
 */
export class EmbeddingService {
  private openaiClient: OpenAI | null = null

  /**
   * Generate embeddings for an array of texts
   */
  async generateEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    switch (config.provider) {
      case 'openai':
        return this.generateOpenAIEmbeddings(texts, config)
      case 'ollama':
        return this.generateOllamaEmbeddings(texts, config)
      case 'cohere':
        return this.generateCohereEmbeddings(texts, config)
      case 'voyage':
        return this.generateVoyageEmbeddings(texts, config)
      case 'huggingface':
        return this.generateHuggingFaceEmbeddings(texts, config)
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
      'text-embedding-ada-002': 1536,
      // Cohere models
      'embed-english-v3.0': 1024,
      'embed-multilingual-v3.0': 1024,
      'embed-english-light-v3.0': 384,
      'embed-multilingual-light-v3.0': 384,
      // Voyage models
      'voyage-3': 1024,
      'voyage-3-lite': 512,
      'voyage-code-3': 1024,
      // Ollama models (varies by model)
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024,
      'all-minilm': 384,
    }

    const modelName = config.modelName || this.getDefaultModel(config.provider)
    return modelDimensions[modelName] || 1536 // Default to 1536 if unknown
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: EmbeddingProviderType): string {
    const defaults: Record<EmbeddingProviderType, string> = {
      openai: 'text-embedding-3-small',
      cohere: 'embed-english-v3.0',
      voyage: 'voyage-3',
      ollama: 'nomic-embed-text',
      huggingface: 'sentence-transformers/all-MiniLM-L6-v2',
    }
    return defaults[provider]
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

  /**
   * Generate embeddings using Ollama (local)
   */
  private async generateOllamaEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    const url = config.url || 'http://localhost:11434'
    const model = config.modelName || 'nomic-embed-text'

    const embeddings: number[][] = []

    // Ollama doesn't support batch embeddings, so we process one at a time
    for (const text of texts) {
      const response = await fetch(`${url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      const data = await response.json()
      embeddings.push(data.embedding)
    }

    return embeddings
  }

  /**
   * Generate embeddings using Cohere
   */
  private async generateCohereEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    const apiKeyEnvVar = config.apiKeyEnvVar || 'COHERE_API_KEY'
    const apiKey = process.env[apiKeyEnvVar]

    if (!apiKey) {
      throw new EmbeddingCredentialsError('Cohere', apiKeyEnvVar)
    }

    const model = config.modelName || 'embed-english-v3.0'

    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        texts,
        model,
        input_type: 'search_document',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Cohere API error: ${error}`)
    }

    const data = await response.json()
    return data.embeddings
  }

  /**
   * Generate embeddings using Voyage AI
   */
  private async generateVoyageEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    const apiKeyEnvVar = config.apiKeyEnvVar || 'VOYAGE_API_KEY'
    const apiKey = process.env[apiKeyEnvVar]

    if (!apiKey) {
      throw new EmbeddingCredentialsError('Voyage AI', apiKeyEnvVar)
    }

    const model = config.modelName || 'voyage-3'

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Voyage AI API error: ${error}`)
    }

    const data = await response.json()
    return data.data.map((d: { embedding: number[] }) => d.embedding)
  }

  /**
   * Generate embeddings using HuggingFace Inference API
   */
  private async generateHuggingFaceEmbeddings(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<number[][]> {
    const apiKeyEnvVar = config.apiKeyEnvVar || 'HUGGINGFACE_API_KEY'
    const apiKey = process.env[apiKeyEnvVar]

    if (!apiKey) {
      throw new EmbeddingCredentialsError('HuggingFace', apiKeyEnvVar)
    }

    const model = config.modelName || 'sentence-transformers/all-MiniLM-L6-v2'
    const url = config.url || `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: texts }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HuggingFace API error: ${error}`)
    }

    const data = await response.json()

    // HuggingFace returns embeddings directly as arrays
    // For sentence-transformers, we may need to average token embeddings
    if (Array.isArray(data) && Array.isArray(data[0])) {
      if (Array.isArray(data[0][0])) {
        // Token-level embeddings, need to mean pool
        return data.map((tokenEmbeddings: number[][]) => {
          const dim = tokenEmbeddings[0].length
          const meanPooled = new Array(dim).fill(0)
          for (const tokenEmb of tokenEmbeddings) {
            for (let i = 0; i < dim; i++) {
              meanPooled[i] += tokenEmb[i]
            }
          }
          return meanPooled.map((v) => v / tokenEmbeddings.length)
        })
      }
      // Already sentence-level embeddings
      return data
    }

    throw new Error('Unexpected HuggingFace response format')
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService()
