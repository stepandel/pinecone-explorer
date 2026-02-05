import { contextBridge, ipcRenderer } from 'electron'
import {
  ConnectionProfile,
  IndexInfo,
  IndexStats,
  VectorRecord,
  QueryVectorsParams,
  QueryResult,
  CreateVectorParams,
  UpdateVectorParams,
  DeleteVectorsParams,
  BatchImportParams,
  BatchImportResult,
  CreateIndexParams,
  CloneIndexParams,
  CloneNamespaceParams,
  CloneProgress,
  CloneResult,
  ListVectorsParams,
  ListVectorsResult,
  FetchVectorsParams,
  EmbeddingConfig,
  HybridEmbeddingConfig,
  GetVectorsPaginatedParams,
  PaginatedVectorsResult,
  AssistantModel,
  CreateAssistantParams,
  UpdateAssistantParams,
  AssistantFile,
  ListAssistantFilesFilter,
  UploadAssistantFileParams,
} from './types'

console.log('Preload script is running!')

contextBridge.exposeInMainWorld('electronAPI', {
  pinecone: {
    connect: async (profileId: string, profile: ConnectionProfile): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:connect', profileId, profile)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    disconnect: async (profileId: string): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:disconnect', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    listIndexes: async (profileId: string): Promise<IndexInfo[]> => {
      const result = await ipcRenderer.invoke('pinecone:listIndexes', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    getIndexStats: async (profileId: string, indexName: string): Promise<IndexStats> => {
      const result = await ipcRenderer.invoke('pinecone:getIndexStats', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    listVectors: async (profileId: string, params: ListVectorsParams): Promise<ListVectorsResult> => {
      const result = await ipcRenderer.invoke('pinecone:listVectors', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    fetchVectors: async (profileId: string, params: FetchVectorsParams): Promise<VectorRecord[]> => {
      const result = await ipcRenderer.invoke('pinecone:fetchVectors', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    getAllVectors: async (profileId: string, indexName: string, namespace?: string, limit?: number): Promise<VectorRecord[]> => {
      const result = await ipcRenderer.invoke('pinecone:getAllVectors', profileId, indexName, namespace, limit)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    getVectorsPaginated: async (profileId: string, params: GetVectorsPaginatedParams): Promise<PaginatedVectorsResult> => {
      const result = await ipcRenderer.invoke('pinecone:getVectorsPaginated', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    queryVectors: async (profileId: string, params: QueryVectorsParams): Promise<QueryResult> => {
      const result = await ipcRenderer.invoke('pinecone:queryVectors', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    createVector: async (profileId: string, params: CreateVectorParams): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:createVector', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    updateVector: async (profileId: string, params: UpdateVectorParams): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:updateVector', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    deleteVectors: async (profileId: string, params: DeleteVectorsParams): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:deleteVectors', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    batchImport: async (profileId: string, params: BatchImportParams): Promise<BatchImportResult> => {
      const result = await ipcRenderer.invoke('pinecone:batchImport', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    createIndex: async (profileId: string, params: CreateIndexParams): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:createIndex', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    deleteIndex: async (profileId: string, indexName: string): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:deleteIndex', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    cloneIndex: async (profileId: string, params: CloneIndexParams): Promise<CloneResult> => {
      const result = await ipcRenderer.invoke('pinecone:cloneIndex', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    onCloneProgress: (callback: (progress: CloneProgress) => void): (() => void) => {
      const handler = (_event: any, progress: CloneProgress) => callback(progress)
      ipcRenderer.on('pinecone:cloneProgress', handler)
      return () => ipcRenderer.removeListener('pinecone:cloneProgress', handler)
    },
    cancelClone: async (profileId: string): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:cancelClone', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    cloneNamespace: async (profileId: string, params: CloneNamespaceParams): Promise<{ success: boolean; copiedVectors: number; error?: string }> => {
      const result = await ipcRenderer.invoke('pinecone:cloneNamespace', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    onCloneNamespaceProgress: (callback: (progress: CloneProgress) => void): (() => void) => {
      const handler = (_event: any, progress: CloneProgress) => callback(progress)
      ipcRenderer.on('pinecone:cloneNamespaceProgress', handler)
      return () => ipcRenderer.removeListener('pinecone:cloneNamespaceProgress', handler)
    },
    cancelCloneNamespace: async (profileId: string): Promise<void> => {
      const result = await ipcRenderer.invoke('pinecone:cancelCloneNamespace', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
  },
  contextMenu: {
    showIndexMenu: (indexName: string): void => {
      ipcRenderer.send('context-menu:show-index', indexName)
    },
    showIndexPanelMenu: (): void => {
      ipcRenderer.send('context-menu:show-index-panel')
    },
    onAction: (callback: (action: { action: string; indexName?: string }) => void): (() => void) => {
      const handler = (_event: any, data: { action: string; indexName?: string }) => callback(data)
      ipcRenderer.on('context-menu:action', handler)
      return () => ipcRenderer.removeListener('context-menu:action', handler)
    },
    showVectorMenu: (vectorId: string, options?: { hasCopiedVectors?: boolean }): void => {
      ipcRenderer.send('context-menu:show-vector', vectorId, options)
    },
    showVectorsPanelMenu: (options?: { hasCopiedVectors?: boolean }): void => {
      ipcRenderer.send('context-menu:show-vectors-panel', options)
    },
    onVectorAction: (callback: (action: { action: string; vectorId?: string }) => void): (() => void) => {
      const handler = (_event: any, data: { action: string; vectorId?: string }) => callback(data)
      ipcRenderer.on('context-menu:vector-action', handler)
      return () => ipcRenderer.removeListener('context-menu:vector-action', handler)
    },
    showProfileMenu: (profileId: string): void => {
      ipcRenderer.send('context-menu:show-profile', profileId)
    },
    onProfileAction: (callback: (action: { action: string; profileId: string }) => void): (() => void) => {
      const handler = (_event: any, data: { action: string; profileId: string }) => callback(data)
      ipcRenderer.on('context-menu:profile-action', handler)
      return () => ipcRenderer.removeListener('context-menu:profile-action', handler)
    },
    showNamespaceMenu: (namespace: string): void => {
      ipcRenderer.send('context-menu:show-namespace', namespace)
    },
    onNamespaceAction: (callback: (action: { action: string; namespace: string }) => void): (() => void) => {
      const handler = (_event: any, data: { action: string; namespace: string }) => callback(data)
      ipcRenderer.on('context-menu:namespace-action', handler)
      return () => ipcRenderer.removeListener('context-menu:namespace-action', handler)
    },
  },
  profiles: {
    getAll: async (): Promise<ConnectionProfile[]> => {
      const result = await ipcRenderer.invoke('profiles:getAll')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    save: async (profile: ConnectionProfile): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:save', profile)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    delete: async (id: string): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:delete', id)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getLastActive: async (): Promise<string | null> => {
      const result = await ipcRenderer.invoke('profiles:getLastActive')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setLastActive: async (id: string | null): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:setLastActive', id)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getEmbeddingOverride: async (profileId: string, indexName: string): Promise<EmbeddingConfig | null> => {
      const result = await ipcRenderer.invoke('profiles:getEmbeddingOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setEmbeddingOverride: async (profileId: string, indexName: string, override: EmbeddingConfig): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:setEmbeddingOverride', profileId, indexName, override)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    clearEmbeddingOverride: async (profileId: string, indexName: string): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:clearEmbeddingOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getTextFieldOverride: async (profileId: string, indexName: string): Promise<string | null> => {
      const result = await ipcRenderer.invoke('profiles:getTextFieldOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setTextFieldOverride: async (profileId: string, indexName: string, textField: string): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:setTextFieldOverride', profileId, indexName, textField)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    clearTextFieldOverride: async (profileId: string, indexName: string): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:clearTextFieldOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getHybridEmbeddingOverride: async (profileId: string, indexName: string): Promise<HybridEmbeddingConfig | null> => {
      const result = await ipcRenderer.invoke('profiles:getHybridEmbeddingOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setHybridEmbeddingOverride: async (profileId: string, indexName: string, override: HybridEmbeddingConfig): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:setHybridEmbeddingOverride', profileId, indexName, override)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    clearHybridEmbeddingOverride: async (profileId: string, indexName: string): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:clearHybridEmbeddingOverride', profileId, indexName)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getPreferredMode: async (profileId: string): Promise<'index' | 'assistant' | null> => {
      const result = await ipcRenderer.invoke('profiles:getPreferredMode', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setPreferredMode: async (profileId: string, mode: 'index' | 'assistant'): Promise<void> => {
      const result = await ipcRenderer.invoke('profiles:setPreferredMode', profileId, mode)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
  },
  assistant: {
    list: async (profileId: string): Promise<AssistantModel[]> => {
      const result = await ipcRenderer.invoke('assistant:list', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    create: async (profileId: string, params: CreateAssistantParams): Promise<AssistantModel> => {
      const result = await ipcRenderer.invoke('assistant:create', profileId, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    describe: async (profileId: string, name: string): Promise<AssistantModel> => {
      const result = await ipcRenderer.invoke('assistant:describe', profileId, name)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    update: async (profileId: string, name: string, params: UpdateAssistantParams): Promise<AssistantModel> => {
      const result = await ipcRenderer.invoke('assistant:update', profileId, name, params)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    delete: async (profileId: string, name: string): Promise<void> => {
      const result = await ipcRenderer.invoke('assistant:delete', profileId, name)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    // File operations
    files: {
      list: async (profileId: string, assistantName: string, filter?: ListAssistantFilesFilter): Promise<AssistantFile[]> => {
        const result = await ipcRenderer.invoke('assistant:files:list', profileId, assistantName, filter)
        if (!result.success) {
          throw new Error(result.error)
        }
        return result.data
      },
      describe: async (profileId: string, assistantName: string, fileId: string): Promise<AssistantFile> => {
        const result = await ipcRenderer.invoke('assistant:files:describe', profileId, assistantName, fileId)
        if (!result.success) {
          throw new Error(result.error)
        }
        return result.data
      },
      upload: async (profileId: string, assistantName: string, params: UploadAssistantFileParams): Promise<AssistantFile> => {
        const result = await ipcRenderer.invoke('assistant:files:upload', profileId, assistantName, params)
        if (!result.success) {
          throw new Error(result.error)
        }
        return result.data
      },
      delete: async (profileId: string, assistantName: string, fileId: string): Promise<void> => {
        const result = await ipcRenderer.invoke('assistant:files:delete', profileId, assistantName, fileId)
        if (!result.success) {
          throw new Error(result.error)
        }
      },
    },
  },
  window: {
    createConnection: async (profile: ConnectionProfile): Promise<{ windowId: string }> => {
      const result = await ipcRenderer.invoke('window:create-connection', profile)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    getInfo: async (): Promise<{ type: string; windowId?: string; profileId?: string }> => {
      const result = await ipcRenderer.invoke('window:get-info')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    closeCurrent: async (): Promise<void> => {
      const result = await ipcRenderer.invoke('window:close-current')
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getProfile: async (profileId: string): Promise<ConnectionProfile> => {
      const result = await ipcRenderer.invoke('window:get-profile', profileId)
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
  },
  settings: {
    getApiKeys: async (): Promise<Record<string, string>> => {
      const result = await ipcRenderer.invoke('settings:getApiKeys')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setApiKeys: async (apiKeys: Record<string, string>): Promise<void> => {
      const result = await ipcRenderer.invoke('settings:setApiKeys', apiKeys)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    getTheme: async (): Promise<'light' | 'dark' | 'system'> => {
      const result = await ipcRenderer.invoke('settings:getTheme')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    setTheme: async (theme: 'light' | 'dark' | 'system'): Promise<void> => {
      const result = await ipcRenderer.invoke('settings:setTheme', theme)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    onThemeChange: (callback: (theme: string) => void): (() => void) => {
      const handler = (_event: any, theme: string) => callback(theme)
      ipcRenderer.on('settings:theme-changed', handler)
      return () => ipcRenderer.removeListener('settings:theme-changed', handler)
    },
    openWindow: async (): Promise<void> => {
      const result = await ipcRenderer.invoke('settings:openWindow')
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    onSwitchTab: (callback: (tab: string) => void): (() => void) => {
      const handler = (_event: any, tab: string) => callback(tab)
      ipcRenderer.on('settings:switch-tab', handler)
      return () => ipcRenderer.removeListener('settings:switch-tab', handler)
    },
  },
  shell: {
    openExternal: async (url: string): Promise<void> => {
      const result = await ipcRenderer.invoke('shell:openExternal', url)
      if (!result.success) {
        throw new Error(result.error)
      }
    },
  },
  updater: {
    checkForUpdates: async (): Promise<any> => {
      const result = await ipcRenderer.invoke('updater:check')
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    downloadUpdate: async (): Promise<void> => {
      const result = await ipcRenderer.invoke('updater:download')
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    installUpdate: async (): Promise<void> => {
      const result = await ipcRenderer.invoke('updater:install')
      if (!result.success) {
        throw new Error(result.error)
      }
    },
    onStatus: (callback: (status: any) => void): (() => void) => {
      const handler = (_event: any, status: any) => callback(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },
  menu: {
    // Index menu events
    onNewIndex: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:new-index', handler)
      return () => ipcRenderer.removeListener('menu:new-index', handler)
    },
    onDuplicateIndex: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:duplicate-index', handler)
      return () => ipcRenderer.removeListener('menu:duplicate-index', handler)
    },
    onRenameIndex: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:rename-index', handler)
      return () => ipcRenderer.removeListener('menu:rename-index', handler)
    },
    onDeleteIndex: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:delete-index', handler)
      return () => ipcRenderer.removeListener('menu:delete-index', handler)
    },
    // Namespace menu events
    onNewNamespace: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:new-namespace', handler)
      return () => ipcRenderer.removeListener('menu:new-namespace', handler)
    },
    onDuplicateNamespace: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:duplicate-namespace', handler)
      return () => ipcRenderer.removeListener('menu:duplicate-namespace', handler)
    },
    onDeleteNamespace: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:delete-namespace', handler)
      return () => ipcRenderer.removeListener('menu:delete-namespace', handler)
    },
    // Vector menu events
    onNewVector: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:new-vector', handler)
      return () => ipcRenderer.removeListener('menu:new-vector', handler)
    },
    onEditVector: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:edit-vector', handler)
      return () => ipcRenderer.removeListener('menu:edit-vector', handler)
    },
    onDeleteSelected: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:delete-selected', handler)
      return () => ipcRenderer.removeListener('menu:delete-selected', handler)
    },
    onCopyVectors: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:copy-vectors', handler)
      return () => ipcRenderer.removeListener('menu:copy-vectors', handler)
    },
    onPasteVectors: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:paste-vectors', handler)
      return () => ipcRenderer.removeListener('menu:paste-vectors', handler)
    },
    onSelectAllVectors: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:select-all-vectors', handler)
      return () => ipcRenderer.removeListener('menu:select-all-vectors', handler)
    },
    onConfigureEmbedding: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:configure-embedding', handler)
      return () => ipcRenderer.removeListener('menu:configure-embedding', handler)
    },
    // View menu events
    onToggleLeftPanel: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:toggle-left-panel', handler)
      return () => ipcRenderer.removeListener('menu:toggle-left-panel', handler)
    },
    onToggleRightPanel: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:toggle-right-panel', handler)
      return () => ipcRenderer.removeListener('menu:toggle-right-panel', handler)
    },
    onFocusSearch: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:focus-search', handler)
      return () => ipcRenderer.removeListener('menu:focus-search', handler)
    },
    onClearFilters: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:clear-filters', handler)
      return () => ipcRenderer.removeListener('menu:clear-filters', handler)
    },
    onAddFilter: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:add-filter', handler)
      return () => ipcRenderer.removeListener('menu:add-filter', handler)
    },
    onRemoveFilter: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:remove-filter', handler)
      return () => ipcRenderer.removeListener('menu:remove-filter', handler)
    },
    // Window menu events
    onDisconnect: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:disconnect', handler)
      return () => ipcRenderer.removeListener('menu:disconnect', handler)
    },
    // Help menu events
    onShowShortcuts: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:show-shortcuts', handler)
      return () => ipcRenderer.removeListener('menu:show-shortcuts', handler)
    },
    // Assistant menu events
    onNewAssistant: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:new-assistant', handler)
      return () => ipcRenderer.removeListener('menu:new-assistant', handler)
    },
    onEditAssistant: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:edit-assistant', handler)
      return () => ipcRenderer.removeListener('menu:edit-assistant', handler)
    },
    onDeleteAssistant: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:delete-assistant', handler)
      return () => ipcRenderer.removeListener('menu:delete-assistant', handler)
    },
    // Chat menu events
    onSendMessage: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:send-message', handler)
      return () => ipcRenderer.removeListener('menu:send-message', handler)
    },
    onFocusChatInput: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:focus-chat-input', handler)
      return () => ipcRenderer.removeListener('menu:focus-chat-input', handler)
    },
    onClearConversation: (callback: () => void): (() => void) => {
      const handler = () => callback()
      ipcRenderer.on('menu:clear-conversation', handler)
      return () => ipcRenderer.removeListener('menu:clear-conversation', handler)
    },
  },
  onRefresh: (callback: () => void): (() => void) => {
    const handler = () => {
      console.log('Preload received app:refresh event')
      callback()
    }
    ipcRenderer.on('app:refresh', handler)
    return () => ipcRenderer.removeListener('app:refresh', handler)
  },
})

// Auto-dispatch window event when app:refresh IPC is received
ipcRenderer.on('app:refresh', () => {
  console.log('Preload: app:refresh received, dispatching pinecone:refresh window event')
  window.dispatchEvent(new CustomEvent('pinecone:refresh'))
})

console.log('Preload script finished, electronAPI exposed:', typeof window !== 'undefined' ? !!(window as any).electronAPI : 'window not defined')
