import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'

// Redirect userData to test directory if running in test mode
// This MUST happen before any store initialization
if (process.env.NODE_ENV === 'test' && process.env.E2E_USER_DATA_DIR) {
  app.setPath('userData', process.env.E2E_USER_DATA_DIR)
}

// Set app name before anything else (affects menu bar, about dialog, etc.)
app.name = 'Pinecone Explorer'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { pineconeConnectionPool } from './pinecone-service'
import { connectionStore } from './connection-store'
import { settingsStore, ApiKeys, Theme } from './settings-store'
import { windowManager } from './window-manager'
import { createApplicationMenu, updateThemeMenu } from './menu'
import {
  ConnectionProfile,
  QueryVectorsParams,
  CreateVectorParams,
  UpdateVectorParams,
  DeleteVectorsParams,
  BatchImportParams,
  CreateIndexParams,
  CloneIndexParams,
  CloneNamespaceParams,
  ListVectorsParams,
  FetchVectorsParams,
  EmbeddingConfig,
  HybridEmbeddingConfig,
  GetVectorsPaginatedParams,
} from './types'
import { initAutoUpdater, checkForUpdates } from './auto-updater'
import { initAnalytics, track } from './analytics'

// Inject stored API keys into process.env at startup
settingsStore.injectIntoProcessEnv()

// Track active clone operations per profile for cancellation
const activeCloneOperations: Map<string, AbortController> = new Map()
const activeNamespaceCloneOperations: Map<string, AbortController> = new Map()

/**
 * Parse Pinecone API errors and return user-friendly messages
 */
function parsePineconeError(error: unknown, context?: { cloud?: string; region?: string }): string {
  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  const cloud = context?.cloud?.toUpperCase() || ''
  const region = context?.region || ''

  // Cloud/Region/Plan related errors
  if (lowerMessage.includes('region') || lowerMessage.includes('not available') || lowerMessage.includes('not supported') || lowerMessage.includes('cloud')) {
    // Non-AWS cloud on Starter plan (GCP and Azure require Standard+)
    if (context?.cloud && context.cloud !== 'aws') {
      return `${cloud} is not available on the Starter plan. The free Starter plan only supports AWS (us-east-1 region). To use ${cloud}, upgrade to a Standard or Enterprise plan.`
    }

    // AWS but non-us-east-1 region on Starter
    if (context?.cloud === 'aws' && context?.region && context.region !== 'us-east-1') {
      return `Region "${region}" is not available on the Starter plan. The free Starter plan only supports AWS us-east-1. Upgrade to Standard or Enterprise for access to additional regions.`
    }

    // Generic region/cloud unavailability - include original message for context
    return `${message}\n\nNote: The free Starter plan only supports AWS us-east-1. Other clouds and regions require Standard or Enterprise plans. See: https://docs.pinecone.io/troubleshooting/available-cloud-regions`
  }

  // Quota/limit errors
  if (lowerMessage.includes('quota') || lowerMessage.includes('limit') || lowerMessage.includes('exceeded')) {
    return `Account limit reached. ${message}. You may need to upgrade your plan or delete unused indexes.`
  }

  // Index name errors
  if (lowerMessage.includes('index name') || lowerMessage.includes('invalid name')) {
    return `Invalid index name. Index names must be lowercase, alphanumeric, and may contain hyphens. Maximum 45 characters.`
  }

  // Already exists
  if (lowerMessage.includes('already exists')) {
    return `An index with this name already exists. Please choose a different name.`
  }

  // Authentication errors
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('api key') || lowerMessage.includes('authentication')) {
    return `Authentication failed. Please check your Pinecone API key.`
  }

  // Return original message if no specific pattern matched
  return message
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

// ============================================================================
// Pinecone IPC Handlers
// ============================================================================

