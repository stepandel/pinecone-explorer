/**
 * Embedding Function Factory
 *
 * This file is kept for backwards compatibility.
 * The actual embedding logic has moved to embedding-service.ts
 */

export { EmbeddingService, EmbeddingCredentialsError, embeddingService } from './embedding-service'

// Re-export types
export type { EmbeddingConfig, EmbeddingProviderType } from './types'
