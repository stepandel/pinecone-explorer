import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createQdrantTestProfile,
  createWeaviateTestProfile,
  connectToProfile,
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

test.describe('Pinecone Explorer E2E', () => {
  test('should launch app successfully', async () => {
    const { page } = electronContext
    // Verify that the app window is visible
    expect(page).toBeTruthy()
    expect(await page.title()).toBeTruthy()
  })

  // TODO: Re-enable when multi-database adapter system is integrated into backend
  test.skip('should create and connect to Qdrant profile', async () => {
    const { page } = electronContext
    const profileId = await createQdrantTestProfile(page)

    // Connect to the profile
    await connectToProfile(page, profileId)

    // Verify we can list indexes/collections
    const collections = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.pinecone.listIndexes(id)
    }, profileId)

    expect(Array.isArray(collections)).toBe(true)
  })

  // TODO: Re-enable when multi-database adapter system is integrated into backend
  test.skip('should create test collection in Qdrant', async () => {
    const { page } = electronContext
    const profileId = await createQdrantTestProfile(page)
    await connectToProfile(page, profileId)

    const collectionName = `test_collection_${Date.now()}`

    // Create a test collection
    await page.evaluate(
      async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.createIndex(id, {
          name,
          dimension: 384,
          metric: 'cosine',
          spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
        })
      },
      { id: profileId, name: collectionName }
    )

    // Wait for collection to be created
    await page.waitForTimeout(2000)

    // Verify collection exists
    const collections = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.pinecone.listIndexes(id)
    }, profileId)

    expect(collections).toContainEqual(expect.objectContaining({ name: collectionName }))

    // Clean up - delete the test collection
    await page.evaluate(
      async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.deleteIndex(id, name)
      },
      { id: profileId, name: collectionName }
    )
  })

  // TODO: Re-enable when multi-database adapter system is integrated into backend
  test.skip('should create and connect to Weaviate profile', async () => {
    const { page } = electronContext
    const profileId = await createWeaviateTestProfile(page)

    // Connect to the profile
    await connectToProfile(page, profileId)

    // Verify we can list indexes/collections
    const collections = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.pinecone.listIndexes(id)
    }, profileId)

    expect(Array.isArray(collections)).toBe(true)
  })

  // TODO: Re-enable when multi-database adapter system is integrated into backend
  test.skip('should create test collection in Weaviate', async () => {
    const { page } = electronContext
    const profileId = await createWeaviateTestProfile(page)
    await connectToProfile(page, profileId)

    const collectionName = `TestCollection${Date.now()}`

    // Create a test collection
    await page.evaluate(
      async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.createIndex(id, {
          name,
          dimension: 384,
          metric: 'cosine',
          spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
        })
      },
      { id: profileId, name: collectionName }
    )

    // Wait for collection to be created
    await page.waitForTimeout(2000)

    // Verify collection exists
    const collections = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.pinecone.listIndexes(id)
    }, profileId)

    expect(collections).toContainEqual(expect.objectContaining({ name: collectionName }))

    // Clean up - delete the test collection
    await page.evaluate(
      async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.deleteIndex(id, name)
      },
      { id: profileId, name: collectionName }
    )
  })
})
