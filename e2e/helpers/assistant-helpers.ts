import { Page, expect } from '@playwright/test'

/**
 * Helper functions for E2E testing of the Assistant feature.
 * These helpers interact with the UI via data-testid attributes.
 */

/**
 * Switch to assistant mode using the mode switcher
 */
export async function switchToAssistantMode(page: Page): Promise<void> {
  const modeButton = page.locator('[data-testid="mode-assistant"]')
  await modeButton.click()
  await page.waitForTimeout(500) // Wait for mode transition
  
  // Verify we're in assistant mode
  await expect(modeButton).toHaveAttribute('aria-checked', 'true')
}

/**
 * Switch to index mode using the mode switcher
 */
export async function switchToIndexMode(page: Page): Promise<void> {
  const modeButton = page.locator('[data-testid="mode-index"]')
  await modeButton.click()
  await page.waitForTimeout(500) // Wait for mode transition
  
  // Verify we're in index mode
  await expect(modeButton).toHaveAttribute('aria-checked', 'true')
}

/**
 * Create a test assistant via the UI
 */
export async function createTestAssistant(
  page: Page,
  name: string,
  options?: {
    instructions?: string
    region?: 'us' | 'eu'
  }
): Promise<void> {
  // Click the new assistant button
  const newButton = page.locator('[data-testid="new-assistant-button"]')
  await newButton.click()
  
  // Wait for the config view to appear
  await page.waitForSelector('[data-testid="assistant-config-view"]', { timeout: 5000 })
  
  // Fill in the name
  const nameInput = page.locator('[data-testid="assistant-name-input"]')
  await nameInput.fill(name)
  
  // Fill in instructions if provided
  if (options?.instructions) {
    const instructionsInput = page.locator('[data-testid="assistant-instructions-input"]')
    await instructionsInput.fill(options.instructions)
  }
  
  // Click save/create button
  const saveButton = page.locator('[data-testid="assistant-save-button"]')
  await saveButton.click()
  
  // Wait for the assistant to be created (config view should close)
  await page.waitForSelector('[data-testid="assistant-config-view"]', { 
    state: 'detached',
    timeout: 30000 // API calls can be slow
  })
  
  // Verify the assistant appears in the list
  await expect(page.locator(`[data-testid="assistant-item"][data-assistant-name="${name}"]`)).toBeVisible({ timeout: 10000 })
}

/**
 * Delete a test assistant via the UI context menu
 */
export async function deleteTestAssistant(page: Page, name: string): Promise<void> {
  // Find and right-click the assistant item
  const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${name}"]`)
  await assistantItem.click({ button: 'right' })
  
  // Wait for native context menu action to complete (via IPC)
  // The delete dialog should open
  await page.waitForTimeout(500)
  
  // Type the assistant name in the confirmation input
  const confirmationInput = page.locator('input[placeholder]').filter({ hasText: '' })
  await confirmationInput.fill(name)
  
  // Click the delete button
  const deleteButton = page.locator('button:has-text("Delete")')
  await deleteButton.click()
  
  // Wait for the assistant to be removed
  await expect(assistantItem).not.toBeVisible({ timeout: 30000 })
}

/**
 * Select an assistant by clicking on it
 */
export async function selectAssistant(page: Page, name: string): Promise<void> {
  const assistantItem = page.locator(`[data-testid="assistant-item"][data-assistant-name="${name}"]`)
  await assistantItem.click()
  
  // Wait for the assistant to be selected (aria-pressed should be true)
  await expect(assistantItem).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Upload a test file to the current assistant via the native file dialog
 * Note: In E2E tests, we use the IPC API directly since we can't interact with native dialogs
 */
export async function uploadTestFile(
  page: Page, 
  filePath: string,
  options?: {
    metadata?: Record<string, string | number>
    multimodal?: boolean
  }
): Promise<void> {
  // Get current profile and assistant from the page context
  const result = await page.evaluate(async ({ filePath, metadata, multimodal }) => {
    // Get the current profile and assistant from the window state
    // This requires access to the React context, so we use a data attribute approach
    const profileId = (window as any).__testProfileId
    const assistantName = (window as any).__testAssistantName
    
    if (!profileId || !assistantName) {
      throw new Error('Profile ID or assistant name not set for test')
    }
    
    await (window as any).electronAPI.assistant.files.upload(profileId, assistantName, {
      filePath,
      metadata,
      multimodal,
    })
    
    return { success: true }
  }, { filePath, metadata: options?.metadata, multimodal: options?.multimodal })
  
  if (!result.success) {
    throw new Error('Failed to upload file')
  }
  
  // Wait for the file to appear in the files panel
  await page.waitForTimeout(1000)
}

/**
 * Wait for a file to reach "Available" status
 */
export async function waitForFileReady(
  page: Page, 
  fileName: string,
  timeout: number = 60000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    // Check if file exists and has Available status
    const fileItem = page.locator(`[data-testid="file-item"][data-file-name="${fileName}"]`)
    
    if (await fileItem.isVisible()) {
      // Check for the "Ready" status indicator
      const statusText = await fileItem.locator('text=Ready').isVisible()
      if (statusText) {
        return
      }
    }
    
    await page.waitForTimeout(2000) // Poll every 2 seconds
  }
  
  throw new Error(`File "${fileName}" did not become ready within ${timeout}ms`)
}

