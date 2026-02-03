import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createPineconeTestProfile,
  createQdrantTestProfile,
  createWeaviateTestProfile,
  type ElectronTestContext,
} from './electron.setup'

let electronContext: ElectronTestContext

test.beforeAll(async () => {
  electronContext = await launchElectronApp()
})

test.afterAll(async () => {
  await cleanupTestProfiles(electronContext.page)
  await closeElectronApp(electronContext.app)
})

test.describe('E2E-002: Connection Flow Tests', () => {
  test.describe('Pinecone Connection Flow', () => {
    test('should open connection modal on app launch', async () => {
      const { page } = electronContext

      // When app starts without profiles, it should show the setup window
      const setupWindow = page.locator('[data-testid="setup-window"]').or(
        page.locator('input#profileName')
      )
      await expect(setupWindow.first()).toBeVisible({ timeout: 10000 })
    })

    test('should show connection form with required fields', async () => {
      const { page } = electronContext

      // Verify form fields exist
      const profileNameInput = page.locator('input#profileName')
      const apiKeyInput = page.locator('input#apiKey')
      const connectButton = page.locator('button[type="submit"]')

      await expect(profileNameInput).toBeVisible()
      await expect(apiKeyInput).toBeVisible()
      await expect(connectButton).toBeVisible()
    })

    test('should validate required fields', async () => {
      const { page } = electronContext

      // Fill profile name but leave API key empty
      await page.fill('input#profileName', 'Test Connection')

      // The API key field has HTML5 required attribute, so form submission will be prevented
      const apiKeyInput = page.locator('input#apiKey')
      const isRequired = await apiKeyInput.getAttribute('required')
      expect(isRequired).not.toBeNull()

      // Try to connect - browser validation should prevent submission
      const connectButton = page.locator('button[type="submit"]')
      await connectButton.click()

      // The form should still be visible (not submitted)
      await expect(apiKeyInput).toBeVisible()
    })

    test('should handle connection error with invalid API key', async () => {
      const { page } = electronContext

      // Create a profile with invalid API key and test connection via IPC
      const profileId = `test-invalid-${Date.now()}`

      const connectionFailed = await page.evaluate(async (id) => {
        const profile = {
          id,
          name: 'Invalid Key Test',
          provider: 'pinecone' as const,
          apiKey: 'invalid-api-key-12345',
        }

        try {
          await (window as any).electronAPI.pinecone.connect(id, profile)
          return false // Should not reach here
        } catch (error) {
          return true // Connection should fail
        }
      }, profileId)

      expect(connectionFailed).toBe(true)
    })

    test('should successfully connect with valid credentials', async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        // Skip this test if no real API key available
        test.skip()
        return
      }

      // Create a test profile using the helper (which saves to store)
      const profileId = await createPineconeTestProfile(
        page,
        'E2E Test Connection',
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

      // Wait for connection to establish
      await page.waitForTimeout(2000)

      // Verify connection was successful by checking we can list indexes
      const canListIndexes = await page.evaluate(async (id) => {
        try {
          const indexes = await (window as any).electronAPI.pinecone.listIndexes(id)
          return Array.isArray(indexes)
        } catch (error) {
          console.error('Failed to list indexes:', error)
          return false
        }
      }, profileId)

      expect(canListIndexes).toBe(true)
    })

    test('should display collections/indexes after successful connection', async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Create and connect to a test profile
      const profileId = await createPineconeTestProfile(
        page,
        'Collections Test',
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

      // Fetch indexes and verify structure
      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, profileId)

      expect(Array.isArray(indexes)).toBe(true)
    })

    test('should handle disconnect functionality', async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Create and connect to a profile
      const profileId = await createPineconeTestProfile(
        page,
        'Disconnect Test',
        process.env.PINECONE_API_KEY
      )

      await page.evaluate(async (id) => {
        const profiles = await (window as any).electronAPI.profiles.getAll()
        const profile = profiles.find((p: any) => p.id === id)
        if (profile) {
          await (window as any).electronAPI.pinecone.connect(id, profile)
        }
      }, profileId)

      await page.waitForTimeout(1000)

      // Disconnect from the profile
      const disconnectSuccess = await page.evaluate(async (id) => {
        try {
          await (window as any).electronAPI.pinecone.disconnect(id)
          return true
        } catch (error) {
          console.error('Disconnect failed:', error)
          return false
        }
      }, profileId)

      expect(disconnectSuccess).toBe(true)
    })

    test('should support reconnection after disconnect', async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Create profile
      const profileId = await createPineconeTestProfile(
        page,
        'Reconnect Test',
        process.env.PINECONE_API_KEY
      )

      // First connection
      await page.evaluate(async (id) => {
        const profiles = await (window as any).electronAPI.profiles.getAll()
        const profile = profiles.find((p: any) => p.id === id)
        if (profile) {
          await (window as any).electronAPI.pinecone.connect(id, profile)
        }
      }, profileId)

      await page.waitForTimeout(1000)

      // Disconnect
      await page.evaluate(async (id) => {
        await (window as any).electronAPI.pinecone.disconnect(id)
      }, profileId)

      await page.waitForTimeout(500)

      // Reconnect
      const reconnectSuccess = await page.evaluate(async (id) => {
        try {
          const profiles = await (window as any).electronAPI.profiles.getAll()
          const profile = profiles.find((p: any) => p.id === id)
          if (profile) {
            await (window as any).electronAPI.pinecone.connect(id, profile)
          }

          // Verify connection by listing indexes
          const indexes = await (window as any).electronAPI.pinecone.listIndexes(id)
          return Array.isArray(indexes)
        } catch (error) {
          console.error('Reconnection failed:', error)
          return false
        }
      }, profileId)

      expect(reconnectSuccess).toBe(true)
    })

    test('should save profile to connection list', async () => {
      const { page } = electronContext

      const testProfileName = `Saved Profile ${Date.now()}`
      const profileId = await createPineconeTestProfile(
        page,
        testProfileName,
        'test-api-key'
      )

      // Verify profile was saved
      const savedProfiles = await page.evaluate(async () => {
        return await (window as any).electronAPI.profiles.getAll()
      })

      const savedProfile = savedProfiles.find((p: any) => p.id === profileId)
      expect(savedProfile).toBeDefined()
      expect(savedProfile.name).toBe(testProfileName)
      expect(savedProfile.provider).toBe('pinecone')
    })

    test('should load saved profiles in sidebar', async () => {
      const { page } = electronContext

      // Create multiple test profiles
      await createPineconeTestProfile(page, 'Profile 1')
      await createPineconeTestProfile(page, 'Profile 2')

      // Reload the page to see saved profiles
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Check if profiles are loaded
      const profileCount = await page.evaluate(async () => {
        const profiles = await (window as any).electronAPI.profiles.getAll()
        return profiles.filter((p: any) => p.id.startsWith('test-')).length
      })

      expect(profileCount).toBeGreaterThanOrEqual(2)
    })

    test('should handle connection error with unreachable URL', async () => {
      const { page } = electronContext

      // Note: This test is limited because we're using the Pinecone SDK
      // which doesn't accept custom URLs. This test primarily validates
      // error handling for invalid credentials.

      const profileId = await createPineconeTestProfile(
        page,
        'Bad URL Test',
        'pcsk_invalid_key_format_test'
      )

      const connectionFailed = await page.evaluate(async (id) => {
        try {
          const profiles = await (window as any).electronAPI.profiles.getAll()
          const profile = profiles.find((p: any) => p.id === id)
          if (profile) {
            await (window as any).electronAPI.pinecone.connect(id, profile)
          }
          return false // Should not reach here
        } catch (error) {
          return true // Connection should fail
        }
      }, profileId)

      expect(connectionFailed).toBe(true)
    })
  })

  test.describe('Qdrant Connection Flow', () => {
    // TODO: Enable when adapter system is integrated into backend
    test.skip('should connect to Qdrant instance', async () => {
      const { page } = electronContext

      // Create Qdrant profile
      const profileId = await createQdrantTestProfile(
        page,
        'Qdrant Test',
        process.env.QDRANT_URL || 'http://localhost:6333'
      )

      // TODO: Implement Qdrant connection flow when adapter is integrated
      // This test will:
      // 1. Select Qdrant as provider in connection modal
      // 2. Enter Qdrant URL
      // 3. Connect and verify collections are listed
      // 4. Test error handling with invalid URL
      // 5. Test disconnect/reconnect

      expect(profileId).toBeDefined()
    })

    test.skip('should handle Qdrant connection errors', async () => {
      const { page } = electronContext

      // TODO: Test connection error handling for Qdrant
      // - Invalid URL
      // - Unreachable server
      // - Network timeouts
    })

    test.skip('should list Qdrant collections after connection', async () => {
      const { page } = electronContext

      // TODO: Verify Qdrant collections are displayed
    })

    test.skip('should support Qdrant disconnect and reconnect', async () => {
      const { page } = electronContext

      // TODO: Test disconnect/reconnect cycle for Qdrant
    })
  })

  test.describe('Weaviate Connection Flow', () => {
    // TODO: Enable when adapter system is integrated into backend
    test.skip('should connect to Weaviate instance', async () => {
      const { page } = electronContext

      // Create Weaviate profile
      const profileId = await createWeaviateTestProfile(
        page,
        'Weaviate Test',
        process.env.WEAVIATE_URL || 'http://localhost:8080'
      )

      // TODO: Implement Weaviate connection flow when adapter is integrated
      // This test will:
      // 1. Select Weaviate as provider in connection modal
      // 2. Enter Weaviate host and scheme
      // 3. Connect and verify classes are listed
      // 4. Test error handling with invalid host
      // 5. Test disconnect/reconnect

      expect(profileId).toBeDefined()
    })

    test.skip('should handle Weaviate connection errors', async () => {
      const { page } = electronContext

      // TODO: Test connection error handling for Weaviate
      // - Invalid host
      // - Unreachable server
      // - Authentication errors
    })

    test.skip('should list Weaviate classes after connection', async () => {
      const { page } = electronContext

      // TODO: Verify Weaviate classes are displayed
    })

    test.skip('should support Weaviate disconnect and reconnect', async () => {
      const { page } = electronContext

      // TODO: Test disconnect/reconnect cycle for Weaviate
    })
  })

  test.describe('Multi-Provider Support', () => {
    // TODO: Enable when UI supports provider selection
    test.skip('should display provider selection in connection modal', async () => {
      const { page } = electronContext

      // TODO: Verify UI shows provider dropdown/selector
      // Should list: Pinecone, Qdrant, Weaviate
    })

    test.skip('should show provider-specific fields based on selection', async () => {
      const { page } = electronContext

      // TODO: Verify form fields change based on provider
      // - Pinecone: API Key
      // - Qdrant: URL
      // - Weaviate: Scheme + Host
    })

    test.skip('should save provider type with profile', async () => {
      const { page } = electronContext

      // TODO: Verify provider is saved and loaded correctly
    })
  })
})
