import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

export interface ElectronTestContext {
  app: ElectronApplication
  page: Page
}

/**
 * Launch the Electron application with test environment variables
 */
export async function launchElectronApp(): Promise<ElectronTestContext> {
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
