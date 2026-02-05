import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AssistantModel, CreateAssistantParams, UpdateAssistantParams } from '../../electron/types'
import { QUERY } from '../constants/ui'

// Query Keys
export const assistantQueryKeys = {
  all: ['assistant'] as const,
  list: (profileId: string) => [...assistantQueryKeys.all, 'list', profileId] as const,
  detail: (profileId: string, name: string) => [...assistantQueryKeys.all, 'detail', profileId, name] as const,
}

// List Assistants Query
export function useAssistantsQuery(profileId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: assistantQueryKeys.list(profileId || ''),
    queryFn: async () => {
      if (!profileId) {
        throw new Error('Profile ID is required')
      }
      const assistants = await window.electronAPI.assistant.list(profileId)
      return assistants
    },
    enabled: enabled && !!profileId,
    staleTime: QUERY.STALE_TIME_INDEXES, // Use same stale time as indexes
  })
}

// Get Assistant Detail Query
export function useAssistantDetailQuery(
  profileId: string | null,
  assistantName: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: assistantQueryKeys.detail(profileId || '', assistantName || ''),
    queryFn: async () => {
      if (!profileId || !assistantName) {
        throw new Error('Profile ID and Assistant name are required')
      }
      return await window.electronAPI.assistant.describe(profileId, assistantName)
    },
    enabled: enabled && !!profileId && !!assistantName,
    staleTime: QUERY.STALE_TIME_STATS,
  })
}

// Create Assistant Mutation
export function useCreateAssistantMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateAssistantParams) => {
      return await window.electronAPI.assistant.create(profileId, params)
    },
    onSuccess: () => {
      // Invalidate assistants list to refetch with new assistant
      queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.list(profileId),
      })
    },
    onError: (error) => {
      console.error('Failed to create assistant:', error)
    },
  })
}

// Update Assistant Mutation
export function useUpdateAssistantMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      params,
    }: {
      name: string
      params: UpdateAssistantParams
    }) => {
      return await window.electronAPI.assistant.update(profileId, name, params)
    },
    onSuccess: (_, { name }) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.list(profileId),
      })
      queryClient.invalidateQueries({
        queryKey: assistantQueryKeys.detail(profileId, name),
      })
    },
    onError: (error) => {
      console.error('Failed to update assistant:', error)
    },
  })
}

// Delete Assistant Mutation
export function useDeleteAssistantMutation(profileId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (assistantName: string) => {
      await window.electronAPI.assistant.delete(profileId, assistantName)
      return { profileId, assistantName }
    },
    onMutate: async (assistantName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: assistantQueryKeys.list(profileId),
      })

      // Snapshot the previous value
      const previousAssistants = queryClient.getQueryData<AssistantModel[]>(
        assistantQueryKeys.list(profileId)
      )

      // Optimistically remove the assistant from the cache
      if (previousAssistants) {
        queryClient.setQueryData(
          assistantQueryKeys.list(profileId),
          previousAssistants.filter((assistant) => assistant.name !== assistantName)
        )
      }

      return { previousAssistants }
    },
    onError: (_err, _assistantName, context) => {
      // Roll back to the previous value on error
      if (context?.previousAssistants) {
        queryClient.setQueryData(
          assistantQueryKeys.list(profileId),
          context.previousAssistants
        )
      }
    },
    onSuccess: (data) => {
      // Remove detail query for the deleted assistant
      queryClient.removeQueries({
        queryKey: assistantQueryKeys.detail(data.profileId, data.assistantName),
      })
    },
  })
}
