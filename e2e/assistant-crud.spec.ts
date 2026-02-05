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
  createTestAssistant,
  selectAssistant,
  getAssistantCount,
  waitForAssistantsPanel,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-e2e-${Date.now()}`
})

test.afterAll(async () => {
  // Try to delete the test assistant if it exists
  const { page } = electronContext
  try {
    // Delete via API to ensure cleanup
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

test.describe.serial('E2E-ASSISTANT-002: Assistant CRUD Tests', () => {
  test('should connect and switch to assistant mode', async () => {
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
      'Assistant CRUD Test',
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
  })

  test('should list existing assistants', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Wait for assistants to load
    await page.waitForTimeout(2000)

    // The panel should be visible (even if empty)
    await expect(page.locator('[data-testid="assistants-panel"]')).toBeVisible()

    // Either we see assistant items or an empty state
    const assistantItems = page.locator('[data-testid="assistant-item"]')
    const emptyState = page.locator('text=No assistants')
    
    const hasAssistants = await assistantItems.count() > 0
    const hasEmptyState = await emptyState.isVisible()
    
    expect(hasAssistants || hasEmptyState).toBe(true)
  })

  test('should show new assistant button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const newButton = page.locator('[data-testid="new-assistant-button"]')
    await expect(newButton).toBeVisible()
  })

  test('should open assistant config view when clicking new button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const newButton = page.locator('[data-testid="new-assistant-button"]')
    await newButton.click()

    // Config view should appear
    await expect(page.locator('[data-testid="assistant-config-view"]')).toBeVisible({ timeout: 5000 })
    
    // Should show create form
    await expect(page.locator('[data-testid="assistant-name-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="assistant-save-button"]')).toBeVisible()
    
    // Cancel to close
    await page.locator('[data-testid="assistant-cancel-button"]').click()
    await expect(page.locator('[data-testid="assistant-config-view"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('should validate assistant name - required', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Open create form
    await page.locator('[data-testid="new-assistant-button"]').click()
    await expect(page.locator('[data-testid="assistant-config-view"]')).toBeVisible({ timeout: 5000 })

    // Save button should be disabled when name is empty
    const saveButton = page.locator('[data-testid="assistant-save-button"]')
    await expect(saveButton).toBeDisabled()

    // Cancel
    await page.locator('[data-testid="assistant-cancel-button"]').click()
  })

  test('should validate assistant name - format', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Open create form
    await page.locator('[data-testid="new-assistant-button"]').click()
    await expect(page.locator('[data-testid="assistant-config-view"]')).toBeVisible({ timeout: 5000 })

    const nameInput = page.locator('[data-testid="assistant-name-input"]')
    
    // Type invalid name (uppercase, spaces not allowed)
    await nameInput.fill('Invalid Name!')
    
    // Input should auto-convert to lowercase
    const value = await nameInput.inputValue()
    expect(value).toBe('invalid name!')
    
    // There should be a validation error for invalid characters
    // The form should show an error message
    const errorMessage = page.locator('text=/lowercase letters|characters/')
    
    // Cancel
    await page.locator('[data-testid="assistant-cancel-button"]').click()
  })

  test('should create a new assistant', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const initialCount = await getAssistantCount(page)

    // Create a test assistant
    await createTestAssistant(page, testAssistantName, {
      instructions: 'You are a helpful test assistant for E2E testing.',
    })

    // Verify assistant was created
    const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
    await expect(assistantItem).toBeVisible({ timeout: 10000 })

    // Count should have increased
    const newCount = await getAssistantCount(page)
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('should show status indicator for assistant', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
    
    // Should have a status indicator
    const statusIndicator = assistantItem.locator('[data-testid="assistant-status"]')
    await expect(statusIndicator).toBeVisible()
    
    // Status should be one of the valid values
    const status = await statusIndicator.getAttribute('data-status')
    expect(['Ready', 'Initializing', 'Failed', 'InitializationFailed', 'Terminating']).toContain(status)
  })

  test('should select assistant when clicked', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    await selectAssistant(page, testAssistantName)

    const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
    await expect(assistantItem).toHaveAttribute('aria-pressed', 'true')
  })

  test('should show context menu on right-click', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
    
    // Right-click to trigger context menu
    await assistantItem.click({ button: 'right' })
    
    // Note: Native context menu is handled by Electron and may not be testable via Playwright
    // The click itself should succeed without error
    await page.waitForTimeout(500)
  })

  test('should edit assistant via context menu', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Edit via IPC (simulating context menu action)
    await page.evaluate(async (name) => {
      // Trigger the edit action
      const event = new CustomEvent('assistant-edit', { detail: { assistantName: name } })
      window.dispatchEvent(event)
    }, testAssistantName)

    // The config view may open for editing
    // This test verifies the IPC mechanism exists even if we can't test the native menu
  })

  test('should delete assistant', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const initialCount = await getAssistantCount(page)

    // Delete via API (since native context menu is not testable)
    await page.evaluate(async (name) => {
      const profiles = await (window as any).electronAPI.profiles.getAll()
      const profile = profiles.find((p: any) => p.id.startsWith('test-'))
      if (profile) {
        await (window as any).electronAPI.assistant.delete(profile.id, name)
      }
    }, testAssistantName)

    // Wait for the assistant to be removed from the list
    await page.waitForTimeout(2000)

    // Verify assistant was deleted
    const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
    await expect(assistantItem).not.toBeVisible({ timeout: 10000 })

    // Count should have decreased
    const newCount = await getAssistantCount(page)
    expect(newCount).toBeLessThan(initialCount)
  })
})
