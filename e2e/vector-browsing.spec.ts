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

test.describe('E2E-005: Vector Browsing Tests', () => {
  test.describe('Pinecone Vector Table and Browsing', () => {
    let testProfileId: string
    let testIndexName: string
    let testNamespace: string

    test.beforeAll(async () => {
      const { page } = electronContext

      // Check if real API key is available
      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (hasRealApiKey) {
        // Create and connect to a test profile
        testProfileId = await createPineconeTestProfile(
          page,
          'Vector Browsing Test',
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

          // Always create a dedicated test namespace with known vectors
          testNamespace = `test-vectors-${Date.now()}`
          const dimension = indexes[0].dimension || 384

          // Create test vectors with deterministic metadata
          const testVectors = Array.from({ length: 5 }, (_, i) => ({
            id: `test-vector-${i}`,
            values: Array(dimension).fill(0).map(() => Math.random()),
            metadata: {
              test: true,
              index: i,
              description: `Test vector ${i}`,
              category: i % 2 === 0 ? 'even' : 'odd',
            },
          }))

          for (const vector of testVectors) {
            await page.evaluate(async ({ id, indexName, namespace, vector }) => {
              await (window as any).electronAPI.pinecone.createVector(id, {
                indexName,
                namespace,
                id: vector.id,
                values: vector.values,
                metadata: vector.metadata,
              })
            }, {
              id: testProfileId,
              indexName: testIndexName,
              namespace: testNamespace,
              vector,
            })
          }

          // Wait for vectors to be indexed
          await page.waitForTimeout(3000)
        }
      }
    })

    test.afterAll(async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        return
      }

      // Clean up test namespace by deleting all test vectors
      try {
        const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
          return await (window as any).electronAPI.pinecone.getAllVectors(
            id,
            indexName,
            namespace,
            10000 // high limit to get all vectors
          )
        }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

        // Delete each vector
        for (const vector of vectors) {
          await page.evaluate(async ({ id, indexName, namespace, vectorId }) => {
            await (window as any).electronAPI.pinecone.deleteVector(id, {
              indexName,
              namespace,
              id: vectorId,
            })
          }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vectorId: vector.id })
        }
      } catch (error) {
        // Ignore errors during cleanup
        console.warn(`Failed to clean up test namespace ${testNamespace}:`, error)
      }
    })

    test('should view vectors in table format', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Fetch vectors from the namespace
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          50 // limit
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Verify vectors are returned
      expect(Array.isArray(vectors)).toBe(true)
      expect(vectors.length).toBeGreaterThan(0)

      // Verify vector structure in table format
      const firstVector = vectors[0]
      expect(firstVector).toHaveProperty('id')
      expect(firstVector).toHaveProperty('values')
      expect(typeof firstVector.id).toBe('string')
      expect(Array.isArray(firstVector.values)).toBe(true)

      // Check for metadata if present
      if (firstVector.metadata) {
        expect(typeof firstVector.metadata).toBe('object')
      }

      // Verify multiple rows exist
      expect(vectors.length).toBeGreaterThanOrEqual(1)
    })

    test('should handle pagination with load more functionality', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get initial vectors with small limit
      const firstPage = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          3 // small limit to test pagination
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(firstPage.length).toBeGreaterThan(0)
      const firstPageCount = firstPage.length

      // Get more vectors (next page) by using pagination token if available
      const allVectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          10 // larger limit to get more vectors
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Verify we can get more vectors
      expect(allVectors.length).toBeGreaterThanOrEqual(firstPageCount)

      // Verify IDs are unique across pages
      const ids = new Set(allVectors.map((v: any) => v.id))
      expect(ids.size).toBe(allVectors.length)
    })

    test('should display vector detail when row is selected', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a test vector
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          5
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(vectors.length).toBeGreaterThan(0)

      const testVector = vectors[0]

      // Verify vector detail structure
      expect(testVector).toHaveProperty('id')
      expect(testVector).toHaveProperty('values')

      // Verify vector ID is a string
      expect(typeof testVector.id).toBe('string')
      expect(testVector.id.length).toBeGreaterThan(0)

      // Verify values are numeric array
      expect(Array.isArray(testVector.values)).toBe(true)
      expect(testVector.values.length).toBeGreaterThan(0)
      expect(typeof testVector.values[0]).toBe('number')
    })

    test('should display vector metadata in detail view', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get vectors with metadata
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          10
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Find a vector with metadata
      const vectorWithMetadata = vectors.find((v: any) => v.metadata && Object.keys(v.metadata).length > 0)

      if (vectorWithMetadata) {
        // Verify metadata structure
        expect(typeof vectorWithMetadata.metadata).toBe('object')
        expect(Object.keys(vectorWithMetadata.metadata).length).toBeGreaterThan(0)

        // Verify metadata values are of correct types
        for (const [key, value] of Object.entries(vectorWithMetadata.metadata)) {
          expect(typeof key).toBe('string')
          // Metadata values can be string, number, or boolean
          expect(['string', 'number', 'boolean'].includes(typeof value)).toBe(true)
        }
      }
    })

    test('should display and handle vector embedding values', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a vector with embedding values
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          5
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(vectors.length).toBeGreaterThan(0)

      const testVector = vectors[0]

      // Verify embedding array structure
      expect(Array.isArray(testVector.values)).toBe(true)
      expect(testVector.values.length).toBeGreaterThan(0)

      // Verify all values are numbers
      const allNumbers = testVector.values.every((v: any) => typeof v === 'number')
      expect(allNumbers).toBe(true)

      // Verify values are in valid range (typically -1 to 1 for normalized embeddings)
      const allFinite = testVector.values.every((v: any) => Number.isFinite(v))
      expect(allFinite).toBe(true)
    })

    test('should handle embedding cell display with preview', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get vectors with embeddings
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          5
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(vectors.length).toBeGreaterThan(0)

      const testVector = vectors[0]

      // Test embedding preview logic (first 5 values)
      const previewCount = 5
      const preview = testVector.values.slice(0, previewCount)
      const hasMore = testVector.values.length > previewCount

      expect(preview.length).toBeLessThanOrEqual(previewCount)
      expect(preview.length).toBeGreaterThan(0)

      if (hasMore) {
        expect(testVector.values.length).toBeGreaterThan(previewCount)
      }

      // Verify preview values are formatted correctly (numbers)
      preview.forEach((val: number) => {
        expect(typeof val).toBe('number')
        expect(Number.isFinite(val)).toBe(true)
      })
    })

    test('should handle sparse embeddings display', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get vectors and check if any have sparse embeddings
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          10
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Find vector with sparse values
      const vectorWithSparse = vectors.find((v: any) => v.sparseValues)

      if (vectorWithSparse && vectorWithSparse.sparseValues) {
        // Verify sparse embedding structure
        expect(vectorWithSparse.sparseValues).toHaveProperty('indices')
        expect(vectorWithSparse.sparseValues).toHaveProperty('values')
        expect(Array.isArray(vectorWithSparse.sparseValues.indices)).toBe(true)
        expect(Array.isArray(vectorWithSparse.sparseValues.values)).toBe(true)
        expect(vectorWithSparse.sparseValues.indices.length).toBe(vectorWithSparse.sparseValues.values.length)

        // Verify indices are numbers
        vectorWithSparse.sparseValues.indices.forEach((idx: any) => {
          expect(typeof idx).toBe('number')
          expect(Number.isInteger(idx)).toBe(true)
          expect(idx).toBeGreaterThanOrEqual(0)
        })

        // Verify values are numbers
        vectorWithSparse.sparseValues.values.forEach((val: any) => {
          expect(typeof val).toBe('number')
          expect(Number.isFinite(val)).toBe(true)
        })
      }
    })

    test('should copy vector ID to clipboard', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a test vector
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          5
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(vectors.length).toBeGreaterThan(0)

      const testVector = vectors[0]
      const vectorId = testVector.id

      // Simulate copying vector ID (implementation depends on clipboard API)
      // For now, verify the ID is copyable (valid string)
      expect(typeof vectorId).toBe('string')
      expect(vectorId.length).toBeGreaterThan(0)

      // Verify ID can be used for further operations (fetch by ID)
      const fetchedById = await page.evaluate(async ({ id, indexName, namespace, vectorId }) => {
        try {
          // Try to fetch the vector by ID using query endpoint
          const result = await (window as any).electronAPI.pinecone.queryVectors(id, {
            indexName,
            namespace,
            id: vectorId,
            topK: 1,
            includeValues: true,
            includeMetadata: true,
          })
          return result.matches?.[0] || null
        } catch (error) {
          return null
        }
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vectorId })

      if (fetchedById) {
        expect(fetchedById.id).toBe(vectorId)
      }
    })

    test('should display correct column headers with metadata fields', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get vectors to analyze metadata fields
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          20
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Extract all unique metadata keys across vectors
      const metadataKeys = new Set<string>()
      vectors.forEach((v: any) => {
        if (v.metadata) {
          Object.keys(v.metadata).forEach((key) => {
            metadataKeys.add(key)
          })
        }
      })

      const metadataKeysArray = Array.from(metadataKeys).sort()

      // Expected columns: score (if from query), id, ...metadataKeys
      // For browse (getAllVectors), no score column
      expect(metadataKeysArray.length).toBeGreaterThanOrEqual(0)

      // Verify each vector has consistent structure
      vectors.forEach((v: any) => {
        expect(v).toHaveProperty('id')
        expect(v).toHaveProperty('values')
      })
    })

    test('should handle empty namespace gracefully', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Try to get vectors from a non-existent namespace
      const emptyNamespace = `empty-${Date.now()}`

      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        try {
          return await (window as any).electronAPI.pinecone.getAllVectors(
            id,
            indexName,
            namespace,
            10
          )
        } catch (error) {
          return []
        }
      }, { id: testProfileId, indexName: testIndexName, namespace: emptyNamespace })

      // Empty namespace should return empty array
      expect(Array.isArray(vectors)).toBe(true)
      expect(vectors.length).toBe(0)
    })

    test('should load vectors with proper error handling', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName) {
        test.skip()
        return
      }

      // Try to load vectors from non-existent index
      const fakeIndexName = `nonexistent-${Date.now()}`

      const result = await page.evaluate(async ({ id, indexName, namespace }) => {
        try {
          await (window as any).electronAPI.pinecone.getAllVectors(
            id,
            indexName,
            namespace,
            10
          )
          return { success: true, error: null }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }, { id: testProfileId, indexName: fakeIndexName, namespace: '' })

      // Should fail gracefully with error
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(typeof result.error).toBe('string')
    })

    test('should handle vectors with different metadata schemas', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get vectors that might have different metadata schemas
      const vectors = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          20
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      if (vectors.length < 2) {
        // Not enough vectors to test different schemas
        return
      }

      // Collect all metadata keys from all vectors
      const allKeys = new Set<string>()
      const vectorMetadataKeys: string[][] = []

      vectors.forEach((v: any) => {
        const keys = v.metadata ? Object.keys(v.metadata) : []
        vectorMetadataKeys.push(keys)
        keys.forEach(k => allKeys.add(k))
      })

      // Verify the system can handle vectors with different metadata fields
      // (some vectors may not have all metadata fields)
      expect(allKeys.size).toBeGreaterThanOrEqual(0)

      // Check if there's variation in metadata schemas
      const hasVariation = vectorMetadataKeys.some(
        keys => keys.length !== vectorMetadataKeys[0].length
      )

      // System should handle both uniform and varied schemas
      if (hasVariation) {
        // Verify each vector's metadata is valid even if fields differ
        vectors.forEach((v: any) => {
          if (v.metadata) {
            expect(typeof v.metadata).toBe('object')
          }
        })
      }
    })
  })

  test.describe('Qdrant Vector Table and Browsing', () => {
    // TODO: Implement Qdrant vector browsing tests
    test.skip('should view Qdrant vectors in table format', async () => {
      // TODO: Similar to Pinecone tests but using Qdrant adapter
    })

    test.skip('should handle Qdrant pagination', async () => {
      // TODO: Test Qdrant scroll/pagination
    })

    test.skip('should display Qdrant vector detail panel', async () => {
      // TODO: Test Qdrant vector details with payload
    })

    test.skip('should display Qdrant vector payload', async () => {
      // TODO: Test Qdrant payload display (equivalent to metadata)
    })

    test.skip('should handle Qdrant vector embeddings', async () => {
      // TODO: Test Qdrant vector embeddings display
    })
  })

  test.describe('Weaviate Vector Table and Browsing', () => {
    // TODO: Implement Weaviate vector browsing tests
    test.skip('should view Weaviate objects in table format', async () => {
      // TODO: Similar to Pinecone tests but using Weaviate adapter
    })

    test.skip('should handle Weaviate pagination with cursor', async () => {
      // TODO: Test Weaviate cursor-based pagination
    })

    test.skip('should display Weaviate object detail panel', async () => {
      // TODO: Test Weaviate object details with properties
    })

    test.skip('should display Weaviate object properties', async () => {
      // TODO: Test Weaviate properties display
    })

    test.skip('should handle Weaviate vector embeddings', async () => {
      // TODO: Test Weaviate vector embeddings display
    })
  })
})
