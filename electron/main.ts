import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'

// Set app name before anything else (affects menu bar, about dialog, etc.)
app.name = 'Pinecone Explorer'
import path from 'node:path'
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
  ListVectorsParams,
  FetchVectorsParams,
  EmbeddingConfig,
} from './types'
import { initAutoUpdater, checkForUpdates } from './auto-updater'

// Inject stored API keys into process.env at startup
settingsStore.injectIntoProcessEnv()

// Track active clone operations per profile for cancellation
const activeCloneOperations: Map<string, AbortController> = new Map()

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

ipcMain.handle('pinecone:queryVectors', async (_event, profileId: string, params: QueryVectorsParams) => {
  try {
    const service = pineconeConnectionPool.getConnection(profileId)
    if (!service) {
      return { success: false, error: 'Not connected to Pinecone' }
    }
    // Check for user embedding override
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const result = await service.queryVectors(params, embeddingOverride || undefined)
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
    // Check for user embedding override (needed for embedding generation)
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    await service.createVector(params, embeddingOverride || undefined)
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
    // Check for user embedding override (needed for regeneration)
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    await service.updateVector(params, embeddingOverride || undefined)
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
    // Check for user embedding override
    const embeddingOverride = connectionStore.getEmbeddingOverride(profileId, params.indexName)
    const result = await service.batchImport(params, embeddingOverride || undefined)
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

// ============================================================================
// Context Menu IPC Handlers
// ============================================================================

// Index context menu (replacing collection menu)
ipcMain.on('context-menu:show-index', (event, indexName: string, options?: { hasCopiedIndex?: boolean }) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Copy Index',
      click: () => event.sender.send('context-menu:action', { action: 'copy', indexName })
    },
    {
      label: 'Paste Index',
      enabled: options?.hasCopiedIndex ?? false,
      click: () => event.sender.send('context-menu:action', { action: 'paste', indexName })
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

ipcMain.on('context-menu:show-index-panel', (event, options?: { hasCopiedIndex?: boolean }) => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Copy Index',
      enabled: false,
      click: () => {}
    },
    {
      label: 'Paste Index',
      enabled: options?.hasCopiedIndex ?? false,
      click: () => event.sender.send('context-menu:action', { action: 'paste', indexName: '' })
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

// Vector context menu (replacing document menu)
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
// App Lifecycle
// ============================================================================

app.whenReady().then(() => {
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
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createSetupWindow()
  }
})
