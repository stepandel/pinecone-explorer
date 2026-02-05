// Pinecone Explorer type declarations

declare global {
  type EmbeddingProviderType =
    | 'pinecone'
    | 'openai'

  /**
   * Index-level embedding configuration from Pinecone API (for integrated inference indexes)
   */
  interface IndexEmbedConfig {
    model: string                              // e.g., 'llama-text-embed-v2', 'multilingual-e5-large'
    metric?: 'cosine' | 'euclidean' | 'dotproduct'
    dimension?: number
    vectorType?: 'dense' | 'sparse'
    fieldMap?: { text: string }                // Maps record field name to text for embedding
    readParameters?: Record<string, unknown>
    writeParameters?: Record<string, unknown>
  }

  interface EmbeddingConfig {
    provider: EmbeddingProviderType
    modelName: string
    vectorType: 'dense' | 'sparse'
    dimensions?: number // For models that support variable dimensions (e.g., llama-text-embed-v2)
    apiKeyEnvVar?: string // Environment variable name for API key
    inputType?: 'query' | 'passage' // For Pinecone inference: 'query' for search, 'passage' for upsert (set at call time)
  }

  /**
   * Hybrid embedding configuration for indexes that support both dense and sparse vectors
   */
  interface HybridEmbeddingConfig {
    denseConfig: EmbeddingConfig    // Dense model (e.g., llama-text-embed-v2)
    sparseConfig: EmbeddingConfig   // Sparse model (pinecone-sparse-english-v0)
    defaultAlpha?: number           // Default alpha for queries (0.5 if not set)
  }

  type ExplorerMode = 'index' | 'assistant'

  // Assistant API Types
  type AssistantStatus = 'Initializing' | 'Ready' | 'Failed' | 'Terminating' | 'InitializationFailed'

  interface AssistantModel {
    name: string
    status: AssistantStatus
    instructions?: string
    metadata?: Record<string, string>
    host?: string
    createdAt?: string
    updatedAt?: string
  }

  interface CreateAssistantParams {
    name: string
    instructions?: string
    metadata?: Record<string, string>
    region?: 'us' | 'eu'
  }

  interface UpdateAssistantParams {
    instructions?: string
    metadata?: Record<string, string>
  }

  // Assistant File types
  type AssistantFileStatus = 'Processing' | 'Available' | 'Deleting' | 'ProcessingFailed'

  interface AssistantFile {
    id: string
    name: string
    status: AssistantFileStatus
    percentDone?: number | null
    metadata?: Record<string, string | number> | null
    signedUrl?: string | null
    errorMessage?: string | null
    createdOn?: string
    updatedOn?: string
  }

  interface ListAssistantFilesFilter {
    [key: string]: unknown
  }

  interface UploadAssistantFileParams {
    filePath: string
    metadata?: Record<string, string | number>
  }

  // Chat types for assistant streaming
  interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
  }

  interface CitationReference {
    file: {
      name: string
      id: string
      status?: string
      signedUrl?: string | null
    }
    pages?: number[]
  }

  interface Citation {
    position: number
    references: CitationReference[]
  }

  interface ChatUsage {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }

  type ChatStreamChunk =
    | { type: 'message_start'; id: string; model: string; role: 'assistant' }
    | { type: 'content'; content: string }
    | { type: 'citation'; citation: Citation | undefined }
    | { type: 'message_end'; usage?: ChatUsage; finishReason?: string }
    | { type: 'error'; error: string }

  interface ConnectionProfile {
    id: string
    name: string
    apiKey: string // Pinecone API key
    createdAt: number
    lastUsed?: number
    defaultEmbeddingConfig?: EmbeddingConfig
    embeddingOverrides?: Record<string, EmbeddingConfig>
    // Per-index hybrid embedding overrides (for indexes with dotproduct metric)
    hybridEmbeddingOverrides?: Record<string, HybridEmbeddingConfig>
    // Per-index text field overrides (metadata field containing text for embedding)
    textFieldOverrides?: Record<string, string>
    // Preferred explorer mode (index or assistant)
    preferredMode?: ExplorerMode
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
    vectorType?: 'dense' | 'sparse'            // Index vector type from API
    embed?: IndexEmbedConfig                    // Integrated inference config (if enabled)
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
    alpha?: number // Hybrid query alpha (0.0-1.0): 1.0 = pure semantic, 0.0 = pure keyword
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
    textField?: string // Metadata field to store text (default: '_text')
  }

  interface UpdateVectorParams {
    indexName: string
    namespace?: string
    id: string
    values?: number[]
    sparseValues?: { indices: number[]; values: number[] } // For hybrid indexes
    metadata?: Record<string, unknown>
    text?: string
    regenerateEmbedding?: boolean
    textField?: string // Metadata field to store text (default: '_text')
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
    textField?: string // Metadata field to store text (default: '_text')
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

  interface CloneNamespaceParams {
    indexName: string
    sourceNamespace: string
    targetNamespace: string
  }

  interface CloneNamespaceResult {
    success: boolean
    copiedVectors: number
    error?: string
  }

  interface PaginatedVectorsResult {
    vectors: VectorRecord[]
    nextCursor: string | undefined
    hasMore: boolean
  }

  interface GetVectorsPaginatedParams {
    indexName: string
    namespace?: string
    pageSize?: number
    cursor?: string
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
      getVectorsPaginated: (profileId: string, params: GetVectorsPaginatedParams) => Promise<PaginatedVectorsResult>
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
      cloneNamespace: (profileId: string, params: CloneNamespaceParams) => Promise<CloneNamespaceResult>
      onCloneNamespaceProgress: (callback: (progress: CloneProgress) => void) => () => void
      cancelCloneNamespace: (profileId: string) => Promise<void>
    }
    contextMenu: {
      showIndexMenu: (indexName: string) => void
      showIndexPanelMenu: () => void
      onAction: (callback: (action: { action: string; indexName: string }) => void) => () => void
      showVectorMenu: (vectorId: string, options?: { hasCopiedVectors?: boolean }) => void
      showVectorsPanelMenu: (options?: { hasCopiedVectors?: boolean }) => void
      onVectorAction: (callback: (action: { action: string; vectorId?: string }) => void) => () => void
      showProfileMenu: (profileId: string) => void
      onProfileAction: (callback: (action: { action: string; profileId: string }) => void) => () => void
      showNamespaceMenu: (namespace: string) => void
      onNamespaceAction: (callback: (action: { action: string; namespace: string }) => void) => () => void
      showAssistantMenu: (assistantName: string) => void
      onAssistantAction: (callback: (action: { action: string; assistantName: string }) => void) => () => void
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
      getHybridEmbeddingOverride: (profileId: string, indexName: string) => Promise<HybridEmbeddingConfig | null>
      setHybridEmbeddingOverride: (profileId: string, indexName: string, override: HybridEmbeddingConfig) => Promise<void>
      clearHybridEmbeddingOverride: (profileId: string, indexName: string) => Promise<void>
      getTextFieldOverride: (profileId: string, indexName: string) => Promise<string | null>
      setTextFieldOverride: (profileId: string, indexName: string, textField: string) => Promise<void>
      clearTextFieldOverride: (profileId: string, indexName: string) => Promise<void>
      getPreferredMode: (profileId: string) => Promise<ExplorerMode | null>
      setPreferredMode: (profileId: string, mode: ExplorerMode) => Promise<void>
    }
    assistant: {
      list: (profileId: string) => Promise<AssistantModel[]>
      create: (profileId: string, params: CreateAssistantParams) => Promise<AssistantModel>
      describe: (profileId: string, name: string) => Promise<AssistantModel>
      update: (profileId: string, name: string, params: UpdateAssistantParams) => Promise<AssistantModel>
      delete: (profileId: string, name: string) => Promise<void>
      files: {
        list: (profileId: string, assistantName: string, filter?: ListAssistantFilesFilter) => Promise<AssistantFile[]>
        describe: (profileId: string, assistantName: string, fileId: string) => Promise<AssistantFile>
        upload: (profileId: string, assistantName: string, params: UploadAssistantFileParams) => Promise<AssistantFile>
        delete: (profileId: string, assistantName: string, fileId: string) => Promise<void>
      }
      chatStream: {
        start: (profileId: string, assistantName: string, params: {
          messages: Array<{ role: 'user' | 'assistant'; content: string }>;
          model?: string;
          filter?: Record<string, unknown>;
        }) => Promise<string>
        cancel: (streamId: string) => Promise<void>
        onChunk: (callback: (streamId: string, chunk: ChatStreamChunk) => void) => () => void
      }
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
      // Namespace menu events
      onNewNamespace: (callback: () => void) => () => void
      onDuplicateNamespace: (callback: () => void) => () => void
      onDeleteNamespace: (callback: () => void) => () => void
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
      onAddFilter: (callback: () => void) => () => void
      onRemoveFilter: (callback: () => void) => () => void
      // Window menu events
      onDisconnect: (callback: () => void) => () => void
      // Help menu events
      onShowShortcuts: (callback: () => void) => () => void
      // Assistant menu events
      onNewAssistant: (callback: () => void) => () => void
      onEditAssistant: (callback: () => void) => () => void
      onDeleteAssistant: (callback: () => void) => () => void
      // Chat menu events
      onSendMessage: (callback: () => void) => () => void
      onFocusChatInput: (callback: () => void) => () => void
      onClearConversation: (callback: () => void) => () => void
    }
    onRefresh: (callback: () => void) => () => void
  }

  interface Window {
    electronAPI: ElectronAPI
  }

}

export {}
