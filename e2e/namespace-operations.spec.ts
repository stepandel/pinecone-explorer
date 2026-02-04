import { test, expect } from '@playwright/test'
import {
  launchElectronApp,
  closeElectronApp,
  cleanupTestProfiles,
  createPineconeTestProfile,
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

test.describe('E2E-004: Namespace Operations Tests', () => {
  test.describe('Pinecone Namespace Management', () => {
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
          'Namespace Operations Test',
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

        // Get the first available index to use for testing
        const indexes = await page.evaluate(async (id) => {
          return await (window as any).electronAPI.pinecone.listIndexes(id)
        }, testProfileId)

        if (indexes.length > 0) {
          testIndexName = indexes[0].name
        }
      }
    })

    test('should list namespaces in an index via stats', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get index stats which includes namespace information
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Verify stats structure contains namespaces
      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('namespaces')
      expect(typeof stats.namespaces).toBe('object')

      // Each namespace should have vectorCount
      for (const [namespaceName, namespaceData] of Object.entries(stats.namespaces as Record<string, any>)) {
        expect(namespaceData).toHaveProperty('vectorCount')
        expect(typeof namespaceData.vectorCount).toBe('number')
        expect(namespaceData.vectorCount).toBeGreaterThanOrEqual(0)
      }

      // Default namespace (empty string) might exist
      const hasDefaultNamespace = '' in stats.namespaces
      if (hasDefaultNamespace) {
        expect(stats.namespaces['']).toHaveProperty('vectorCount')
      }
    })

    test('should display namespace stats with vector counts', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get detailed stats
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Verify total vector count is sum of all namespaces
      expect(stats.totalVectorCount).toBeDefined()
      expect(typeof stats.totalVectorCount).toBe('number')

      // Calculate sum from namespaces
      const namespacesSum = Object.values(stats.namespaces as Record<string, any>)
        .reduce((sum, ns) => sum + ns.vectorCount, 0)

      // Total should match sum of namespaces
      expect(stats.totalVectorCount).toBe(namespacesSum)

      // Verify dimension is consistent across index
      expect(stats.dimension).toBeDefined()
      expect(typeof stats.dimension).toBe('number')
      expect(stats.dimension).toBeGreaterThan(0)
    })

    test('should create a test namespace with vectors for duplication tests', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get index info to determine dimension
      const indexes = await page.evaluate(async (id) => {
        return await (window as any).electronAPI.pinecone.listIndexes(id)
      }, testProfileId)

      const testIndex = indexes.find((idx: any) => idx.name === testIndexName)
      if (!testIndex || !testIndex.dimension) {
        test.skip()
        return
      }

      const dimension = testIndex.dimension

      // Create test namespace with a few vectors
      const testNamespace = `test-ns-${Date.now()}`
      const testVectors = [
        {
          id: `test-vec-1`,
          values: Array(dimension).fill(0).map(() => Math.random()),
          metadata: { test: true, index: 1 },
        },
        {
          id: `test-vec-2`,
          values: Array(dimension).fill(0).map(() => Math.random()),
          metadata: { test: true, index: 2 },
        },
      ]

      // Upsert vectors to create namespace
      await page.evaluate(async ({ id, indexName, namespace, vectors }) => {
        for (const vector of vectors) {
          await (window as any).electronAPI.pinecone.createVector(id, {
            indexName,
            namespace,
            id: vector.id,
            values: vector.values,
            metadata: vector.metadata,
          })
        }
      }, {
        id: testProfileId,
        indexName: testIndexName,
        namespace: testNamespace,
        vectors: testVectors,
      })

      // Wait for vectors to be indexed
      await page.waitForTimeout(3000)

      // Verify namespace was created by checking stats
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      expect(stats.namespaces[testNamespace]).toBeDefined()
      expect(stats.namespaces[testNamespace].vectorCount).toBe(testVectors.length)
    })

    test('should select namespace to view vectors', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get available namespaces
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      const namespaceNames = Object.keys(stats.namespaces)
      if (namespaceNames.length === 0) {
        test.skip()
        return
      }

      // Select first namespace
      const selectedNamespace = namespaceNames[0]

      // Get vectors from that namespace
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          10 // limit to 10 vectors
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: selectedNamespace })

      // Verify vectors are returned
      expect(Array.isArray(vectors)).toBe(true)

      // If namespace has vectors, verify structure
      if (stats.namespaces[selectedNamespace].vectorCount > 0) {
        expect(vectors.length).toBeGreaterThan(0)

        // Verify vector structure
        const firstVector = vectors[0]
        expect(firstVector).toHaveProperty('id')
        expect(firstVector).toHaveProperty('values')
        expect(typeof firstVector.id).toBe('string')
        expect(Array.isArray(firstVector.values)).toBe(true)
      } else {
        expect(vectors.length).toBe(0)
      }
    })

    test('should duplicate/clone namespace within same index', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get stats to find a namespace with vectors
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Find a namespace with vectors
      let sourceNamespace: string | null = null
      for (const [name, data] of Object.entries(stats.namespaces as Record<string, any>)) {
        if (data.vectorCount > 0) {
          sourceNamespace = name
          break
        }
      }

      if (sourceNamespace === null) {
        test.skip()
        return
      }

      const targetNamespace = `cloned-ns-${Date.now()}`

      // Start cloning operation
      const clonePromise = page.evaluate(async ({ id, indexName, source, target }) => {
        return await (window as any).electronAPI.pinecone.cloneNamespace(id, {
          indexName,
          sourceNamespace: source,
          targetNamespace: target,
        })
      }, {
        id: testProfileId,
        indexName: testIndexName,
        source: sourceNamespace,
        target: targetNamespace,
      })

      // Wait for clone to complete
      const result = await clonePromise

      // Verify clone succeeded
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.copiedVectors).toBeGreaterThan(0)

      // Wait for indexing
      await page.waitForTimeout(3000)

      // Verify target namespace was created
      const newStats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      expect(newStats.namespaces[targetNamespace]).toBeDefined()
      expect(newStats.namespaces[targetNamespace].vectorCount).toBeGreaterThan(0)

      // Verify vector counts match
      const sourceCount = stats.namespaces[sourceNamespace].vectorCount
      const targetCount = newStats.namespaces[targetNamespace].vectorCount
      expect(targetCount).toBe(sourceCount)
    })

    test('should track duplicate namespace progress', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get stats to find a namespace with vectors
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Find a namespace with vectors
      let sourceNamespace: string | null = null
      for (const [name, data] of Object.entries(stats.namespaces as Record<string, any>)) {
        if (data.vectorCount > 0) {
          sourceNamespace = name
          break
        }
      }

      if (sourceNamespace === null) {
        test.skip()
        return
      }

      const targetNamespace = `progress-test-${Date.now()}`

      // Set up progress tracking
      const progressEvents: any[] = []
      await page.evaluate(() => {
        (window as any).__progressEvents = []
        const unsubscribe = (window as any).electronAPI.pinecone.onCloneNamespaceProgress((progress: any) => {
          (window as any).__progressEvents.push({ ...progress })
        })
        ;(window as any).__progressUnsubscribe = unsubscribe
      })

      // Start cloning operation
      await page.evaluate(async ({ id, indexName, source, target }) => {
        return await (window as any).electronAPI.pinecone.cloneNamespace(id, {
          indexName,
          sourceNamespace: source,
          targetNamespace: target,
        })
      }, {
        id: testProfileId,
        indexName: testIndexName,
        source: sourceNamespace,
        target: targetNamespace,
      })

      // Get collected progress events
      const events = await page.evaluate(() => {
        const events = (window as any).__progressEvents
        ;(window as any).__progressUnsubscribe?.()
        return events
      })

      // Verify progress events were emitted
      expect(events.length).toBeGreaterThan(0)

      // Verify progress event structure
      for (const event of events) {
        expect(event).toHaveProperty('phase')
        expect(event).toHaveProperty('totalVectors')
        expect(event).toHaveProperty('processedVectors')
        expect(event).toHaveProperty('message')
        expect(['copying', 'complete', 'error', 'cancelled']).toContain(event.phase)
        expect(typeof event.totalVectors).toBe('number')
        expect(typeof event.processedVectors).toBe('number')
        expect(typeof event.message).toBe('string')
      }

      // Last event should be complete
      const lastEvent = events[events.length - 1]
      expect(lastEvent.phase).toBe('complete')
    })

    test('should cancel namespace duplication in progress', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get stats to find a namespace with many vectors for cancellation test
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Find a namespace with vectors
      let sourceNamespace: string | null = null
      for (const [name, data] of Object.entries(stats.namespaces as Record<string, any>)) {
        if (data.vectorCount > 0) {
          sourceNamespace = name
          break
        }
      }

      if (sourceNamespace === null) {
        test.skip()
        return
      }

      const targetNamespace = `cancel-test-${Date.now()}`

      // Set up progress tracking to detect when copying starts
      await page.evaluate(() => {
        (window as any).__copyingStarted = false
        const unsubscribe = (window as any).electronAPI.pinecone.onCloneNamespaceProgress((progress: any) => {
          if (progress.phase === 'copying') {
            (window as any).__copyingStarted = true
          }
        })
        ;(window as any).__cancelUnsubscribe = unsubscribe
      })

      // Start cloning operation (don't await)
      const clonePromise = page.evaluate(async ({ id, indexName, source, target }) => {
        return await (window as any).electronAPI.pinecone.cloneNamespace(id, {
          indexName,
          sourceNamespace: source,
          targetNamespace: target,
        })
      }, {
        id: testProfileId,
        indexName: testIndexName,
        source: sourceNamespace,
        target: targetNamespace,
      })

      // Wait for copying to start
      await page.waitForFunction(() => (window as any).__copyingStarted === true, { timeout: 5000 })

      // Cancel the operation
      await page.evaluate(async (id) => {
        await (window as any).electronAPI.pinecone.cancelCloneNamespace(id)
      }, testProfileId)

      // Wait for clone to complete (should be cancelled)
      const result = await clonePromise

      // Clean up listener
      await page.evaluate(() => {
        ;(window as any).__cancelUnsubscribe?.()
      })

      // Verify clone was cancelled or returned partial results
      expect(result).toBeDefined()
      // Result could be success with partial vectors or error with cancellation message
      if (result.success) {
        // Partial copy succeeded before cancellation
        expect(result.copiedVectors).toBeGreaterThanOrEqual(0)
      } else {
        // Cancellation was caught as error
        expect(result.error).toBeDefined()
      }
    })

    test('should handle empty namespace listing', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey) {
        test.skip()
        return
      }

      // Create a new empty index for this test
      const emptyIndexName = `empty-test-${Date.now()}`

      await page.evaluate(async ({ id, params }) => {
        await (window as any).electronAPI.pinecone.createIndex(id, params)
      }, {
        id: testProfileId,
        params: {
          name: emptyIndexName,
          dimension: 384,
          metric: 'cosine' as const,
          serverlessSpec: {
            cloud: 'aws' as const,
            region: 'us-east-1',
          },
        },
      })

      // Wait for index to be ready
      await page.waitForTimeout(10000)

      // Get stats for empty index
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: emptyIndexName })

      // Empty index should have no namespaces or empty namespaces object
      expect(stats.namespaces).toBeDefined()
      expect(typeof stats.namespaces).toBe('object')
      expect(stats.totalVectorCount).toBe(0)

      // Clean up: delete the empty test index
      await page.waitForTimeout(5000)
      await page.evaluate(async ({ id, name }) => {
        await (window as any).electronAPI.pinecone.deleteIndex(id, name)
      }, { id: testProfileId, name: emptyIndexName })
    })

    test('should handle duplicate namespace with empty source', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Try to clone an empty/non-existent namespace
      const sourceNamespace = `nonexistent-${Date.now()}`
      const targetNamespace = `target-empty-${Date.now()}`

      const result = await page.evaluate(async ({ id, indexName, source, target }) => {
        try {
          return await (window as any).electronAPI.pinecone.cloneNamespace(id, {
            indexName,
            sourceNamespace: source,
            targetNamespace: target,
          })
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }, {
        id: testProfileId,
        indexName: testIndexName,
        source: sourceNamespace,
        target: targetNamespace,
      })

      // Should succeed with 0 vectors copied or return error
      if (result.success) {
        expect(result.copiedVectors).toBe(0)
      } else {
        expect(result.error).toBeDefined()
      }
    })

    test('should refresh namespace stats after operations', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get initial stats
      const initialStats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      const initialNamespaceCount = Object.keys(initialStats.namespaces).length

      // Wait a moment
      await page.waitForTimeout(1000)

      // Refresh stats
      const refreshedStats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // Verify stats are consistent
      expect(refreshedStats.namespaces).toBeDefined()
      expect(typeof refreshedStats.namespaces).toBe('object')
      expect(refreshedStats.dimension).toBe(initialStats.dimension)

      // Namespace count should be same or changed due to test operations
      const refreshedNamespaceCount = Object.keys(refreshedStats.namespaces).length
      expect(refreshedNamespaceCount).toBeGreaterThanOrEqual(initialNamespaceCount)
    })

    test('should show correct vector count per namespace', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Get stats
      const stats = await page.evaluate(async ({ id, name }) => {
        return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
      }, { id: testProfileId, name: testIndexName })

      // For each namespace, verify vector count is accurate by fetching vectors
      for (const [namespaceName, namespaceData] of Object.entries(stats.namespaces as Record<string, any>)) {
        if (namespaceData.vectorCount > 0) {
          // Fetch vectors from namespace
          const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
            return await (window as any).electronAPI.pinecone.getAllVectors(
              id,
              indexName,
              namespace,
              100 // limit to avoid timeout
            )
          }, { id: testProfileId, indexName: testIndexName, namespace: namespaceName })

          // Should have vectors
          expect(vectors.length).toBeGreaterThan(0)
          expect(vectors.length).toBeLessThanOrEqual(namespaceData.vectorCount)

          // If we got all vectors (less than limit), count should match
          if (vectors.length < 100) {
            expect(vectors.length).toBe(namespaceData.vectorCount)
          }
        }
      }
    })
  })
})
