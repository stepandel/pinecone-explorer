// Pinecone Explorer Types

/**
 * Supported embedding provider types
 */
export type EmbeddingProviderType =
  | 'pinecone'
  | 'openai'

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  provider: EmbeddingProviderType
  modelName?: string
  dimensions?: number // For models that support variable dimensions (e.g., llama-text-embed-v2)
  apiKeyEnvVar?: string // Environment variable name for API key
  inputType?: 'query' | 'passage' // For Pinecone inference: 'query' for search, 'passage' for upsert
}

/**
 * Connection profile for Pinecone
 */
export interface ConnectionProfile {
  id: string // UUID
  name: string // User-friendly name (e.g., "Production")

  // Pinecone authentication
  apiKey: string // Pinecone API key

  createdAt: number // Timestamp
  lastUsed?: number // Timestamp

  // Default embedding config for this connection
  defaultEmbeddingConfig?: EmbeddingConfig

  // Per-index embedding overrides
  embeddingOverrides?: Record<string, EmbeddingConfig>
}

/**
 * Pinecone index information
 */
export interface IndexInfo {
  name: string
  dimension?: number // Optional for sparse indexes
  metric: 'cosine' | 'euclidean' | 'dotproduct'
  host: string
  status: {
    ready: boolean
    state: string
  }
  spec: {
    serverless?: {
      cloud: 'aws' | 'gcp' | 'azure'
      region: string
    }
    pod?: {
      environment: string
      podType: string
      pods?: number
      replicas?: number
      shards?: number
    }
  }
  deletionProtection?: 'enabled' | 'disabled'
}

/**
 * Index statistics including namespace information
 */
export interface IndexStats {
  namespaces: Record<string, { vectorCount: number }>
  dimension: number
  indexFullness: number
  totalVectorCount: number
}

/**
 * Vector record for Pinecone
 */
export interface VectorRecord {
  id: string
  values: number[] // The vector embedding
  metadata?: Record<string, unknown> | null
  sparseValues?: {
    indices: number[]
    values: number[]
  }
  score?: number // Only present in query results (similarity score)
}

/**
 * Parameters for querying vectors
 */
export interface QueryVectorsParams {
  indexName: string
  namespace?: string
  vector?: number[] // Query vector
  queryText?: string // Text to embed and query (requires embedding config)
  topK?: number // Max results (default: 10)
  filter?: Record<string, unknown> // Metadata filter
  includeValues?: boolean // Include vector values in response
  includeMetadata?: boolean // Include metadata in response
}

/**
 * Query result from Pinecone
 */
export interface QueryResult {
  matches: Array<{
    id: string
    score: number
    values?: number[]
    metadata?: Record<string, unknown>
    sparseValues?: {
      indices: number[]
      values: number[]
    }
  }>
  namespace: string
  usage?: {
    readUnits: number
  }
}

/**
 * Parameters for upserting vectors
 */
export interface UpsertVectorsParams {
  indexName: string
  namespace?: string
  vectors: Array<{
    id: string
    values: number[]
    metadata?: Record<string, unknown>
    sparseValues?: {
      indices: number[]
      values: number[]
    }
  }>
}

/**
 * Parameters for creating a vector (single upsert with optional text embedding)
 */
export interface CreateVectorParams {
  indexName: string
  namespace?: string
  id: string
  values?: number[] // Provide embedding directly
  text?: string // Or provide text to generate embedding
  metadata?: Record<string, unknown>
  generateEmbedding?: boolean // If true, generate embedding from text
}

/**
 * Parameters for updating a vector
 */
export interface UpdateVectorParams {
  indexName: string
  namespace?: string
  id: string
  values?: number[] // New embedding values
  metadata?: Record<string, unknown> // New metadata (merged with existing)
  text?: string // New text to store in metadata
  regenerateEmbedding?: boolean // If true, regenerate embedding from text
}

/**
 * Parameters for deleting vectors
 */
export interface DeleteVectorsParams {
  indexName: string
  namespace?: string
  ids?: string[] // Delete specific IDs
  deleteAll?: boolean // Delete all vectors in namespace
  filter?: Record<string, unknown> // Delete by metadata filter
}

/**
 * Parameters for fetching vectors by ID
 */
export interface FetchVectorsParams {
  indexName: string
  namespace?: string
  ids: string[]
}

/**
 * Parameters for listing vectors (paginated)
 */
export interface ListVectorsParams {
  indexName: string
  namespace?: string
  prefix?: string // ID prefix filter
  limit?: number // Max results per page
  paginationToken?: string // Token for next page
}

/**
 * List vectors result with pagination
 */
export interface ListVectorsResult {
  vectors: Array<{ id: string }>
  pagination?: {
    next?: string
  }
  namespace: string
  usage?: {
    readUnits: number
  }
}

/**
 * Parameters for creating a new index
 */
export interface CreateIndexParams {
  name: string
  dimension?: number // Required for dense indexes, omit for sparse
  metric?: 'cosine' | 'euclidean' | 'dotproduct'
  vectorType?: 'dense' | 'sparse' // Default is 'dense'
  spec: {
    serverless: {
      cloud: 'aws' | 'gcp' | 'azure'
      region: string
    }
  } | {
    pod: {
      environment: string
      podType: string
      pods?: number
      replicas?: number
      shards?: number
    }
  }
  deletionProtection?: 'enabled' | 'disabled'
}

/**
 * Parameters for batch import
 */
export interface BatchImportParams {
  indexName: string
  namespace?: string
  vectors: Array<{
    id: string
    text?: string
    metadata?: Record<string, unknown>
    values?: number[]
  }>
  generateEmbeddings?: boolean
}

/**
 * Batch import result
 */
export interface BatchImportResult {
  upsertedCount: number
  errors: string[]
}

/**
 * Parameters for cloning/copying an index
 */
export interface CloneIndexParams {
  sourceIndexName: string
  sourceNamespace?: string
  targetIndexName: string
  targetNamespace?: string
  regenerateEmbeddings?: boolean
}

/**
 * Clone progress tracking
 */
export interface CloneProgress {
  phase: 'creating' | 'copying' | 'complete' | 'error' | 'cancelled'
  totalVectors: number
  processedVectors: number
  message: string
}

/**
 * Clone result
 */
export interface CloneResult {
  success: boolean
  indexInfo?: IndexInfo
  totalVectors: number
  copiedVectors: number
  error?: string
}

// Legacy type aliases for backwards compatibility during migration
export type CollectionInfo = IndexInfo
export type DocumentRecord = VectorRecord
