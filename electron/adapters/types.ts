/**
 * Multi-Database Vector Explorer - Unified Types
 * 
 * These types provide a database-agnostic interface for vector database operations.
 * Each adapter (Pinecone, Qdrant, Weaviate) implements these interfaces.
 */

// ============================================================================
// Provider Types
// ============================================================================

export type DatabaseProvider = 'pinecone' | 'qdrant' | 'weaviate'

export interface DatabaseCapabilities {
  /** Whether the database supports namespace/partition concepts */
  supportsNamespaces: boolean
  /** Whether sparse vectors are supported */
  supportsSparseVectors: boolean
  /** Whether hybrid (dense + sparse) search is supported */
  supportsHybridSearch: boolean
  /** Whether the database has built-in embedding generation */
  supportsIntegratedEmbeddings: boolean
  /** Whether built-in reranking is available */
  supportsReranking: boolean
  /** List of supported distance metrics */
  supportedMetrics: DistanceMetric[]
  /** Maximum vector dimension supported */
  maxDimension: number
  /** Whether vectors can be listed/browsed (some DBs only support query) */
  supportsVectorListing: boolean
  /** Whether metadata/payload can be updated independently of vectors */
  supportsMetadataUpdate: boolean
}

// ============================================================================
// Connection Types
// ============================================================================

export interface BaseConnectionConfig {
  provider: DatabaseProvider
  name: string // User-friendly connection name
}

export interface PineconeConnectionConfig extends BaseConnectionConfig {
  provider: 'pinecone'
  apiKey: string
}

export interface QdrantConnectionConfig extends BaseConnectionConfig {
  provider: 'qdrant'
  url: string // e.g., http://localhost:6333 or https://xxx.qdrant.io
  apiKey?: string // Optional for local, required for cloud
}

export interface WeaviateConnectionConfig extends BaseConnectionConfig {
  provider: 'weaviate'
  scheme: 'http' | 'https'
  host: string // e.g., localhost:8080 or xxx.weaviate.network
  apiKey?: string // For Weaviate Cloud
  // Additional auth options can be added (OIDC, etc.)
}

export type ConnectionConfig = 
  | PineconeConnectionConfig 
  | QdrantConnectionConfig 
  | WeaviateConnectionConfig

// ============================================================================
// Collection Types (Index in Pinecone, Collection in Qdrant/Weaviate)
// ============================================================================

export type DistanceMetric = 'cosine' | 'euclidean' | 'dotproduct' | 'manhattan'

export type VectorType = 'dense' | 'sparse' | 'hybrid'

export interface CollectionInfo {
  /** Collection/Index name */
  name: string
  /** Vector dimension (undefined for sparse-only) */
  dimension?: number
  /** Distance metric used */
  metric: DistanceMetric
  /** Type of vectors stored */
  vectorType: VectorType
  /** Whether the collection is ready for operations */
  ready: boolean
  /** Provider-specific status string */
  status: string
  /** Total vector count (if available) */
  vectorCount?: number
  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>
}

export interface CollectionStats {
  /** Namespaces/partitions with vector counts */
  namespaces: Record<string, { vectorCount: number }>
  /** Vector dimension */
  dimension: number
  /** Total vectors across all namespaces */
  totalVectorCount: number
  /** Index fullness (0-1, Pinecone specific) */
  indexFullness?: number
}

export interface CreateCollectionParams {
  name: string
  dimension?: number // Required for dense, optional for sparse
  metric?: DistanceMetric
  vectorType?: VectorType
  /** Provider-specific options */
  providerOptions?: Record<string, unknown>
}

// ============================================================================
// Vector/Record Types
// ============================================================================

export interface SparseVector {
  indices: number[]
  values: number[]
}

export interface VectorRecord {
  /** Unique identifier */
  id: string
  /** Dense vector values */
  values?: number[]
  /** Sparse vector (for hybrid/sparse indexes) */
  sparseValues?: SparseVector
  /** Metadata/payload/properties */
  metadata?: Record<string, unknown> | null
  /** Similarity score (only in query results) */
  score?: number
  /** Source namespace/partition (for cross-namespace queries) */
  namespace?: string
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryParams {
  /** Collection/index name */
  collectionName: string
  /** Namespace/partition (if supported) */
  namespace?: string
  /** Dense query vector */
  vector?: number[]
  /** Sparse query vector */
  sparseVector?: SparseVector
  /** Query by existing vector ID */
  id?: string
  /** Text to embed and query (requires embedding config) */
  queryText?: string
  /** Maximum results to return */
  topK?: number
  /** Metadata filter */
  filter?: Record<string, unknown>
  /** Include vector values in response */
  includeValues?: boolean
  /** Include metadata in response */
  includeMetadata?: boolean
  /** Hybrid search alpha (1.0 = pure dense, 0.0 = pure sparse) */
  alpha?: number
}

export interface QueryResult {
  matches: VectorRecord[]
  namespace: string
  usage?: {
    readUnits?: number
    rerankUnits?: number
  }
}

// ============================================================================
// Mutation Types
// ============================================================================

export interface UpsertParams {
  collectionName: string
  namespace?: string
  vectors: Array<{
    id: string
    values?: number[]
    sparseValues?: SparseVector
    metadata?: Record<string, unknown>
  }>
}

export interface UpdateParams {
  collectionName: string
  namespace?: string
  id: string
  values?: number[]
  sparseValues?: SparseVector
  metadata?: Record<string, unknown>
}

export interface DeleteParams {
  collectionName: string
  namespace?: string
  ids?: string[]
  deleteAll?: boolean
  filter?: Record<string, unknown>
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface ListParams {
  collectionName: string
  namespace?: string
  /** Number of records per page */
  limit?: number
  /** Pagination cursor/token */
  cursor?: string
  /** ID prefix filter (if supported) */
  prefix?: string
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor?: string
  hasMore: boolean
}

// ============================================================================
// Filter Types (Unified filter syntax, adapters translate to provider-specific)
// ============================================================================

export type FilterOperator = 
  | '$eq' | '$ne' 
  | '$gt' | '$gte' | '$lt' | '$lte'
  | '$in' | '$nin'
  | '$exists'

export type FilterCondition = {
  field: string
  operator: FilterOperator
  value: unknown
}

export type FilterExpression = 
  | FilterCondition
  | { $and: FilterExpression[] }
  | { $or: FilterExpression[] }
  | { $not: FilterExpression }

// ============================================================================
// Database Interface
// ============================================================================

export interface VectorDatabase {
  // Provider info
  readonly provider: DatabaseProvider
  readonly capabilities: DatabaseCapabilities

  // Connection lifecycle
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): void
  isConnected(): boolean

  // Collection operations
  listCollections(): Promise<CollectionInfo[]>
  getCollectionStats(name: string): Promise<CollectionStats>
  createCollection(params: CreateCollectionParams): Promise<void>
  deleteCollection(name: string): Promise<void>

  // Vector operations
  listVectors(params: ListParams): Promise<PaginatedResult<VectorRecord>>
  fetchVectors(collectionName: string, ids: string[], namespace?: string): Promise<VectorRecord[]>
  queryVectors(params: QueryParams): Promise<QueryResult>
  upsertVectors(params: UpsertParams): Promise<void>
  updateVector(params: UpdateParams): Promise<void>
  deleteVectors(params: DeleteParams): Promise<void>
}

// ============================================================================
// Factory Types
// ============================================================================

export interface DatabaseAdapterFactory {
  create(config: ConnectionConfig): Promise<VectorDatabase>
  getSupportedProviders(): DatabaseProvider[]
}
