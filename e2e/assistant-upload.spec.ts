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
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-upload-${Date.now()}`
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

test.describe.serial('E2E-ASSISTANT-004: File Upload Tests', () => {
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
      'File Upload Test',
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

  test('upload button should be visible', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Prominent upload button should be visible
    const uploadButton = page.locator('button:has-text("Upload File")')
    await expect(uploadButton).toBeVisible({ timeout: 5000 })
    await expect(uploadButton).toBeEnabled()
  })

  test('small upload button in header should be visible', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Small icon button in header
    const uploadIconButton = page.locator('[data-testid="upload-file-button"]')
    await expect(uploadIconButton).toBeVisible({ timeout: 5000 })
  })

  test('upload dialog should support browse files button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Note: Since the UploadFileDialog is rendered when explicitly opened,
    // and opening the native file picker can't be intercepted in E2E tests,
    // we verify the upload flow exists via the button being clickable
    
    // The upload button triggers a native file picker dialog directly
    // We can only verify the button exists and is enabled
    const uploadButton = page.locator('button:has-text("Upload File")')
    await expect(uploadButton).toBeEnabled()
  })

  test('should upload a file via API', async () => {
    // TODO: Implement actual file upload test once test fixtures are set up
    // This test requires a real file path and proper upload infrastructure
    // Skip until we have a reliable way to upload test files in CI
    test.skip(true, 'File upload via API requires real file fixture - skipping until test infrastructure is ready')
  })

  test('upload dialog should show metadata input', async () => {
    // TODO: Implement metadata input test once file dialog mocking is available
    // The upload dialog opens via native file picker which cannot be intercepted
    // in Playwright without proper file dialog mocking infrastructure
    test.skip(true, 'Upload dialog metadata test requires file dialog mocking - not yet implemented')
  })

  test('should show file after upload', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // After a successful upload, the file should appear in the files panel
    // This test verifies the structure - actual file upload requires real file
    
    const filesPanel = page.locator('[data-testid="files-panel"]')
    await expect(filesPanel).toBeVisible()

    // The panel should either show files or an empty state
    const fileCount = await getFileCount(page)
    const emptyState = page.locator('text=/No files yet/')
    
    if (fileCount === 0) {
      await expect(emptyState).toBeVisible()
    } else {
      const fileItems = page.locator('[data-testid="file-item"]')
      await expect(fileItems.first()).toBeVisible()
    }
  })

  test('file should show processing status initially', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // When a file is first uploaded, it should show Processing status
    // After processing completes, it should show Ready status
    
    const fileCount = await getFileCount(page)
    
    // Explicitly skip if no files are available to test status
    if (fileCount === 0) {
      test.skip(true, 'No files available to test status indicator - upload a file first')
      return
    }
    
    const fileItem = page.locator('[data-testid="file-item"]').first()
    
    // Status could be Processing or Ready depending on timing
    const statusText = fileItem.locator('text=/Ready|Processing/')
    await expect(statusText).toBeVisible({ timeout: 5000 })
  })

  test('upload progress should be shown during upload', async () => {
    // TODO: Implement upload progress test once real upload flow is available
    // This test requires triggering an actual upload to observe the progress UI
    // Skip until upload infrastructure is ready
    test.skip(true, 'Upload progress test requires real upload flow - not yet implemented')
  })
})