/**
 * Select a file by clicking on it
 */
export async function selectFile(page: Page, fileName: string): Promise<void> {
  const fileItem = page.locator(`[data-testid="file-item"][data-file-name="${fileName}"]`)
  await fileItem.click()
  await page.waitForTimeout(300) // Wait for selection
}

/**
 * Send a chat message to the assistant
 */
export async function sendChatMessage(page: Page, message: string): Promise<void> {
  // Type the message
  const chatInput = page.locator('[data-testid="chat-input"]')
  await chatInput.fill(message)
  
  // Click send button
  const sendButton = page.locator('[data-testid="chat-send-button"]')
  await sendButton.click()
}

/**
 * Wait for the assistant to finish streaming a response
 */
export async function waitForAssistantResponse(page: Page, timeout: number = 60000): Promise<string> {
  // Wait for a new assistant message to appear
  const assistantMessage = page.locator('[data-testid="chat-message-assistant"]').last()
  
  // Wait for streaming to complete (stop button should disappear)
  await expect(page.locator('[data-testid="chat-stop-button"]')).not.toBeVisible({ timeout })
  
  // Get the message content
  const content = await assistantMessage.textContent()
  return content || ''
}

/**
 * Clear the chat conversation
 */
export async function clearConversation(page: Page): Promise<void> {
  const clearButton = page.locator('[data-testid="chat-clear-button"]')
  await clearButton.click()
  
  // Wait for messages to be cleared
  await expect(page.locator('[data-testid="chat-message-list"]')).not.toBeVisible({ timeout: 5000 })
}

/**
 * Get the current model selected in the chat
 */
export async function getCurrentModel(page: Page): Promise<string> {
  const modelSelector = page.locator('[data-testid="chat-model-selector"]')
  const modelText = await modelSelector.textContent()
  return modelText || ''
}

/**
 * Change the chat model
 */
export async function setModel(page: Page, model: string): Promise<void> {
  const modelSelector = page.locator('[data-testid="chat-model-selector"]')
  await modelSelector.click()
  
  // Select the model from dropdown
  const modelOption = page.locator(`[role="option"]:has-text("${model}")`)
  await modelOption.click()
  
  await page.waitForTimeout(300) // Wait for selection
}

/**
 * Check if the mode switcher is visible
 */
export async function isModeSwitcherVisible(page: Page): Promise<boolean> {
  const modeSwitcher = page.locator('[data-testid="mode-switcher"]')
  return await modeSwitcher.isVisible()
}

/**
 * Get the current mode
 */
export async function getCurrentMode(page: Page): Promise<'index' | 'assistant'> {
  const indexButton = page.locator('[data-testid="mode-index"]')
  const isIndexMode = await indexButton.getAttribute('aria-checked') === 'true'
  return isIndexMode ? 'index' : 'assistant'
}

/**
 * Wait for assistants panel to be visible
 */
export async function waitForAssistantsPanel(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="assistants-panel"]', { timeout: 10000 })
}

/**
 * Wait for files panel to be visible
 */
export async function waitForFilesPanel(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="files-panel"]', { timeout: 10000 })
}

/**
 * Wait for chat view to be visible
 */
export async function waitForChatView(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10000 })
}

/**
 * Click on a citation superscript to open the popover
 */
export async function clickCitation(page: Page, index: number): Promise<void> {
  const citation = page.locator(`[data-testid="citation-superscript"][data-citation-index="${index}"]`)
  await citation.click()
  
  // Wait for popover to open
  await expect(page.locator('[data-testid="citation-popover"]')).toBeVisible({ timeout: 5000 })
}

/**
 * Click "View File" in the citation popover
 */
export async function clickViewFileInCitation(page: Page): Promise<void> {
  const viewFileButton = page.locator('[data-testid="citation-view-file-button"]').first()
  await viewFileButton.click()
  
  // Wait for file detail panel to update
  await page.waitForTimeout(500)
}

/**
 * Get file details from the file detail panel
 */
export async function getFileDetails(page: Page): Promise<{
  name: string | null
  status: string | null
}> {
  const detailPanel = page.locator('[data-testid="file-detail-panel"]')
  
  // Get file name
  const nameElement = detailPanel.locator('.font-medium').first()
  const name = await nameElement.textContent()
  
  // Get status badge text
  const statusBadge = detailPanel.locator('[class*="bg-green"], [class*="bg-yellow"], [class*="bg-red"]').first()
  const status = await statusBadge.textContent()
  
  return { name, status }
}

/**
 * Get the number of assistants in the list
 */
export async function getAssistantCount(page: Page): Promise<number> {
  const assistants = page.locator('[data-testid="assistant-item"]')
  return await assistants.count()
}

/**
 * Get the number of files in the list
 */
export async function getFileCount(page: Page): Promise<number> {
  const files = page.locator('[data-testid="file-item"]')
  return await files.count()
}

/**
 * Get the number of messages in the chat
 */
export async function getMessageCount(page: Page): Promise<number> {
  const messages = page.locator('[data-testid^="chat-message-"]')
  return await messages.count()
}
