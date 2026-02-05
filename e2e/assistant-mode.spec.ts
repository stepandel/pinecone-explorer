import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createPineconeTestProfile,
  type ElectronTestContext,
} from './electron.setup'
import {
  switchToAssistantMode,
  switchToIndexMode,
  isModeSwitcherVisible,
  getCurrentMode,
  waitForAssistantsPanel,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
})

test.afterAll(async () => {
  await cleanupTestProfiles(electronContext.page)
  await closeElectronApp(electronContext.app)
})

test.describe.serial('E2E-ASSISTANT-001: Mode Switching Tests', () => {
  test('should connect with valid API key for mode switching tests', async () => {
    const { page } = electronContext

    // Check if real API key is available
    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Create a test profile
    const profileId = await createPineconeTestProfile(
      page,
      'Mode Switching Test',
      process.env.PINECONE_API_KEY
    )

    // Connect to the profile
    await page.evaluate(async (id) => {
      const profiles = await (window as any).electronAPI.profiles.getAll()
      const profile = profiles.find((p: any) => p.id === id)
      if (profile) {
        await (window as any).electronAPI.pinecone.connect(id, profile)
      }
    }, profileId)

    // Wait for connection
    await page.waitForTimeout(2000)
  })

  test('mode switcher should be visible after connection', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const isVisible = await isModeSwitcherVisible(page)
    expect(isVisible).toBe(true)
  })

  test('should start in index mode by default', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const mode = await getCurrentMode(page)
    expect(mode).toBe('index')
  })

  test('clicking assistant mode button should switch to assistant mode', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await switchToAssistantMode(page)
    
    const mode = await getCurrentMode(page)
    expect(mode).toBe('assistant')
    
    // Verify assistants panel is visible
    await waitForAssistantsPanel(page)
  })

  test('clicking index mode button should switch back to index mode', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await switchToIndexMode(page)
    
    const mode = await getCurrentMode(page)
    expect(mode).toBe('index')
    
    // Verify indexes panel is visible instead of assistants panel
    const indexesPanel = page.locator('[data-testid="indexes-panel"]')
    await expect(indexesPanel).toBeVisible({ timeout: 5000 })
  })

  test('keyboard shortcut Cmd+1 should switch to index mode', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // First switch to assistant mode
    await switchToAssistantMode(page)
    expect(await getCurrentMode(page)).toBe('assistant')

    // Use keyboard shortcut to switch to index mode
    await page.keyboard.press('Meta+1')
    await page.waitForTimeout(500)
    
    const mode = await getCurrentMode(page)
    expect(mode).toBe('index')
  })

  test('keyboard shortcut Cmd+2 should switch to assistant mode', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Start in index mode
    await switchToIndexMode(page)
    expect(await getCurrentMode(page)).toBe('index')

    // Use keyboard shortcut to switch to assistant mode
    await page.keyboard.press('Meta+2')
    await page.waitForTimeout(500)
    
    const mode = await getCurrentMode(page)
    expect(mode).toBe('assistant')
  })

  test('mode should persist across page reload', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Switch to assistant mode
    await switchToAssistantMode(page)
    expect(await getCurrentMode(page)).toBe('assistant')

    // Reload the page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // Verify mode is still assistant
    const modeSwitcher = page.locator('[data-testid="mode-switcher"]')
    if (await modeSwitcher.isVisible()) {
      const mode = await getCurrentMode(page)
      expect(mode).toBe('assistant')
    }
  })

  test('correct panels should render per mode', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // In assistant mode
    await switchToAssistantMode(page)
    
    // Should see assistants panel
    await expect(page.locator('[data-testid="assistants-panel"]')).toBeVisible({ timeout: 5000 })
    
    // Should see files panel (may be showing empty state)
    await expect(page.locator('[data-testid="files-panel"]')).toBeVisible({ timeout: 5000 })

    // Switch to index mode
    await switchToIndexMode(page)
    
    // Should see indexes panel instead
    await expect(page.locator('[data-testid="indexes-panel"]')).toBeVisible({ timeout: 5000 })
    
    // Should see namespaces panel
    await expect(page.locator('[data-testid="namespaces-panel"]')).toBeVisible({ timeout: 5000 })
  })
})
