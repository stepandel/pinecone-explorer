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

test.describe('E2E-003: Index/Collection Management Tests', () => {
  test.describe('Pinecone Index Management', () => {
    let testProfileId: string
    let testIndexName: string

    test.beforeAll(async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (hasRealApiKey) {
        // Create and connect to a test profile
        testProfileId = await createPineconeTestProfile(
          page,
          'Index Management Test',
          process.env.PINECONE_API_KEY
        )

        await page.evaluate(async (id) => {
          const profiles = await (window as any).electronAPI.profiles.getAll()
          const profile = profiles.find((p: any) => p.id === id)
          if (profile) {
            await (window as any).electronAPI.pinecone.connect(id, profile)
          }
        }, testProfileId)

        // Wait for connection to establish
        await page.waitForTimeout(2000)
      }
    })

    test('should list indexes after connecting', async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // List indexes via IPC
      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      // Verify indexes list structure
      expect(Array.isArray(indexes)).toBe(true)

      // Each index should have required properties
      if (indexes.length > 0) {
        const firstIndex = indexes[0]
        expect(firstIndex).toHaveProperty('name')
        expect(firstIndex).toHaveProperty('dimension')
        expect(firstIndex).toHaveProperty('metric')
        expect(firstIndex).toHaveProperty('host')
        expect(typeof firstIndex.name).toBe('string')
        expect(typeof firstIndex.metric).toBe('string')
      }
    })

    test('should refresh indexes list', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // List indexes twice to verify refresh functionality
      const indexes1 = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      // Wait a moment
      await page.waitForTimeout(500)

      const indexes2 = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      // Both calls should succeed and return consistent data
      expect(Array.isArray(indexes1)).toBe(true)
      expect(Array.isArray(indexes2)).toBe(true)
      expect(indexes1.length).toBe(indexes2.length)
    })

    test('should view index stats (vector count, dimensions)', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Get list of indexes first
      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      // If there are indexes, get stats for the first one
      if (indexes.length > 0) {
        const indexName = indexes[0].name

        const stats = await page.evaluate(async ({ id, name }) => {
          return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
        }, { id: testProfileId, name: indexName })

        // Verify stats structure
        expect(stats).toBeDefined()
        expect(stats).toHaveProperty('namespaces')
        expect(stats).toHaveProperty('dimension')
        expect(stats).toHaveProperty('totalVectorCount')
        expect(typeof stats.namespaces).toBe('object')
        expect(typeof stats.dimension).toBe('number')
        expect(typeof stats.totalVectorCount).toBe('number')

        // Verify dimension matches index info
        expect(stats.dimension).toBe(indexes[0].dimension)
      }
    })

    test.describe.serial('Index Create/Delete Operations', () => {
      test('should create new index with provider-specific settings', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Generate unique index name
      testIndexName = `test-index-${Date.now()}`

      // Create index with specific settings
      const createParams = {
        name: testIndexName,
        dimension: 384, // Standard embedding dimension
        metric: 'cosine' as const,
        textField: '_text',
        serverlessSpec: {
          cloud: 'aws' as const,
          region: 'us-east-1',
        },
      }

      await page.evaluate(async ({ id, params }) => {
        await (window as any).electronAPI.pinecone.createIndex(id, params)
      }, { id: testProfileId, params: createParams })

      // Poll for index to become ready (can take 30-60+ seconds for serverless)
      let createdIndex: any
      await expect(async () => {
        const indexes = await page.evaluate(async (id) => {
          return await (window as any).electronAPI.pinecone.listIndexes(id)
        }, testProfileId)
        createdIndex = indexes.find((idx: any) => idx.name === testIndexName)
        expect(createdIndex).toBeDefined()
        expect(createdIndex?.status?.ready).toBe(true)
      }).toPass({ timeout: 90000, intervals: [5000] })

      expect(createdIndex).toBeDefined()
      expect(createdIndex?.dimension).toBe(384)
      expect(createdIndex?.metric).toBe('cosine')
      })

      test('should delete index (with confirmation flow)', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Ensure we have an index to delete (from previous test)
      if (!testIndexName) {
        test.skip()
        return
      }

      // Poll to ensure index is fully ready before deletion
      await expect(async () => {
        const indexes = await page.evaluate(async (id) => {
          return await (window as any).electronAPI.pinecone.listIndexes(id)
        }, testProfileId)
        const index = indexes.find((idx: any) => idx.name === testIndexName)
        expect(index).toBeDefined()
        expect(index?.status?.ready).toBe(true)
      }).toPass({ timeout: 30000, intervals: [2000] })

      // Delete the test index
      await page.evaluate(async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.deleteIndex(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Poll to verify index was deleted
      await expect(async () => {
        const indexes = await page.evaluate(async (id) => {
          return await (window as any).electronAPI.pinecone.listIndexes(id)
        }, testProfileId)
        const deletedIndex = indexes.find((idx: any) => idx.name === testIndexName)
        expect(deletedIndex).toBeUndefined()
      }).toPass({ timeout: 30000, intervals: [2000] })
      })
    })

    test('should handle index stats for empty index', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Get indexes
      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      if (indexes.length > 0) {
        const indexName = indexes[0].name

        const stats = await page.evaluate(async ({ id, name }) => {
          return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
        }, { id: testProfileId, name: indexName })

        // Even empty indexes should return valid stats
        expect(stats).toBeDefined()
        expect(stats.totalVectorCount).toBeGreaterThanOrEqual(0)
        expect(stats.dimension).toBeGreaterThan(0)
      }
    })

    test('should handle errors when getting stats for non-existent index', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Try to get stats for a non-existent index
      const nonExistentName = 'non-existent-index-12345'

      const statsError = await page.evaluate(async ({ id, name }) => {
        try {
          await (window as any).electronAPI.pinecone.getIndexStats(id, name)
          return null
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      }, { id: testProfileId, name: nonExistentName })

      // Should throw an error
      expect(statsError).not.toBeNull()
      expect(typeof statsError).toBe('string')
    })

    test('should list indexes with correct properties', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      // Verify each index has the expected structure
      for (const index of indexes) {
        expect(index.name).toBeTruthy()
        expect(typeof index.name).toBe('string')

        // Dimension can be undefined for sparse indexes
        if (index.dimension !== undefined) {
          expect(typeof index.dimension).toBe('number')
          expect(index.dimension).toBeGreaterThan(0)
        }

        // Metric should be one of the supported types
        expect(['cosine', 'euclidean', 'dotproduct']).toContain(index.metric)

        // Host should be present for serverless indexes
        if (index.host) {
          expect(typeof index.host).toBe('string')
          expect(index.host).toContain('pinecone.io')
        }
      }
    })
  })

  test.describe('Qdrant Collection Management', () => {
    // TODO: Enable when adapter system is integrated into backend
    test.skip('should list collections after connecting', async () => {
      const { page } = electronContext

      // Create and connect to Qdrant profile
      const profileId = await createQdrantTestProfile(
        page,
        'Qdrant Collection Test',
        process.env.QDRANT_URL || 'http://localhost:6333'
      )

      // TODO: Implement when Qdrant adapter is integrated
      // This test will:
      // 1. Connect to Qdrant instance
      // 2. List collections via window.electronAPI.qdrant.listCollections()
      // 3. Verify collection structure (name, vectors_count, config, etc.)

      expect(profileId).toBeDefined()
    })

    test.skip('should view collection stats', async () => {
      const { page } = electronContext

      // TODO: Implement when Qdrant adapter is integrated
      // This test will:
      // 1. Get collection stats
      // 2. Verify vector count, dimensions, distance metric
      // 3. Verify payload schema information
    })

    test.skip('should create new collection with Qdrant-specific settings', async () => {
      const { page } = electronContext

      // TODO: Implement when Qdrant adapter is integrated
      // This test will:
      // 1. Create collection with specific vector config
      // 2. Set distance metric (Cosine, Euclid, Dot)
      // 3. Configure optional features (on-disk payload, quantization)
      // 4. Verify collection was created
    })

    test.skip('should delete collection with confirmation', async () => {
      const { page } = electronContext

      // TODO: Implement when Qdrant adapter is integrated
      // This test will:
      // 1. Create a test collection
      // 2. Delete it
      // 3. Verify it no longer appears in collections list
    })

    test.skip('should refresh collections list', async () => {
      const { page } = electronContext

      // TODO: Implement when Qdrant adapter is integrated
      // Test refresh functionality for Qdrant collections
    })
  })

  test.describe('Weaviate Class Management', () => {
    // TODO: Enable when adapter system is integrated into backend
    test.skip('should list classes after connecting', async () => {
      const { page } = electronContext

      // Create and connect to Weaviate profile
      const profileId = await createWeaviateTestProfile(
        page,
        'Weaviate Class Test',
        process.env.WEAVIATE_URL || 'http://localhost:8080'
      )

      // TODO: Implement when Weaviate adapter is integrated
      // This test will:
      // 1. Connect to Weaviate instance
      // 2. List classes via window.electronAPI.weaviate.listClasses()
      // 3. Verify class structure (name, properties, vectorizer, etc.)

      expect(profileId).toBeDefined()
    })

    test.skip('should view class stats', async () => {
      const { page } = electronContext

      // TODO: Implement when Weaviate adapter is integrated
      // This test will:
      // 1. Get class stats/metadata
      // 2. Verify object count, vector index type
      // 3. Verify property schema
    })

    test.skip('should create new class with Weaviate-specific settings', async () => {
      const { page } = electronContext

      // TODO: Implement when Weaviate adapter is integrated
      // This test will:
      // 1. Create class with schema definition
      // 2. Set vectorizer (none, text2vec-contextionary, etc.)
      // 3. Configure distance metric
      // 4. Define properties with data types
      // 5. Verify class was created
    })

    test.skip('should delete class with confirmation', async () => {
      const { page } = electronContext

      // TODO: Implement when Weaviate adapter is integrated
      // This test will:
      // 1. Create a test class
      // 2. Delete it
      // 3. Verify it no longer appears in classes list
    })

    test.skip('should refresh classes list', async () => {
      const { page } = electronContext

      // TODO: Implement when Weaviate adapter is integrated
      // Test refresh functionality for Weaviate classes
    })
  })

  test.describe('Cross-Provider Index/Collection Listing', () => {
    test.skip('should handle empty collections/indexes list', async () => {
      const { page } = electronContext

      // TODO: Test with a fresh database instance with no collections
      // Verify UI handles empty state gracefully
    })

    test.skip('should display provider-specific metadata correctly', async () => {
      const { page } = electronContext

      // TODO: Verify each provider shows appropriate metadata:
      // - Pinecone: serverless vs pod spec, cloud/region
      // - Qdrant: on-disk config, quantization
      // - Weaviate: vectorizer, module config
    })

    test.skip('should handle very large collection lists efficiently', async () => {
      const { page } = electronContext

      // TODO: Test performance with many collections (50+)
      // Verify UI remains responsive
    })
  })
})
