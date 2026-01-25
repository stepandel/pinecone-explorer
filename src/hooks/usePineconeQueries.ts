import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import {
  ConnectionProfile,
  IndexInfo,
  QueryVectorsParams,
  CreateVectorParams,
  UpdateVectorParams,
  BatchImportParams,
  CreateIndexParams,
} from '../../electron/types'
import { PAGINATION, QUERY } from '../constants/ui'

// Query Keys
export const pineconeQueryKeys = {
  all: ['pinecone'] as const,
  profile: (profileId: string) => [...pineconeQueryKeys.all, 'profile', profileId] as const,
  indexes: (profileId: string) => [...pineconeQueryKeys.all, 'indexes', profileId] as const,
  indexStats: (profileId: string, indexName: string) =>
    [...pineconeQueryKeys.all, 'indexStats', profileId, indexName] as const,
  vectors: (profileId: string, indexName: string, namespace?: string) =>
    [...pineconeQueryKeys.all, 'vectors', profileId, indexName, namespace] as const,
  vectorsPaginated: (profileId: string, indexName: string, namespace?: string) =>
    [...pineconeQueryKeys.all, 'vectorsPaginated', profileId, indexName, namespace] as const,
}

// Profile Query
export function useProfileQuery(profileId: string) {
  return useQuery({
    queryKey: pineconeQueryKeys.profile(profileId),
    queryFn: async () => {
      const profile = await window.electronAPI.window.getProfile(profileId)
      return profile
    },
    staleTime: Infinity, // Profiles don't change often
  })
}

// Indexes Query
export function useIndexesQuery(profileId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: pineconeQueryKeys.indexes(profileId || ''),
    queryFn: async () => {
      if (!profileId) {
        throw new Error('Profile ID is required')
      }
      const indexes = await window.electronAPI.pinecone.listIndexes(profileId)
      return indexes
    },
    enabled: enabled && !!profileId,
    staleTime: QUERY.STALE_TIME_INDEXES,
  })
}

// Index Stats Query
export function useIndexStatsQuery(
  profileId: string | null,
  indexName: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: pineconeQueryKeys.indexStats(profileId || '', indexName || ''),
    queryFn: async () => {
      if (!profileId || !indexName) {
        throw new Error('Profile ID and Index name are required')
      }
      return await window.electronAPI.pinecone.getIndexStats(profileId, indexName)
    },
    enabled: enabled && !!profileId && !!indexName,
    staleTime: QUERY.STALE_TIME_STATS,
  })
}

// Vectors Query Result with timing
interface VectorsQueryResult {
  vectors: Awaited<ReturnType<typeof window.electronAPI.pinecone.getAllVectors>>
  fetchTimeMs: number
}

// Vectors Query (replaces Documents Query)
export function useVectorsQuery(
  profileId: string | null,
  indexName: string | null,
  namespace?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: pineconeQueryKeys.vectors(profileId || '', indexName || '', namespace),
    queryFn: async (): Promise<VectorsQueryResult> => {
      if (!profileId || !indexName) {
        throw new Error('Profile ID and Index name are required')
      }
      const startTime = performance.now()
      const vectors = await window.electronAPI.pinecone.getAllVectors(
        profileId,
        indexName,
        namespace,
        PAGINATION.INITIAL_LOAD_LIMIT
      )
      const fetchTimeMs = Math.round(performance.now() - startTime)
      return { vectors, fetchTimeMs }
    },
    enabled: enabled && !!profileId && !!indexName,
    staleTime: 1000 * 15, // 15 seconds
  })
}

// Paginated Vectors Page Result
interface PaginatedVectorsPage {
  vectors: Awaited<ReturnType<typeof window.electronAPI.pinecone.getVectorsPaginated>>['vectors']
  nextCursor: string | undefined
  hasMore: boolean
  fetchTimeMs: number
}

// Infinite Vectors Query (for pagination with Load More)
// Uses longer cache times for large datasets - users browsing 10M+ vectors
// don't need constant refetches during a browsing session
export function useInfiniteVectorsQuery(
  profileId: string | null,
  indexName: string | null,
  namespace?: string,
  enabled: boolean = true
) {
  return useInfiniteQuery({
    queryKey: pineconeQueryKeys.vectorsPaginated(profileId || '', indexName || '', namespace),
    queryFn: async ({ pageParam }): Promise<PaginatedVectorsPage> => {
      if (!profileId || !indexName) {
        throw new Error('Profile ID and Index name are required')
      }
      const startTime = performance.now()
      const result = await window.electronAPI.pinecone.getVectorsPaginated(profileId, {
        indexName,
        namespace,
        pageSize: PAGINATION.VECTORS_PER_PAGE,
        cursor: pageParam,
      })
      const fetchTimeMs = Math.round(performance.now() - startTime)
      return {
        vectors: result.vectors,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        fetchTimeMs,
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!profileId && !!indexName,
    staleTime: QUERY.STALE_TIME_VECTORS,
    gcTime: QUERY.GC_TIME_VECTORS,
  })
}

// Connect Mutation
export function useConnectMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (profile: ConnectionProfile) => {
      await window.electronAPI.pinecone.connect(profile.id, profile)
      return profile
    },
    onSuccess: (profile) => {
      // Invalidate indexes to refetch after connection
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexes(profile.id)
      })
    },
    onError: (error) => {
      console.error('Connection failed:', error)
    },
  })
}

