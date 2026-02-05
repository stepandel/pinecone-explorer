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
  waitForChatView,
  sendChatMessage,
  waitForAssistantResponse,
  clearConversation,
  getCurrentModel,
  getMessageCount,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-chat-${Date.now()}`
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

test.describe.serial('E2E-ASSISTANT-006: Chat Interface Tests', () => {
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
      'Chat Interface Test',
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
    await page.locator('[data-testid="assistant-instructions-input"]').fill('You are a helpful test assistant.')
    await page.locator('[data-testid="assistant-save-button"]').click()
    
    // Wait for assistant to be created and become ready
    await page.waitForSelector(`[data-testid="assistant-item"][data-assistant-name="${testAssistantName}"]`, { timeout: 30000 })
    
    // Wait for assistant to be ready
    await page.waitForTimeout(5000)
  })

  test('selecting an assistant should show ChatView', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Select the test assistant
    await selectAssistant(page, testAssistantName)
    
    // ChatView should appear
    await waitForChatView(page)
    
    const chatView = page.locator('[data-testid="chat-view"]')
    await expect(chatView).toBeVisible()
  })

  test('ChatView should show assistant name in header', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Assistant name should be visible in the header
    const chatView = page.locator('[data-testid="chat-view"]')
    const header = chatView.locator(`text=${testAssistantName}`)
    await expect(header).toBeVisible({ timeout: 5000 })
  })

  test('ChatView should show empty state initially', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Should show empty state message
    const emptyState = page.locator(`text=Chat with ${testAssistantName}`)
    await expect(emptyState).toBeVisible({ timeout: 5000 })

    // Message list should be empty
    const messageCount = await getMessageCount(page)
    expect(messageCount).toBe(0)
  })

  test('ChatView should have chat input', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const chatInput = page.locator('[data-testid="chat-input"]')
    await expect(chatInput).toBeVisible()
    await expect(chatInput).toBeEnabled()
  })

  test('ChatView should have send button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const sendButton = page.locator('[data-testid="chat-send-button"]')
    await expect(sendButton).toBeVisible()
    
    // Send button should be disabled when input is empty
    await expect(sendButton).toBeDisabled()
  })

  test('send button should enable when message is typed', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill('Hello')
    
    const sendButton = page.locator('[data-testid="chat-send-button"]')
    await expect(sendButton).toBeEnabled()
    
    // Clear input
    await chatInput.clear()
    await expect(sendButton).toBeDisabled()
  })

  test('ChatView should have model selector', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const modelSelector = page.locator('[data-testid="chat-model-selector"]')
    await expect(modelSelector).toBeVisible()
    
    // Should show a default model
    const model = await getCurrentModel(page)
    expect(model.length).toBeGreaterThan(0)
  })

  test('ChatView should have clear button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const clearButton = page.locator('[data-testid="chat-clear-button"]')
    await expect(clearButton).toBeVisible()
    
    // Clear button should be disabled when no messages
    await expect(clearButton).toBeDisabled()
  })

  test('sending a message should create user message', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Wait for assistant to be fully ready
    await page.waitForTimeout(2000)

    // Send a message
    await sendChatMessage(page, 'Hello, this is a test message.')
    
    // User message should appear
    const userMessage = page.locator('[data-testid="chat-message-user"]')
    await expect(userMessage).toBeVisible({ timeout: 10000 })
    
    // Message should contain our text
    const messageText = await userMessage.textContent()
    expect(messageText).toContain('test message')
  })

  test('assistant should respond to message', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Wait for assistant response
    const response = await waitForAssistantResponse(page)
    
    // Response should not be empty
    expect(response.length).toBeGreaterThan(0)
    
    // Assistant message should be visible
    const assistantMessage = page.locator('[data-testid="chat-message-assistant"]')
    await expect(assistantMessage).toBeVisible()
  })

  test('message list should show both messages', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Should have at least 2 messages (user + assistant)
    const messageCount = await getMessageCount(page)
    expect(messageCount).toBeGreaterThanOrEqual(2)
    
    // Message list should be visible
    const messageList = page.locator('[data-testid="chat-message-list"]')
    await expect(messageList).toBeVisible()
  })

  test('clear button should enable after messages exist', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const clearButton = page.locator('[data-testid="chat-clear-button"]')
    await expect(clearButton).toBeEnabled()
  })

  test('clear conversation should remove all messages', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Clear the conversation
    await clearConversation(page)
    
    // Message count should be 0
    const messageCount = await getMessageCount(page)
    expect(messageCount).toBe(0)
    
    // Empty state should appear again
    const emptyState = page.locator(`text=Chat with ${testAssistantName}`)
    await expect(emptyState).toBeVisible({ timeout: 5000 })
  })

  test('Enter key should send message', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill('Test message via Enter key')
    
    // Press Enter to send
    await chatInput.press('Enter')
    
    // User message should appear
    const userMessage = page.locator('[data-testid="chat-message-user"]')
    await expect(userMessage).toBeVisible({ timeout: 10000 })
    
    // Wait for response and clear
    await waitForAssistantResponse(page)
    await clearConversation(page)
  })

  test('Shift+Enter should not send message', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const chatInput = page.locator('[data-testid="chat-input"]')
    await chatInput.fill('Line 1')
    
    // Press Shift+Enter (should add new line, not send)
    await chatInput.press('Shift+Enter')
    await chatInput.type('Line 2')
    
    // No user message should appear yet
    const messageCount = await getMessageCount(page)
    expect(messageCount).toBe(0)
    
    // Input should contain both lines
    const value = await chatInput.inputValue()
    expect(value).toContain('Line 1')
    expect(value).toContain('Line 2')
    
    // Clear input
    await chatInput.clear()
  })
})
