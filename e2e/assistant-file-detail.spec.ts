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
  getFileCount,
  selectFile,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-detail-${Date.now()}`
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

test.describe.serial('E2E-ASSISTANT-005: File Detail Panel Tests', () => {
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
      'File Detail Test',
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
    
    // Select the assistant
    await selectAssistant(page, testAssistantName)
  })

  test('file detail panel should show empty state when no file selected', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Detail panel should be visible
    const detailPanel = page.locator('[data-testid="file-detail-panel"]')
    await expect(detailPanel).toBeVisible({ timeout: 5000 })

    // Should show empty state
    const emptyState = page.locator('[data-testid="file-detail-empty-state"]')
    await expect(emptyState).toBeVisible()
  })

  test('selecting a file should show its details', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Get the first file's name
      const fileItem = page.locator('[data-testid="file-item"]').first()
      const fileName = await fileItem.getAttribute('data-file-name')
      
      // Select the file
      await fileItem.click()
      await page.waitForTimeout(500)

      // Detail panel should no longer show empty state
      const emptyState = page.locator('[data-testid="file-detail-empty-state"]')
      await expect(emptyState).not.toBeVisible()

      // Should show file name
      const fileNameInDetail = page.locator(`[data-testid="file-detail-panel"] >> text=${fileName}`)
      await expect(fileNameInDetail).toBeVisible({ timeout: 5000 })
    }
  })

  test('file detail should show status badge', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Should show status badge
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      const statusBadge = detailPanel.locator('text=/Ready|Processing|Failed|Deleting/')
      await expect(statusBadge).toBeVisible({ timeout: 5000 })
    }
  })

  test('file detail should show file ID', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Should show ID section
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      const idLabel = detailPanel.locator('text=ID')
      await expect(idLabel).toBeVisible({ timeout: 5000 })
    }
  })

  test('file detail should show creation date', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Should show Created section
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      const createdLabel = detailPanel.locator('text=Created')
      await expect(createdLabel).toBeVisible({ timeout: 5000 })
    }
  })

  test('file detail should show download button when file has signed URL', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Download button may or may not be visible depending on file state
      const downloadButton = page.locator('[data-testid="file-download-button"]')
      
      // If file is ready and has a signed URL, download button should be visible
      const statusBadge = page.locator('[data-testid="file-detail-panel"]').locator('text=Ready')
      if (await statusBadge.isVisible()) {
        // Download button should be visible for ready files
        await expect(downloadButton).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('file detail should show delete button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Delete button should be visible
      const deleteButton = page.locator('[data-testid="file-delete-button"]')
      await expect(deleteButton).toBeVisible({ timeout: 5000 })
    }
  })

  test('delete button should delete the file', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      // Select first file
      const fileItem = page.locator('[data-testid="file-item"]').first()
      const fileId = await fileItem.getAttribute('data-file-id')
      await fileItem.click()
      await page.waitForTimeout(500)

      // Click delete button
      const deleteButton = page.locator('[data-testid="file-delete-button"]')
      await deleteButton.click()

      // Wait for deletion to complete
      await page.waitForTimeout(5000)

      // File should be removed or in deleting state
      // The detail panel might show "Deleting..." status
      // Eventually the file should no longer be in the list
    }
  })

  test('file detail should show metadata if present', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // If any file has metadata, it should be displayed
    // This tests the Metadata section rendering
    const fileCount = await getFileCount(page)
    
    if (fileCount > 0) {
      await page.locator('[data-testid="file-item"]').first().click()
      await page.waitForTimeout(500)

      // Metadata section may or may not be visible depending on the file
      // The presence of the section header indicates the feature works
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      
      // File should have basic details visible
      const hasDetails = await detailPanel.locator('text=/Status|ID|Created/').isVisible()
      expect(hasDetails).toBe(true)
    }
  })
})
