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
  waitForAssistantsPanel,
  waitForChatView,
  sendChatMessage,
  waitForAssistantResponse,
  clearConversation,
  getFileCount,
  getMessageCount,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-integration-${Date.now()}`
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

test.describe.serial('E2E-ASSISTANT-008: Integration Flow Tests', () => {
  test.describe('Full Integration Flow', () => {
    test('Step 1: Connect and switch to assistant mode', async () => {
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
        'Integration Test',
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

      // Verify we're in assistant mode
      const modeSwitcher = page.locator('[data-testid="mode-assistant"]')
      await expect(modeSwitcher).toHaveAttribute('aria-checked', 'true')
    })

    test('Step 2: Create a new assistant', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Create a test assistant with instructions
      await createTestAssistant(page, testAssistantName, {
        instructions: 'You are a helpful assistant for E2E integration testing. Answer questions clearly and concisely.',
      })

      // Verify assistant appears in the list
      const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
      await expect(assistantItem).toBeVisible({ timeout: 30000 })
    })

    test('Step 3: Wait for assistant to become ready', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Wait for assistant status to become Ready
      const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
      const statusIndicator = assistantItem.locator('[data-testid="assistant-status"]')

      // Wait up to 60 seconds for Ready status
      await page.waitForFunction(
        async (name) => {
          const item = document.querySelector(`[data-testid="assistant-item"][data-assistant-name="${name}"]`)
          if (!item) return false
          const status = item.querySelector('[data-testid="assistant-status"]')
          return status?.getAttribute('data-status') === 'Ready'
        },
        testAssistantName,
        { timeout: 60000 }
      )

      const status = await statusIndicator.getAttribute('data-status')
      expect(status).toBe('Ready')
    })

    test('Step 4: Select the assistant and verify chat view', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      await selectAssistant(page, testAssistantName)
      await waitForChatView(page)

      // Verify chat view is showing the selected assistant
      const chatHeader = page.locator(`[data-testid="chat-view"] >> text=${testAssistantName}`)
      await expect(chatHeader).toBeVisible()

      // Verify files panel is showing
      const filesPanel = page.locator('[data-testid="files-panel"]')
      await expect(filesPanel).toBeVisible()
    })

    test('Step 5: Verify empty state for new assistant', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // No files should exist yet
      const fileCount = await getFileCount(page)
      expect(fileCount).toBe(0)

      // No messages should exist yet
      const messageCount = await getMessageCount(page)
      expect(messageCount).toBe(0)

      // Empty state message should be visible
      const emptyState = page.locator(`text=Chat with ${testAssistantName}`)
      await expect(emptyState).toBeVisible()
    })

    test('Step 6: Send a message and receive response', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Send a test message
      await sendChatMessage(page, 'Hello! Can you tell me that you are an E2E test assistant?')

      // User message should appear
      const userMessage = page.locator('[data-testid="chat-message-user"]')
      await expect(userMessage).toBeVisible({ timeout: 10000 })

      // Wait for assistant response
      const response = await waitForAssistantResponse(page)
      expect(response.length).toBeGreaterThan(0)

      // Assistant message should be visible
      const assistantMessage = page.locator('[data-testid="chat-message-assistant"]')
      await expect(assistantMessage).toBeVisible()
    })

    test('Step 7: Verify message list has both messages', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      const messageCount = await getMessageCount(page)
      expect(messageCount).toBeGreaterThanOrEqual(2)

      // Message list should be visible
      const messageList = page.locator('[data-testid="chat-message-list"]')
      await expect(messageList).toBeVisible()
    })

    test('Step 8: Send follow-up message', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Send a follow-up message
      await sendChatMessage(page, 'What were we just talking about?')

      // Wait for response
      const response = await waitForAssistantResponse(page)
      expect(response.length).toBeGreaterThan(0)

      // Should now have 4 messages
      const messageCount = await getMessageCount(page)
      expect(messageCount).toBeGreaterThanOrEqual(4)
    })

    test('Step 9: Clear conversation', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Clear the conversation
      await clearConversation(page)

      // Messages should be cleared
      const messageCount = await getMessageCount(page)
      expect(messageCount).toBe(0)

      // Empty state should reappear
      const emptyState = page.locator(`text=Chat with ${testAssistantName}`)
      await expect(emptyState).toBeVisible()
    })

    test('Step 10: Switch to index mode and back', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Switch to index mode
      const indexButton = page.locator('[data-testid="mode-index"]')
      await indexButton.click()
      await page.waitForTimeout(500)

      // Verify we're in index mode
      await expect(indexButton).toHaveAttribute('aria-checked', 'true')

      // Indexes panel should be visible
      const indexesPanel = page.locator('[data-testid="indexes-panel"]')
      await expect(indexesPanel).toBeVisible()

      // Switch back to assistant mode
      await switchToAssistantMode(page)
      await waitForAssistantsPanel(page)

      // Assistant should still be in the list
      const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
      await expect(assistantItem).toBeVisible()
    })

    test('Step 11: Re-select assistant and verify state', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Re-select the assistant
      await selectAssistant(page, testAssistantName)
      await waitForChatView(page)

      // Conversation should still be empty (we cleared it)
      const messageCount = await getMessageCount(page)
      expect(messageCount).toBe(0)
    })

    test('Step 12: Delete the assistant', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Delete via API
      await page.evaluate(async (name) => {
        const profiles = await (window as any).electronAPI.profiles.getAll()
        const profile = profiles.find((p: any) => p.id.startsWith('test-'))
        if (profile) {
          await (window as any).electronAPI.assistant.delete(profile.id, name)
        }
      }, testAssistantName)

      // Wait for deletion
      await page.waitForTimeout(3000)

      // Assistant should no longer be in the list
      const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`)
      await expect(assistantItem).not.toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Error Handling', () => {
    test('should handle assistant creation with invalid name', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Open create form
      await page.locator('[data-testid="new-assistant-button"]').click()
      await page.waitForSelector('[data-testid="assistant-config-view"]')

      // Try to create with empty name
      const saveButton = page.locator('[data-testid="assistant-save-button"]')
      await expect(saveButton).toBeDisabled()

      // Cancel
      await page.locator('[data-testid="assistant-cancel-button"]').click()
    })

    test('should show error for network failures', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Intercept Pinecone API requests and simulate network failure
      await page.route('**/assistant/**', route => {
        route.abort('failed')
      })

      try {
        // Try to send a message which should trigger an API call
        const chatInput = page.locator('[data-testid="chat-input"]')
        if (await chatInput.isVisible()) {
          await chatInput.fill('Test message to trigger error')
          await page.keyboard.press('Enter')

          // Wait for error to appear (the chat should show an error state)
          const chatError = page.locator('[data-testid="chat-error"], text=/error|failed|unable/i')
          await expect(chatError).toBeVisible({ timeout: 10000 })
        } else {
          // Chat input not visible, verify chat view exists at minimum
          const chatView = page.locator('[data-testid="chat-view"]')
          await expect(chatView).toBeVisible()
        }
      } finally {
        // Remove the route to not affect other tests
        await page.unroute('**/assistant/**')
      }
    })
  })
})
