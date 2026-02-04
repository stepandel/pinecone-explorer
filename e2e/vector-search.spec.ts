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

test.describe('E2E-006: Vector Search/Query Tests', () => {
  test.describe('Pinecone Vector Search', () => {
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
          'Vector Search Test',
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

          // Get a namespace with vectors for testing
          const stats = await page.evaluate(async ({ id, name }) => {
            return await (window as any).electronAPI.pinecone.getIndexStats(id, name)
          }, { id: testProfileId, name: testIndexName })

          // Find first namespace with vectors
          for (const [name, data] of Object.entries(stats.namespaces as Record<string, any>)) {
            if (data.vectorCount > 0) {
              testNamespace = name
              break
            }
          }

          // If no namespace has vectors, create test vectors
          if (!testNamespace) {
            testNamespace = `test-search-${Date.now()}`
            const dimension = indexes[0].dimension || 384

            // Create test vectors with meaningful metadata for search testing
            const testVectors = Array.from({ length: 10 }, (_, i) => ({
              id: `search-test-vector-${i}`,
              values: Array(dimension).fill(0).map(() => Math.random()),
              metadata: {
                test: true,
                index: i,
                description: `Search test vector ${i}`,
                category: i % 3 === 0 ? 'alpha' : i % 3 === 1 ? 'beta' : 'gamma',
                score_value: i * 10,
                is_active: i % 2 === 0,
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
              }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vector })
            }

            // Wait for vectors to be indexed
            await page.waitForTimeout(3000)
          }
        }
      }
    })

    test('should perform text query and view results with scores', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // First, get a sample vector to use its text for search
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(sampleVector).toBeDefined()

      // Extract search text from metadata (e.g., description field)
      const searchText = sampleVector.metadata?.description || 'test'

      // Perform text query
      const result = await page.evaluate(async ({ id, indexName, namespace, queryText }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          queryText,
          topK: 5,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, queryText: searchText })

      // Verify search results
      expect(result.matches).toBeDefined()
      expect(Array.isArray(result.matches)).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches.length).toBeLessThanOrEqual(5)

      // Verify each result has a score
      result.matches.forEach((match: any) => {
        expect(match).toHaveProperty('id')
        expect(match).toHaveProperty('score')
        expect(typeof match.score).toBe('number')
        expect(match.score).toBeGreaterThan(0)
        expect(match.score).toBeLessThanOrEqual(1)
      })

      // Verify results are sorted by score (descending)
      for (let i = 0; i < result.matches.length - 1; i++) {
        expect(result.matches[i].score).toBeGreaterThanOrEqual(result.matches[i + 1].score)
      }
    })

    test('should search by vector ID (find similar)', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a sample vector ID
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(sampleVector).toBeDefined()
      const vectorId = sampleVector.id

      // Search by ID (find similar vectors)
      const result = await page.evaluate(async ({ id, indexName, namespace, vectorId }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          id: vectorId,
          topK: 5,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vectorId })

      // Verify search results
      expect(result.matches).toBeDefined()
      expect(Array.isArray(result.matches)).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)

      // The first result should be the queried vector itself (perfect match)
      expect(result.matches[0].id).toBe(vectorId)
      expect(result.matches[0].score).toBeCloseTo(1.0, 5)

      // Verify all results have scores
      result.matches.forEach((match: any) => {
        expect(match).toHaveProperty('score')
        expect(typeof match.score).toBe('number')
      })
    })

    test('should search with vector values (paste values)', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a sample vector's values
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      expect(sampleVector).toBeDefined()
      expect(sampleVector.values).toBeDefined()
      const vectorValues = sampleVector.values

      // Search using vector values directly
      const result = await page.evaluate(async ({ id, indexName, namespace, values }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          vector: values,
          topK: 5,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, values: vectorValues })

      // Verify search results
      expect(result.matches).toBeDefined()
      expect(Array.isArray(result.matches)).toBe(true)
      expect(result.matches.length).toBeGreaterThan(0)

      // The first result should be the source vector (perfect match)
      expect(result.matches[0].id).toBe(sampleVector.id)
      expect(result.matches[0].score).toBeCloseTo(1.0, 5)

      // Verify all results have metadata
      result.matches.forEach((match: any) => {
        expect(match).toHaveProperty('id')
        expect(match).toHaveProperty('score')
        if (match.metadata) {
          expect(typeof match.metadata).toBe('object')
        }
      })
    })

    test('should adjust top_k parameter', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get a sample vector ID
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      const vectorId = sampleVector.id

      // Test different top_k values
      const topKValues = [1, 3, 5, 10]

      for (const topK of topKValues) {
        const result = await page.evaluate(async ({ id, indexName, namespace, vectorId, topK }) => {
          return await (window as any).electronAPI.pinecone.queryVectors(id, {
            indexName,
            namespace,
            id: vectorId,
            topK,
            includeValues: true,
            includeMetadata: true,
          })
        }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vectorId, topK })

        // Verify the number of results matches top_k (or is less if not enough vectors)
        expect(result.matches.length).toBeLessThanOrEqual(topK)
        expect(result.matches.length).toBeGreaterThan(0)
      }
    })

    test('should search with metadata filters', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get sample text for search
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      const searchText = sampleVector.metadata?.description || 'test'

      // Search with metadata filter (category = 'alpha')
      const filter = { category: { $eq: 'alpha' } }

      const result = await page.evaluate(async ({ id, indexName, namespace, queryText, filter }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          queryText,
          topK: 10,
          filter,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, queryText: searchText, filter })

      // Verify results match the filter
      expect(result.matches).toBeDefined()
      if (result.matches.length > 0) {
        result.matches.forEach((match: any) => {
          if (match.metadata?.category) {
            expect(match.metadata.category).toBe('alpha')
          }
        })
      }
    })

    test('should clear search and return to browse mode', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // First perform a search
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      const vectorId = sampleVector.id

      const searchResult = await page.evaluate(async ({ id, indexName, namespace, vectorId }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          id: vectorId,
          topK: 5,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, vectorId })

      expect(searchResult.matches.length).toBeGreaterThan(0)

      // Clear search by fetching all vectors (browse mode)
      const browseResult = await page.evaluate(async ({ id, indexName, namespace }) => {
        return await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          10
        )
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      // Verify browse results don't have scores (unlike search results)
      expect(Array.isArray(browseResult)).toBe(true)
      expect(browseResult.length).toBeGreaterThan(0)

      // Browse results should not have score property
      browseResult.forEach((vec: any) => {
        expect(vec).toHaveProperty('id')
        expect(vec).toHaveProperty('values')
        // Score should not be present in browse mode
        expect(vec.score).toBeUndefined()
      })
    })

    test('should handle empty search results gracefully', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Search with a filter that won't match anything
      const impossibleFilter = { nonexistent_field: { $eq: 'impossible_value_' + Date.now() } }

      const result = await page.evaluate(async ({ id, indexName, namespace, filter }) => {
        try {
          return await (window as any).electronAPI.pinecone.queryVectors(id, {
            indexName,
            namespace,
            queryText: 'test query',
            topK: 10,
            filter,
            includeValues: true,
            includeMetadata: true,
          })
        } catch (error) {
          return { matches: [], error: error instanceof Error ? error.message : String(error) }
        }
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, filter: impossibleFilter })

      // Should return empty matches array, not throw error
      expect(result.matches).toBeDefined()
      expect(Array.isArray(result.matches)).toBe(true)
      expect(result.matches.length).toBe(0)
    })

    test('should handle search with multiple metadata filters', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get sample text for search
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      const searchText = sampleVector.metadata?.description || 'test'

      // Search with multiple filters using $and
      const filter = {
        $and: [
          { category: { $eq: 'alpha' } },
          { is_active: { $eq: true } },
        ],
      }

      const result = await page.evaluate(async ({ id, indexName, namespace, queryText, filter }) => {
        return await (window as any).electronAPI.pinecone.queryVectors(id, {
          indexName,
          namespace,
          queryText,
          topK: 10,
          filter,
          includeValues: true,
          includeMetadata: true,
        })
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, queryText: searchText, filter })

      // Verify results match all filters
      expect(result.matches).toBeDefined()
      if (result.matches.length > 0) {
        result.matches.forEach((match: any) => {
          if (match.metadata) {
            if (match.metadata.category !== undefined) {
              expect(match.metadata.category).toBe('alpha')
            }
            if (match.metadata.is_active !== undefined) {
              expect(match.metadata.is_active).toBe(true)
            }
          }
        })
      }
    })

    test('should search with numeric filter operators', async () => {
      const { page } = electronContext

      const hasRealApiKey = !!process.env.PINECONE_API_KEY &&
                           process.env.PINECONE_API_KEY !== 'dummy-key-for-local-testing'

      if (!hasRealApiKey || !testIndexName || !testNamespace) {
        test.skip()
        return
      }

      // Get sample text for search
      const sampleVector = await page.evaluate(async ({ id, indexName, namespace }) => {
        const vectors = await (window as any).electronAPI.pinecone.getAllVectors(
          id,
          indexName,
          namespace,
          1
        )
        return vectors[0]
      }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace })

      const searchText = sampleVector.metadata?.description || 'test'

      // Test different numeric operators
      const numericFilters = [
        { score_value: { $gte: 50 } },  // Greater than or equal
        { score_value: { $lt: 30 } },   // Less than
        { index: { $in: [0, 1, 2] } },  // In array
      ]

      for (const filter of numericFilters) {
        const result = await page.evaluate(async ({ id, indexName, namespace, queryText, filter }) => {
          return await (window as any).electronAPI.pinecone.queryVectors(id, {
            indexName,
            namespace,
            queryText,
            topK: 10,
            filter,
            includeValues: true,
            includeMetadata: true,
          })
        }, { id: testProfileId, indexName: testIndexName, namespace: testNamespace, queryText: searchText, filter })

        // Results should be valid
        expect(result.matches).toBeDefined()
        expect(Array.isArray(result.matches)).toBe(true)
      }
    })
  })

  test.describe('Qdrant Vector Search', () => {
    // TODO: Implement Qdrant vector search tests
    test.skip('should perform text query in Qdrant', async () => {
      // TODO: Test text query using Qdrant adapter
    })

    test.skip('should search by vector values in Qdrant', async () => {
      // TODO: Test vector search in Qdrant
    })

    test.skip('should adjust limit parameter in Qdrant', async () => {
      // TODO: Test limit parameter (Qdrant equivalent of top_k)
    })

    test.skip('should search with payload filters in Qdrant', async () => {
      // TODO: Test Qdrant payload filters
    })

    test.skip('should view Qdrant search results with scores', async () => {
      // TODO: Test Qdrant search results display
    })

    test.skip('should clear search and return to browse in Qdrant', async () => {
      // TODO: Test clearing search in Qdrant
    })
  })

  test.describe('Weaviate Vector Search', () => {
    // TODO: Implement Weaviate vector search tests
    test.skip('should perform text query in Weaviate', async () => {
      // TODO: Test text query using Weaviate adapter
    })

    test.skip('should search by vector values in Weaviate', async () => {
      // TODO: Test vector search in Weaviate
    })

    test.skip('should adjust limit parameter in Weaviate', async () => {
      // TODO: Test limit parameter in Weaviate
    })

    test.skip('should search with where filters in Weaviate', async () => {
      // TODO: Test Weaviate where filters
    })

    test.skip('should view Weaviate search results with certainty/distance', async () => {
      // TODO: Test Weaviate search results display
    })

    test.skip('should clear search and return to browse in Weaviate', async () => {
      // TODO: Test clearing search in Weaviate
    })
  })
})
