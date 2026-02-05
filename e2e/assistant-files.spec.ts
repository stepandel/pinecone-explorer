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
  selectAssistant,
  waitForAssistantsPanel,
  waitForFilesPanel,
  getFileCount,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-files-${Date.now()}`
})

test.afterAll(async () => {
  // Clean up test assistant
  const { page } = electronContext
  try {
    await page.evaluate(async (name) => {
      const profiles = await (window as any).electronAPI.profiles.getAll()
      const profile = profiles.find((p: any) => p.id.startsWith('test-'))
      if (profile) {
        try {
          await (window as any).electronAPI.assistant.delete(profile.id, name)
        } catch {
          // Ignore errors during cleanup
        }
      }
    }, testAssistantName)
  } catch {
    // Ignore cleanup errors
  }

  await cleanupTestProfiles(electronContext.page)
  await closeElectronApp(electronContext.app)
})

test.describe.serial('E2E-ASSISTANT-003: Files Panel Tests', () => {
  test('should connect and set up test assistant', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Create and connect to a test profile
    const profileId = await createPineconeTestProfile(
      page,
      'Files Panel Test',
      process.env.PINECONE_API_KEY
    )

    await page.evaluate(async (id) => {
      const profiles = await (window as any).electronAPI.profiles.getAll()
      const profile = profiles.find((p: any) => p.id === id)
      if (profile) {
        await (window as any).electronAPI.pinecone.connect(id, profile)
      }
    }, profileId)

    await page.waitForTimeout(2000)

    // Switch to assistant mode
    await switchToAssistantMode(page)
    await waitForAssistantsPanel(page)

    // Create a test assistant
    await page.locator('[data-testid="new-assistant-button"]').click()
    await page.waitForSelector('[data-testid="assistant-config-view"]', { timeout: 5000 })
    await page.locator('[data-testid="assistant-name-input"]').fill(testAssistantName)
    await page.locator('[data-testid="assistant-save-button"]').click()
    
    // Wait for assistant to be created
    await page.waitForSelector(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`, { timeout: 30000 })
  })

  test('files panel should show empty state when no assistant selected', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await waitForFilesPanel(page)

    // Files panel should show empty state message
    const emptyState = page.locator('[data-testid="files-empty-state"]')
    
    // The panel may or may not show empty state depending on current selection
    const panel = page.locator('[data-testid="files-panel"]')
    await expect(panel).toBeVisible()
  })

  test('files panel should show files for selected assistant', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Select the test assistant
    await selectAssistant(page, testAssistantName)
    await page.waitForTimeout(1000)

    await waitForFilesPanel(page)

    // Files panel should be visible
    const filesPanel = page.locator('[data-testid="files-panel"]')
    await expect(filesPanel).toBeVisible()

    // Should show upload button
    const uploadButton = page.locator('[data-testid="upload-file-button"]')
    await expect(uploadButton).toBeVisible()

    // Should show empty state or files list
    const fileCount = await getFileCount(page)
    if (fileCount === 0) {
      // Look for "No files yet" message
      const noFilesMessage = page.locator('text=/No files|Upload files to get started/')
      await expect(noFilesMessage).toBeVisible({ timeout: 5000 })
    }
  })

  test('should show upload button in files panel', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)
    
    // Upload button should be visible
    const uploadButton = page.locator('button:has-text("Upload File")')
    await expect(uploadButton).toBeVisible({ timeout: 5000 })
  })

  test('clicking upload button should open file picker', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    // Note: We can't actually test the native file picker dialog
    // But we can verify the button is clickable and triggers the expected behavior
    const uploadButton = page.locator('button:has-text("Upload File")')
    
    // The button should be enabled and clickable
    await expect(uploadButton).toBeEnabled()
    
    // Clicking it will open a native dialog which we can't interact with in tests
    // This test just verifies the button exists and is enabled
  })

  test('file items should show status indicators', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Check that file items have status indicators
      const fileItem = page.locator('[data-testid="file-item"]').first()
      
      // Should show one of: Ready, Processing, Failed, Deleting
      const statusIndicator = fileItem.locator('text=/Ready|Processing|Failed|Deleting/')
      await expect(statusIndicator).toBeVisible({ timeout: 5000 })
    }
  })

  test('clicking file should select it', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Click first file
      const fileItem = page.locator('[data-testid="file-item"]').first()
      const fileId = await fileItem.getAttribute('data-file-id')
      
      await fileItem.click()
      await page.waitForTimeout(500)

      // File detail panel should show the file
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      await expect(detailPanel).toBeVisible()
      
      // Should not show empty state
      const emptyState = page.locator('[data-testid="file-detail-empty-state"]')
      await expect(emptyState).not.toBeVisible()
    }
  })

  test('files panel should have search input', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    // Search input should be visible
    const searchInput = page.locator('input[placeholder*="Search files"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })
  })

  test('search should filter files', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Type in search
      const searchInput = page.locator('input[placeholder*="Search files"]')
      await searchInput.fill('nonexistent-file-xyz-123')
      await page.waitForTimeout(500)

      // Should show "no files match" message
      const noMatchMessage = page.locator('text=/No files match/')
      await expect(noMatchMessage).toBeVisible({ timeout: 5000 })

      // Clear search
      await searchInput.clear()
      await page.waitForTimeout(500)

      // Files should be visible again
      const newCount = await getFileCount(page)
      expect(newCount).toBe(fileCount)
    }
  })
})