// Refresh Indexes Mutation
export function useRefreshIndexesMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const indexes = await window.electronAPI.pinecone.listIndexes(profileId)
      return indexes
    },
    onSuccess: (indexes) => {
      // Update the cache directly
      queryClient.setQueryData(pineconeQueryKeys.indexes(profileId), indexes)
    },
    onError: (error) => {
      console.error('Failed to refresh indexes:', error)
    },
  })
}

// Query Vectors Mutation (for semantic search)
export function useQueryVectorsMutation(profileId: string) {
  return useMutation({
    mutationFn: async (params: QueryVectorsParams) => {
      return await window.electronAPI.pinecone.queryVectors(profileId, params)
    },
    onError: (error) => {
      console.error('Query vectors failed:', error)
    },
  })
}

// Update Vector Mutation
export function useUpdateVectorMutation(profileId: string, indexName: string, namespace?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: Omit<UpdateVectorParams, 'indexName' | 'namespace'>) => {
      await window.electronAPI.pinecone.updateVector(profileId, {
        indexName,
        namespace,
        ...params,
      })
    },
    onSuccess: () => {
      // Invalidate vectors for this index/namespace to refetch updated data
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectors(profileId, indexName, namespace),
      })
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(profileId, indexName, namespace),
      })
    },
    onError: (error) => {
      console.error('Failed to update vector:', error)
    },
  })
}

// Create Vector Mutation
export function useCreateVectorMutation(profileId: string, indexName: string, namespace?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: Omit<CreateVectorParams, 'indexName' | 'namespace'>) => {
      await window.electronAPI.pinecone.createVector(profileId, {
        indexName,
        namespace,
        ...params,
      })
    },
    onSuccess: () => {
      // Invalidate vectors for this index/namespace to refetch with new vector
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectors(profileId, indexName, namespace),
      })
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(profileId, indexName, namespace),
      })
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
    },
    onError: (error) => {
      console.error('Failed to create vector:', error)
    },
  })
}

// Delete Vectors Mutation
export function useDeleteVectorsMutation(profileId: string, indexName: string, namespace?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      await window.electronAPI.pinecone.deleteVectors(profileId, {
        indexName,
        namespace,
        ids,
      })
    },
    onSuccess: () => {
      // Invalidate vectors for this index/namespace to refetch after deletion
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectors(profileId, indexName, namespace),
      })
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(profileId, indexName, namespace),
      })
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
    },
    onError: (error) => {
      console.error('Failed to delete vectors:', error)
    },
  })
}

// Batch Import Mutation (for pasting copied vectors)
export function useBatchImportMutation(profileId: string, indexName: string, namespace?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: Omit<BatchImportParams, 'indexName' | 'namespace'>) => {
      return await window.electronAPI.pinecone.batchImport(profileId, {
        indexName,
        namespace,
        ...params,
      })
    },
    onSuccess: () => {
      // Invalidate vectors for this index/namespace to refetch with new vectors
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectors(profileId, indexName, namespace),
      })
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(profileId, indexName, namespace),
      })
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
    },
    onError: (error) => {
      console.error('Batch import failed:', error)
    },
  })
}

// Create Index Mutation
export function useCreateIndexMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateIndexParams) => {
      return await window.electronAPI.pinecone.createIndex(profileId, params)
    },
    onSuccess: () => {
      // Invalidate indexes to refetch with new index
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexes(profileId),
      })
    },
    onError: (error) => {
      console.error('Failed to create index:', error)
    },
  })
}

// Delete Index Mutation
export function useDeleteIndexMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (indexName: string) => {
      await window.electronAPI.pinecone.deleteIndex(profileId, indexName)
      return { profileId, indexName }
    },
    onMutate: async (indexName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: pineconeQueryKeys.indexes(profileId),
      })

      // Snapshot the previous value
      const previousIndexes = queryClient.getQueryData<IndexInfo[]>(
        pineconeQueryKeys.indexes(profileId)
      )

      // Optimistically remove the index from the cache
      if (previousIndexes) {
        queryClient.setQueryData(
          pineconeQueryKeys.indexes(profileId),
          previousIndexes.filter((index) => index.name !== indexName)
        )
      }

      return { previousIndexes }
    },
    onError: (_err, _indexName, context) => {
      // Roll back to the previous value on error
      if (context?.previousIndexes) {
        queryClient.setQueryData(
          pineconeQueryKeys.indexes(profileId),
          context.previousIndexes
        )
      }
    },
    onSuccess: (data) => {
      // Remove any stats queries for the deleted index
      queryClient.removeQueries({
        queryKey: pineconeQueryKeys.indexStats(data.profileId, data.indexName),
      })
      // Remove any vector queries for the deleted index
      queryClient.removeQueries({
        queryKey: pineconeQueryKeys.vectors(data.profileId, data.indexName),
      })
      queryClient.removeQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(data.profileId, data.indexName),
      })
    },
  })
}

// Delete Namespace Mutation (deletes all vectors in a namespace)
export function useDeleteNamespaceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { profileId: string; indexName: string; namespace: string }) => {
      await window.electronAPI.pinecone.deleteVectors(params.profileId, {
        indexName: params.indexName,
        namespace: params.namespace,
        deleteAll: true,
      })
    },
    onSuccess: (_, params) => {
      // Invalidate index stats to update namespace list and counts
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(params.profileId, params.indexName),
      })
      // Invalidate vectors for this namespace
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectors(params.profileId, params.indexName, params.namespace),
      })
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.vectorsPaginated(params.profileId, params.indexName, params.namespace),
      })
    },
  })
}

