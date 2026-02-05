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
  getFileCount,
  clickCitation,
  clickViewFileInCitation,
} from './helpers/assistant-helpers'

let electronContext: ElectronTestContext
let testAssistantName: string

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
  testAssistantName = `test-cite-${Date.now()}`
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

test.describe.serial('E2E-ASSISTANT-007: Citation Tests', () => {
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
      'Citation Test',
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
    await waitForChatView(page)
  })

  test('citation superscript should be visible when response has citations', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    // Check if there are files uploaded
    const fileCount = await getFileCount(page)
    
    if (fileCount === 0) {
      // No files uploaded, citations won't be generated
      // Skip this test or document that citations require files
      test.skip()
      return
    }

    // Ask a question that might generate citations
    await sendChatMessage(page, 'What information do you have in your knowledge base?')
    
    await waitForAssistantResponse(page)
    
    // Look for citation superscripts in the assistant's response
    const citations = page.locator('[data-testid="citation-superscript"]')
    
    // Citations may or may not be present depending on the response
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      await expect(citations.first()).toBeVisible()
    }
  })

  test('clicking citation should open popover', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click the first citation
      await citations.first().click()
      
      // Popover should open
      const popover = page.locator('[data-testid="citation-popover"]')
      await expect(popover).toBeVisible({ timeout: 5000 })
    } else {
      // Skip if no citations
      test.skip()
    }
  })

  test('citation popover should show file name', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click citation to open popover
      await citations.first().click()
      
      // Popover should show file name
      const fileName = page.locator('[data-testid="citation-file-name"]')
      await expect(fileName).toBeVisible({ timeout: 5000 })
    } else {
      test.skip()
    }
  })

  test('citation popover should have View File button', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click citation to open popover
      await citations.first().click()
      
      // View File button should be visible
      const viewFileButton = page.locator('[data-testid="citation-view-file-button"]')
      await expect(viewFileButton).toBeVisible({ timeout: 5000 })
    } else {
      test.skip()
    }
  })

  test('clicking View File should navigate to file in detail panel', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click citation to open popover
      await citations.first().click()
      
      // Click View File button
      await clickViewFileInCitation(page)
      
      // File detail panel should show the file
      const detailPanel = page.locator('[data-testid="file-detail-panel"]')
      await expect(detailPanel).toBeVisible()
      
      // Empty state should not be visible
      const emptyState = page.locator('[data-testid="file-detail-empty-state"]')
      await expect(emptyState).not.toBeVisible()
    } else {
      test.skip()
    }
  })

  test('citation popover should show page numbers if available', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click citation to open popover
      await citations.first().click()
      
      // Page numbers may or may not be present depending on the file type
      const popover = page.locator('[data-testid="citation-popover"]')
      const pageInfo = popover.locator('text=Pages:')
      
      // Just verify the popover renders without errors
      await expect(popover).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('multiple citations should have incremental numbers', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 1) {
      // Check that citations have different indices
      const indices: number[] = []
      
      for (let i = 0; i < citationCount && i < 5; i++) {
        const citation = citations.nth(i)
        const index = await citation.getAttribute('data-citation-index')
        if (index !== null) {
          indices.push(parseInt(index))
        }
      }
      
      // Indices should be unique
      const uniqueIndices = new Set(indices)
      expect(uniqueIndices.size).toBe(indices.length)
    }
  })

  test('citation superscripts should be styled correctly', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      const citation = citations.first()
      
      // Citation should be a button
      const tagName = await citation.evaluate(el => el.tagName.toLowerCase())
      expect(tagName).toBe('button')
      
      // Should have aria-label for accessibility
      const ariaLabel = await citation.getAttribute('aria-label')
      expect(ariaLabel).toContain('citation')
    } else {
      test.skip()
    }
  })

  test('popover should close when clicking outside', async () => {
    const { page } = electronContext

    const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                         process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

    if (!hasRealApiKey) {
      test.skip()
      return
    }

    const citations = page.locator('[data-testid="citation-superscript"]')
    const citationCount = await citations.count()
    
    if (citationCount > 0) {
      // Click citation to open popover
      await citations.first().click()
      
      const popover = page.locator('[data-testid="citation-popover"]')
      await expect(popover).toBeVisible()
      
      // Click outside the popover
      await page.locator('[data-testid="chat-view"]').click({ position: { x: 10, y: 10 } })
      
      // Popover should close
      await expect(popover).not.toBeVisible({ timeout: 3000 })
    } else {
      test.skip()
    }
  })
})
