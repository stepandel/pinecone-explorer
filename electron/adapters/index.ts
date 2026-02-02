/**
 * Multi-Database Vector Explorer - Adapters Module
 * 
 * Export all adapters and types for use throughout the application.
 */

// Types
export * from './types'

// Base adapter
export { BaseVectorAdapter } from './base-adapter'

// Provider adapters
export { PineconeAdapter } from './pinecone-adapter'
export { QdrantAdapter } from './qdrant-adapter'
export { WeaviateAdapter } from './weaviate-adapter'

// Factory
export { 
  createDatabaseAdapter, 
  getSupportedProviders,
  VectorDatabaseFactory,
  databaseFactory,
} from './factory'
