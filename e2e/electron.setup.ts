import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

export interface ElectronTestContext {
  app: ElectronApplication
  page: Page
}

/**
 * Get the path to the app's userData directory
 */
function getAppDataPath(): string {
  const appName = 'Pinecone Explorer'
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName)
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', appName)
  } else {
    return path.join(os.homedir(), '.config', appName.toLowerCase().replace(/ /g, '-'))
  }
}

/**
 * Clear encrypted store files to avoid encryption key mismatch issues in tests.
 * The encryption key is derived from app path, which differs between normal and test runs.
 */
function clearEncryptedStores(): void {
  const appDataPath = getAppDataPath()
  const filesToClear = [
    'encryption-key.enc',
    'pinecone-connections.json',
    'pinecone-settings.json',
    'chroma-settings-v2.json',
  ]

  for (const file of filesToClear) {
    const filePath = path.join(appDataPath, file)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log(`[E2E Setup] Cleared ${file}`)
      }
    } catch (error) {
      console.warn(`[E2E Setup] Failed to clear ${file}:`, error)
    }
  }
}

/**
 * Launch the Electron application with test environment variables
 */
export async function launchElectronApp(): Promise<ElectronTestContext> {
  // Clear encrypted stores to avoid encryption key mismatch
  clearEncryptedStores()

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const electronPath = path.join(__dirname, '../dist-electron/main.js')

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DISABLE_ANALYTICS: 'true',
  }

  const app = await electron.launch({
    args: [electronPath],
    env,
  })

  const page = await app.firstWindow()

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded')

  // Wait for setup window or main content to be visible
  try {
    await page.waitForSelector('[data-testid="setup-window"]', { timeout: 10000 })
  } catch {
    // If setup window doesn't exist, the app might already be set up
    // This is fine for subsequent tests
  }

  return { app, page }
}

/**
 * Create a Pinecone test profile programmatically via electronAPI
 * Note: Use dummy key for local testing or provide real API key for cloud testing
 */
export async function createPineconeTestProfile(
  page: Page,
  name?: string,
  apiKey?: string
): Promise<string> {
  const profileId = `test-pinecone-${Date.now()}`
  const profileName = name || `Test Pinecone ${Date.now()}`
  const pineconeKey = apiKey || process.env.PINECONE_API_KEY || 'dummy-key-for-local-testing'

  await page.evaluate(
    async ({ id, name, apiKey }) => {
      const profile = {
        id,
        name,
        provider: 'pinecone' as const,
        apiKey,
      }
      await (window as any).electronAPI.profiles.save(profile)
      return id
    },
    { id: profileId, name: profileName, apiKey: pineconeKey }
  )

  return profileId
}

/**
 * Connect to a Pinecone profile via IPC
 */
export async function connectToProfile(page: Page, profileId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const profiles = await (window as any).electronAPI.profiles.getAll()
    const profile = profiles.find((p: any) => p.id === id)
    if (!profile) {
      throw new Error(`Profile ${id} not found`)
    }
    await (window as any).electronAPI.pinecone.connect(id, profile)
  }, profileId)
  await page.waitForTimeout(1000)
}

/**
 * Clean up test profiles - delete all profiles starting with 'test-'
 */
export async function cleanupTestProfiles(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      const profiles = await (window as any).electronAPI.profiles.getAll()

      for (const profile of profiles) {
        if (profile.id.startsWith('test-')) {
          await (window as any).electronAPI.profiles.delete(profile.id)
        }
      }
    })
  } catch (error) {
    console.error('Error cleaning up test profiles:', error)
  }
}

/**
 * Close the Electron application gracefully
 */
export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
