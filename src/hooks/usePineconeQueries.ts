import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ConnectionProfile,
  IndexInfo,
  QueryVectorsParams,
  CreateVectorParams,
  UpdateVectorParams,
  BatchImportParams,
  CreateIndexParams,
} from '../../electron/types'

// Query Keys
export const pineconeQueryKeys = {
  all: ['pinecone'] as const,
  profile: (profileId: string) => [...pineconeQueryKeys.all, 'profile', profileId] as const,
  indexes: (profileId: string) => [...pineconeQueryKeys.all, 'indexes', profileId] as const,
  indexStats: (profileId: string, indexName: string) =>
    [...pineconeQueryKeys.all, 'indexStats', profileId, indexName] as const,
  vectors: (profileId: string, indexName: string, namespace?: string) =>
    [...pineconeQueryKeys.all, 'vectors', profileId, indexName, namespace] as const,
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

// Indexes Query (replaces Collections Query)
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
    staleTime: 1000 * 60 * 2, // 2 minutes
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
    staleTime: 1000 * 30, // 30 seconds
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
        1000 // Limit to 1000 vectors for UI display
      )
      const fetchTimeMs = Math.round(performance.now() - startTime)
      return { vectors, fetchTimeMs }
    },
    enabled: enabled && !!profileId && !!indexName,
    staleTime: 1000 * 15, // 15 seconds
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
  })
}

// Query Vectors Mutation (for semantic search)
export function useQueryVectorsMutation(profileId: string) {
  return useMutation({
    mutationFn: async (params: QueryVectorsParams) => {
      return await window.electronAPI.pinecone.queryVectors(profileId, params)
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
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
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
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
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
      // Also invalidate index stats to update vector count
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(profileId, indexName),
      })
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
    },
  })
}