ipcMain.handle('pinecone:connect', async (_event, profileId: string, profile: ConnectionProfile) => {
  try {
    await pineconeConnectionPool.connect(profileId, profile)
    track('pinecone_connected')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect to Pinecone'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:disconnect', async (_event, profileId: string) => {
  try {
    pineconeConnectionPool.disconnect(profileId)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:listIndexes', async (_event, profileId: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const indexes = await service.listIndexes()
    return { success: true, data: indexes }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch indexes'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:getIndexStats', async (_event, profileId: string, indexName: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const stats = await service.getIndexStats(indexName)
    return { success: true, data: stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch index stats'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:listVectors', async (_event, profileId: string, params: ListVectorsParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const result = await service.listVectors(params)
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:fetchVectors', async (_event, profileId: string, params: FetchVectorsParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const vectors = await service.fetchVectors(params)
    return { success: true, data: vectors }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:getAllVectors', async (_event, profileId: string, indexName: string, namespace?: string, limit?: number) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const vectors = await service.getAllVectors(indexName, namespace, limit)
    return { success: true, data: vectors }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:getVectorsPaginated', async (_event, profileId: string, params: GetVectorsPaginatedParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const result = await service.getVectorsPaginated(
      params.indexName,
      params.namespace,
      params.pageSize,
      params.cursor
    )
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:queryVectors', async (_event, profileId: string, params: QueryVectorsParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    // Check for user embedding override and hybrid config
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const hybridOverride = connectionStore.getHybridEmbeddingOverride(profileId, params.indexName)
    const result = await service.queryVectors(params, embeddingOverride || undefined, hybridOverride || undefined)
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to query vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:createVector', async (_event, profileId: string, params: CreateVectorParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    // Check for user embedding override and hybrid config (needed for embedding generation)
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const hybridOverride = connectionStore.getHybridEmbeddingOverride(profileId, params.indexName)
    await service.createVector(params, embeddingOverride || undefined, hybridOverride || undefined)
    track('vector_created')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create vector'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:updateVector', async (_event, profileId: string, params: UpdateVectorParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    // Check for user embedding override and hybrid config (needed for regeneration)
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const hybridOverride = connectionStore.getHybridEmbeddingOverride(profileId, params.indexName)
    await service.updateVector(params, embeddingOverride || undefined, hybridOverride || undefined)
    track('vector_updated')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update vector'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:deleteVectors', async (_event, profileId: string, params: DeleteVectorsParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    await service.deleteVectors(params)
    // Track vector deletion with count if specific IDs provided
    const count = params.ids?.length
    if (count !== undefined) {
      track('vectors_deleted', { count })
    } else {
      track('vectors_deleted')
    }
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:batchImport', async (_event, profileId: string, params: BatchImportParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    // Check for user embedding override and hybrid config
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const hybridOverride = connectionStore.getHybridEmbeddingOverride(profileId, params.indexName)
    const result = await service.batchImport(params, embeddingOverride || undefined, undefined, hybridOverride || undefined)
    track('vectors_imported', {
      count: result.upsertedCount,
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import vectors'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:createIndex', async (_event, profileId: string, params: CreateIndexParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    await service.createIndex(params)
    // Track index creation with generic metadata
    const spec = params.spec as { serverless?: { cloud?: string; region?: string } }
    track('index_created', {
      cloud: spec.serverless?.cloud,
      region: spec.serverless?.region,
      metric: params.metric,
      dimension: params.dimension,
    })
    return { success: true }
  } catch (error) {
    // Extract cloud/region from serverless spec for better error messages
    const spec = params.spec as { serverless?: { cloud?: string; region?: string } }
    const message = parsePineconeError(error, {
      cloud: spec.serverless?.cloud,
      region: spec.serverless?.region,
    })
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:deleteIndex', async (_event, profileId: string, indexName: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    await service.deleteIndex(indexName)
    track('index_deleted')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete index'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:cloneIndex', async (event, profileId: string, params: CloneIndexParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }

    // Create abort controller for this clone operation
    const abortController = new AbortController()
    activeCloneOperations.set(profileId, abortController)

    // Get embedding config with fallback chain:
    // 1. Target index's override (user explicitly set for the new index)
    // 2. Source index's override (copy the source's embedding config)
    // 3. Profile's default embedding config
    const embeddingOverride =
      connectionStore.getEmbeddingOverride(profileId, params.targetIndexName) ??
      connectionStore.getEmbeddingOverride(profileId, params.sourceIndexName) ??
      connectionStore.getProfile(profileId)?.defaultEmbeddingConfig ??
      null

    // Progress callback sends updates to renderer
    const onProgress = (progress: any) => {
      event.sender.send('pinecone:cloneProgress', progress)
    }

    const result = await service.cloneIndex(params, embeddingOverride, onProgress, abortController.signal)

    // Clean up abort controller
    activeCloneOperations.delete(profileId)

    // Track successful index duplication
    if (result.success) {
      track('index_duplicated', {
        vectorsCopied: result.copiedVectors
      })
    }

    return { success: result.success, data: result, error: result.error }
  } catch (error) {
    activeCloneOperations.delete(profileId)
    const message = error instanceof Error ? error.message : 'Failed to clone index'
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:cancelClone', async (_event, profileId: string) => {
  const controller = activeCloneOperations.get(profileId)
  if (controller) {
    controller.abort()
    activeCloneOperations.delete(profileId)
    return { success: true }
  }
  return { success: false, error: 'No active clone operation' }
})

ipcMain.handle('pinecone:cloneNamespace', async (event, profileId: string, params: CloneNamespaceParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }

    // Get vector count for progress tracking
    const stats = await service.getIndexStats(params.indexName)
    const namespaceStats = stats.namespaces[params.sourceNamespace]
    const totalVectors = namespaceStats?.vectorCount || 0

    // Create abort controller for this clone operation
    const abortController = new AbortController()
    const operationKey = `${profileId}:namespace`
    activeNamespaceCloneOperations.set(operationKey, abortController)

    // Send initial progress
    event.sender.send('pinecone:cloneNamespaceProgress', {
      phase: 'copying',
      totalVectors,
      processedVectors: 0,
      message: 'Starting...',
    })

    // Progress callback sends updates to renderer
    const onProgress = (processedVectors: number) => {
      event.sender.send('pinecone:cloneNamespaceProgress', {
        phase: 'copying',
        totalVectors,
        processedVectors,
        message: `Copying vectors...`,
      })
    }

    const result = await service.cloneNamespace({
      sourceIndexName: params.indexName,
      sourceNamespace: params.sourceNamespace,
      targetIndexName: params.indexName,
      targetNamespace: params.targetNamespace,
      validateDimensions: false, // Same index, no need to validate
      onProgress,
      signal: abortController.signal,
    })

    // Clean up abort controller
    activeNamespaceCloneOperations.delete(operationKey)

    if (result.success) {
      track('namespace_duplicated', {
        vectorsCopied: result.copiedVectors,
      })
      event.sender.send('pinecone:cloneNamespaceProgress', {
        phase: 'complete',
        totalVectors,
        processedVectors: result.copiedVectors,
        message: 'Clone complete',
      })
    } else if (result.error === 'Operation cancelled') {
      event.sender.send('pinecone:cloneNamespaceProgress', {
        phase: 'cancelled',
        totalVectors,
        processedVectors: result.copiedVectors,
        message: 'Clone cancelled',
      })
    } else {
      event.sender.send('pinecone:cloneNamespaceProgress', {
        phase: 'error',
        totalVectors,
        processedVectors: result.copiedVectors,
        message: result.error || 'Unknown error',
      })
    }

    return { success: result.success, data: result, error: result.error }
  } catch (error) {
    const operationKey = `${profileId}:namespace`
    activeNamespaceCloneOperations.delete(operationKey)
    const message = error instanceof Error ? error.message : 'Failed to clone namespace'
    event.sender.send('pinecone:cloneNamespaceProgress', {
      phase: 'error',
      totalVectors: 0,
      processedVectors: 0,
      message,
    })
    return { success: false, error: message }
  }
})

ipcMain.handle('pinecone:cancelCloneNamespace', async (_event, profileId: string) => {
  const operationKey = `${profileId}:namespace`
  const controller = activeNamespaceCloneOperations.get(operationKey)
  if (controller) {
    controller.abort()
    activeNamespaceCloneOperations.delete(operationKey)
    return { success: true }
  }
  return { success: false, error: 'No active namespace clone operation' }
})

// ============================================================================
// Context Menu IPC Handlers
// ============================================================================

// Index context menu
ipcMain.on('context-menu:show-index', (event, indexName: string) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Duplicate Index',
      click: () => event.sender.send('context-menu:action', { action: 'duplicate', indexName })
    },
    { type: 'separator' },
    {
      label: 'Delete Index',
      click: () => event.sender.send('context-menu:action', { action: 'delete', indexName })
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

ipcMain.on('context-menu:show-index-panel', (event) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Duplicate Index',
      enabled: false,
      click: () => {}
    },
    { type: 'separator' },
    {
      label: 'Delete Index',
      enabled: false,
      click: () => {}
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

// Vector context menu
ipcMain.on('context-menu:show-vector', (event, vectorId: string, options?: { hasCopiedVectors?: boolean }) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Copy',
      click: () => event.sender.send('context-menu:vector-action', { action: 'copy', vectorId })
    },
    {
      label: 'Paste',
      enabled: options?.hasCopiedVectors ?? false,
      click: () => event.sender.send('context-menu:vector-action', { action: 'paste', vectorId })
    },
    { type: 'separator' },
    {
      label: 'Delete',
      click: () => event.sender.send('context-menu:vector-action', { action: 'delete', vectorId })
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

ipcMain.on('context-menu:show-vectors-panel', (event, options?: { hasCopiedVectors?: boolean }) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Paste',
      enabled: options?.hasCopiedVectors ?? false,
      click: () => event.sender.send('context-menu:vector-action', { action: 'paste' })
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

// Profile context menu handler
ipcMain.on('context-menu:show-profile', (event, profileId: string) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Connect',
      click: () => event.sender.send('context-menu:profile-action', { action: 'connect', profileId })
    },
    {
      label: 'Edit',
      click: () => event.sender.send('context-menu:profile-action', { action: 'edit', profileId })
    },
    { type: 'separator' },
    {
      label: 'Delete',
      click: () => event.sender.send('context-menu:profile-action', { action: 'delete', profileId })
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

// Namespace context menu handler
ipcMain.on('context-menu:show-namespace', (event, namespace: string) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Duplicate Namespace',
      click: () => event.sender.send('context-menu:namespace-action', { action: 'duplicate', namespace })
    },
    { type: 'separator' },
    {
      label: 'Delete Namespace',
      click: () => event.sender.send('context-menu:namespace-action', { action: 'delete', namespace })
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    menu.popup({ window: win })
  }
})

// ============================================================================
// Profile Management IPC Handlers
// ============================================================================

ipcMain.handle('profiles:getAll', async () => {
  try {
    const profiles = connectionStore.getProfiles()
    return { success: true, data: profiles }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch profiles'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:save', async (_event, profile: ConnectionProfile) => {
  try {
    connectionStore.saveProfile(profile)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save profile'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:delete', async (_event, id: string) => {
  try {
    connectionStore.deleteProfile(id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete profile'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:getLastActive', async () => {
  try {
    const id = connectionStore.getLastActiveProfileId()
    return { success: true, data: id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch last active profile'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:setLastActive', async (_event, id: string | null) => {
  try {
    connectionStore.setLastActiveProfileId(id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set last active profile'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:getEmbeddingOverride', async (_event, profileId: string, indexName: string) => {
  try {
    const override = connectionStore.getEmbeddingOverride(profileId, indexName)
    return { success: true, data: override }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:setEmbeddingOverride', async (_event, profileId: string, indexName: string, override: EmbeddingConfig) => {
  try {
    connectionStore.setEmbeddingOverride(profileId, indexName, override)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:clearEmbeddingOverride', async (_event, profileId: string, indexName: string) => {
  try {
    connectionStore.clearEmbeddingOverride(profileId, indexName)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:getTextFieldOverride', async (_event, profileId: string, indexName: string) => {
  try {
    const textField = connectionStore.getTextFieldOverride(profileId, indexName)
    return { success: true, data: textField }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get text field override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:setTextFieldOverride', async (_event, profileId: string, indexName: string, textField: string) => {
  try {
    connectionStore.setTextFieldOverride(profileId, indexName, textField)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set text field override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:clearTextFieldOverride', async (_event, profileId: string, indexName: string) => {
  try {
    connectionStore.clearTextFieldOverride(profileId, indexName)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear text field override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:getHybridEmbeddingOverride', async (_event, profileId: string, indexName: string) => {
  try {
    const override = connectionStore.getHybridEmbeddingOverride(profileId, indexName)
    return { success: true, data: override }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get hybrid embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:setHybridEmbeddingOverride', async (_event, profileId: string, indexName: string, override: HybridEmbeddingConfig) => {
  try {
    connectionStore.setHybridEmbeddingOverride(profileId, indexName, override)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set hybrid embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:clearHybridEmbeddingOverride', async (_event, profileId: string, indexName: string) => {
  try {
    connectionStore.clearHybridEmbeddingOverride(profileId, indexName)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear hybrid embedding override'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:getPreferredMode', async (_event, profileId: string) => {
  try {
    const mode = connectionStore.getPreferredMode(profileId)
    return { success: true, data: mode }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get preferred mode'
    return { success: false, error: message }
  }
})

ipcMain.handle('profiles:setPreferredMode', async (_event, profileId: string, mode: 'index' | 'assistant') => {
  try {
    connectionStore.setPreferredMode(profileId, mode)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set preferred mode'
    return { success: false, error: message }
  }
})

// ============================================================================
// Assistant IPC Handlers
// ============================================================================

ipcMain.handle('assistant:list', async (_event, profileId: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const assistants = await assistantService.listAssistants()
    return { success: true, data: assistants }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list assistants'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:create', async (_event, profileId: string, params: { name: string; instructions?: string; metadata?: Record<string, string>; region?: 'us' | 'eu' }) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const assistant = await assistantService.createAssistant(params)
    return { success: true, data: assistant }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create assistant'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:describe', async (_event, profileId: string, name: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const assistant = await assistantService.describeAssistant(name)
    return { success: true, data: assistant }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to describe assistant'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:update', async (_event, profileId: string, name: string, params: { instructions?: string; metadata?: Record<string, string> }) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const assistant = await assistantService.updateAssistant(name, params)
    return { success: true, data: assistant }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update assistant'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:delete', async (_event, profileId: string, name: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    await assistantService.deleteAssistant(name)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete assistant'
    return { success: false, error: message }
  }
})

// ============================================================================
// Assistant File IPC Handlers
// ============================================================================

ipcMain.handle('assistant:files:list', async (_event, profileId: string, assistantName: string, filter?: Record<string, unknown>) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const files = await assistantService.listFiles(assistantName, filter)
    return { success: true, data: files }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list files'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:files:describe', async (_event, profileId: string, assistantName: string, fileId: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const file = await assistantService.describeFile(assistantName, fileId)
    return { success: true, data: file }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to describe file'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:files:upload', async (_event, profileId: string, assistantName: string, params: { filePath: string; metadata?: Record<string, string | number> }) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const file = await assistantService.uploadFile(assistantName, params)
    return { success: true, data: file }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload file'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:files:delete', async (_event, profileId: string, assistantName: string, fileId: string) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    await assistantService.deleteFile(assistantName, fileId)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file'
    return { success: false, error: message }
  }
})

// ============================================================================
// Assistant Chat IPC Handlers
// ============================================================================

// Track active chat streams for cancellation
const activeChatStreams: Map<string, AbortController> = new Map()

ipcMain.handle('assistant:chat', async (_event, profileId: string, assistantName: string, params: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; model?: string; filter?: Record<string, unknown> }) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    const assistantService = service.getAssistantService()
    const response = await assistantService.chat(assistantName, params)
    return { success: true, data: response }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send chat message'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:chat:stream:start', async (event, profileId: string, assistantName: string, params: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; model?: string; filter?: Record<string, unknown> }) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    
    const streamId = crypto.randomUUID()
    const abortController = new AbortController()
    activeChatStreams.set(streamId, abortController)

    const assistantService = service.getAssistantService()
    
    // Start streaming in background
    assistantService.chatStream(
      assistantName,
      params,
      (chunk) => {
        // Send chunk to renderer
        event.sender.send('assistant:chat:chunk', streamId, chunk)
      },
      abortController.signal
    ).finally(() => {
      activeChatStreams.delete(streamId)
    })

    return { success: true, data: { streamId } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start chat stream'
    return { success: false, error: message }
  }
})

ipcMain.handle('assistant:chat:stream:cancel', async (_event, streamId: string) => {
  try {
    const controller = activeChatStreams.get(streamId)
    if (controller) {
      controller.abort()
      activeChatStreams.delete(streamId)
    }
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel chat stream'
    return { success: false, error: message }
  }
})

// ============================================================================
// Window Management IPC Handlers
// ============================================================================

ipcMain.handle('window:create-connection', async (_event, profile: ConnectionProfile) => {
  try {
    const { window: win, windowId } = windowManager.createConnectionWindow(profile)
    return { success: true, data: { windowId } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create connection window'
    return { success: false, error: message }
  }
})

ipcMain.handle('window:get-info', async (event) => {
  try {
    // Get the window that made the request
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)

    if (!win) {
      return { success: false, error: 'Window not found' }
    }

    // Check if it's a connection window
    for (const { windowId, window: w, profileId } of windowManager.getAllConnectionWindows()) {
      if (w === win) {
        return {
          success: true,
          data: {
            type: 'connection',
            windowId,
            profileId,
          },
        }
      }
    }

    // Check if it's the setup window
    if (win === windowManager.getSetupWindow()) {
      return {
        success: true,
        data: {
          type: 'setup',
        },
      }
    }

    return { success: false, error: 'Window type unknown' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get window info'
    return { success: false, error: message }
  }
})

ipcMain.handle('window:close-current', async (event) => {
  try {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)

    if (!win) {
      return { success: false, error: 'Window not found' }
    }

    win.close()
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to close window'
    return { success: false, error: message }
  }
})

ipcMain.handle('window:get-profile', async (_event, profileId: string) => {
  try {
    // Try to get from cache first (for unsaved profiles)
    const cachedProfile = windowManager.getCachedProfile(profileId)
    if (cachedProfile) {
      return { success: true, data: cachedProfile }
    }

    // Fall back to saved profiles
    const profiles = connectionStore.getProfiles()
    const profile = profiles.find(p => p.id === profileId)

    if (!profile) {
      return { success: false, error: `Profile not found: ${profileId}` }
    }

    return { success: true, data: profile }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get profile'
    return { success: false, error: message }
  }
})

// ============================================================================
// Settings IPC Handlers
// ============================================================================

ipcMain.handle('settings:getApiKeys', async () => {
  try {
    const apiKeys = settingsStore.getApiKeys()
    return { success: true, data: apiKeys }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get API keys'
    return { success: false, error: message }
  }
})

ipcMain.handle('settings:setApiKeys', async (_event, apiKeys: ApiKeys) => {
  try {
    settingsStore.setApiKeys(apiKeys)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save API keys'
    return { success: false, error: message }
  }
})

ipcMain.handle('settings:getTheme', async () => {
  try {
    const theme = settingsStore.getTheme()
    return { success: true, data: theme }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get theme'
    return { success: false, error: message }
  }
})

ipcMain.handle('settings:setTheme', async (event, theme: Theme) => {
  try {
    settingsStore.setTheme(theme)
    // Broadcast theme change to all windows except the sender
    const senderWindow = BrowserWindow.fromWebContents(event.sender)
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== senderWindow) {
        win.webContents.send('settings:theme-changed', theme)
      }
    })
    // Update menu to reflect new theme selection
    updateThemeMenu()
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set theme'
    return { success: false, error: message }
  }
})

ipcMain.handle('settings:openWindow', async () => {
  try {
    windowManager.createSettingsWindow()
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open settings'
    return { success: false, error: message }
  }
})

// ============================================================================
// Shell IPC Handlers
// ============================================================================

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open URL'
    return { success: false, error: message }
  }
})

// ============================================================================
// Dialog IPC Handlers
// ============================================================================

ipcMain.handle('dialog:showOpenDialog', async (_event, options: {
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>
  filters?: Array<{ name: string; extensions: string[] }>
  title?: string
  defaultPath?: string
}) => {
  try {
    const result = await dialog.showOpenDialog({
      properties: options.properties || ['openFile'],
      filters: options.filters,
      title: options.title,
      defaultPath: options.defaultPath,
    })
    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to show dialog'
    return { success: false, error: message }
  }
})

// ============================================================================
// App Lifecycle
// ============================================================================

// Initialize analytics BEFORE app.whenReady() as required by Aptabase SDK
initAnalytics()

app.whenReady().then(() => {
  track('app_started')

  // Create application menu
  createApplicationMenu()

  // Initialize auto-updater
  initAutoUpdater()

  // Create setup window
  windowManager.createSetupWindow()

  // Check for updates after a short delay (only in production)
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates()
    }, 3000)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    track('app_closed')
    app.quit()
  }
})

app.on('before-quit', () => {
  track('app_closed')
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createSetupWindow()
  }
})
