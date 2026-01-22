// Pinecone Explorer type declarations

declare global {
  type EmbeddingProviderType =
    | 'pinecone'
    | 'openai'

  interface EmbeddingConfig {
    provider: EmbeddingProviderType
    modelName: string
    vectorType: 'dense' | 'sparse'
    dimensions?: number // For models that support variable dimensions (e.g., llama-text-embed-v2)
    apiKeyEnvVar?: string // Environment variable name for API key
    inputType?: 'query' | 'passage' // For Pinecone inference: 'query' for search, 'passage' for upsert (set at call time)
  }

  interface ConnectionProfile {
    id: string
    name: string
    apiKey: string // Pinecone API key
    createdAt: number
    lastUsed?: number
    defaultEmbeddingConfig?: EmbeddingConfig
    embeddingOverrides?: Record<string, EmbeddingConfig>
  }

  interface IndexInfo {
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

  interface IndexStats {
    namespaces: Record<string, { vectorCount: number }>
    dimension: number
    indexFullness: number
    totalVectorCount: number
  }

  interface VectorRecord {
    id: string
    values: number[]
    metadata?: Record<string, unknown> | null
    sparseValues?: {
      indices: number[]
      values: number[]
    }
    score?: number
  }

  interface QueryVectorsParams {
    indexName: string
    namespace?: string
    vector?: number[]
    queryText?: string
    topK?: number
    filter?: Record<string, unknown>
    includeValues?: boolean
    includeMetadata?: boolean
  }

  interface QueryResult {
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

  interface CreateVectorParams {
    indexName: string
    namespace?: string
    id: string
    values?: number[]
    text?: string
    metadata?: Record<string, unknown>
    generateEmbedding?: boolean
  }

  interface UpdateVectorParams {
    indexName: string
    namespace?: string
    id: string
    values?: number[]
    metadata?: Record<string, unknown>
    text?: string
    regenerateEmbedding?: boolean
  }

  interface DeleteVectorsParams {
    indexName: string
    namespace?: string
    ids?: string[]
    deleteAll?: boolean
    filter?: Record<string, unknown>
  }

  interface BatchImportParams {
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

  interface BatchImportResult {
    upsertedCount: number
    errors: string[]
  }

  interface CreateIndexParams {
    name: string
    dimension?: number // Required for dense indexes without integrated inference, omit for sparse
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
    // Integrated inference configuration (for Pinecone-hosted embedding models)
    embed?: {
      model: string // e.g., 'multilingual-e5-large', 'llama-text-embed-v2'
      fieldMap: { text: string } // Maps record field to text for embedding
      metric?: 'cosine' | 'euclidean' | 'dotproduct'
    }
  }

  interface CloneProgress {
    phase: 'creating' | 'copying' | 'complete' | 'error' | 'cancelled'
    totalVectors: number
    processedVectors: number
    message: string
  }

  interface CloneResult {
    success: boolean
    indexInfo?: IndexInfo
    totalVectors: number
    copiedVectors: number
    error?: string
  }

  interface UpdateInfo {
    version: string
    releaseDate?: string
    releaseNotes?: string | null
  }

  interface UpdateStatus {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    info?: UpdateInfo
    progress?: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
    error?: string
  }

  interface ElectronAPI {
    pinecone: {
      connect: (profileId: string, profile: ConnectionProfile) => Promise<void>
      listIndexes: (profileId: string) => Promise<IndexInfo[]>
      getIndexStats: (profileId: string, indexName: string) => Promise<IndexStats>
      getAllVectors: (profileId: string, indexName: string, namespace?: string, limit?: number) => Promise<VectorRecord[]>
      queryVectors: (profileId: string, params: QueryVectorsParams) => Promise<QueryResult>
      createVector: (profileId: string, params: CreateVectorParams) => Promise<void>
      updateVector: (profileId: string, params: UpdateVectorParams) => Promise<void>
      deleteVectors: (profileId: string, params: DeleteVectorsParams) => Promise<void>
      batchImport: (profileId: string, params: BatchImportParams) => Promise<BatchImportResult>
      createIndex: (profileId: string, params: CreateIndexParams) => Promise<IndexInfo>
      deleteIndex: (profileId: string, indexName: string) => Promise<void>
      cloneIndex: (profileId: string, params: { sourceIndexName: string; targetIndexName: string; regenerateEmbeddings?: boolean; textField?: string }) => Promise<CloneResult>
      onCloneProgress: (callback: (progress: CloneProgress) => void) => () => void
      cancelClone: (profileId: string) => Promise<void>
    }
    contextMenu: {
      showIndexMenu: (indexName: string, options?: { hasCopiedIndex?: boolean }) => void
      showIndexPanelMenu: (options?: { hasCopiedIndex?: boolean }) => void
      onAction: (callback: (action: { action: string; indexName: string }) => void) => () => void
      showVectorMenu: (vectorId: string, options?: { hasCopiedVectors?: boolean }) => void
      showVectorsPanelMenu: (options?: { hasCopiedVectors?: boolean }) => void
      onVectorAction: (callback: (action: { action: string; vectorId?: string }) => void) => () => void
      showProfileMenu: (profileId: string) => void
      onProfileAction: (callback: (action: { action: string; profileId: string }) => void) => () => void
    }
    profiles: {
      getAll: () => Promise<ConnectionProfile[]>
      save: (profile: ConnectionProfile) => Promise<void>
      delete: (id: string) => Promise<void>
      getLastActive: () => Promise<string | null>
      setLastActive: (id: string | null) => Promise<void>
      getEmbeddingOverride: (profileId: string, indexName: string) => Promise<EmbeddingConfig | null>
      setEmbeddingOverride: (profileId: string, indexName: string, override: EmbeddingConfig) => Promise<void>
      clearEmbeddingOverride: (profileId: string, indexName: string) => Promise<void>
    }
    window: {
      createConnection: (profile: ConnectionProfile) => Promise<{ windowId: string }>
      getInfo: () => Promise<{ type: string; windowId?: string; profileId?: string }>
      closeCurrent: () => Promise<void>
      getProfile: (profileId: string) => Promise<ConnectionProfile>
    }
    settings: {
      getApiKeys: () => Promise<Record<string, string>>
      setApiKeys: (apiKeys: Record<string, string>) => Promise<void>
      getTheme: () => Promise<'light' | 'dark' | 'system'>
      setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>
      onThemeChange: (callback: (theme: string) => void) => () => void
      openWindow: () => Promise<void>
      onSwitchTab: (callback: (tab: string) => void) => () => void
    }
    shell: {
      openExternal: (url: string) => Promise<void>
    }
    updater: {
      checkForUpdates: () => Promise<UpdateInfo | undefined>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      onStatus: (callback: (status: UpdateStatus) => void) => () => void
    }
    menu: {
      // Index menu events
      onNewIndex: (callback: () => void) => () => void
      onDuplicateIndex: (callback: () => void) => () => void
      onRenameIndex: (callback: () => void) => () => void
      onDeleteIndex: (callback: () => void) => () => void
      onCopyIndex: (callback: () => void) => () => void
      onPasteIndex: (callback: () => void) => () => void
      // Vector menu events
      onNewVector: (callback: () => void) => () => void
      onEditVector: (callback: () => void) => () => void
      onDeleteSelected: (callback: () => void) => () => void
      onCopyVectors: (callback: () => void) => () => void
      onPasteVectors: (callback: () => void) => () => void
      onSelectAllVectors: (callback: () => void) => () => void
      onConfigureEmbedding: (callback: () => void) => () => void
      // View menu events
      onToggleLeftPanel: (callback: () => void) => () => void
      onToggleRightPanel: (callback: () => void) => () => void
      onFocusSearch: (callback: () => void) => () => void
      onClearFilters: (callback: () => void) => () => void
      // Window menu events
      onDisconnect: (callback: () => void) => () => void
      // Help menu events
      onShowShortcuts: (callback: () => void) => () => void
    }
    onRefresh: (callback: () => void) => () => void
  }

  interface Window {
    electronAPI: ElectronAPI
  }

  // Legacy aliases for backwards compatibility
  type CollectionInfo = IndexInfo
  type DocumentRecord = VectorRecord
}

export {}
