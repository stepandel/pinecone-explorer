import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { ConnectionProfile, VectorRecord, QueryVectorsParams, QueryResult } from '../../electron/types'
import { useIndexesQuery, useConnectMutation, useRefreshIndexesMutation } from '../hooks/usePineconeQueries'
import { useQueryClient } from '@tanstack/react-query'

interface PineconeContextValue {
  // Connection state
  currentProfile: ConnectionProfile | null
  isConnected: boolean
  connect: (profile: ConnectionProfile) => Promise<void>
  disconnect: () => void

  // Indexes (formerly Collections)
  indexes: any[]
  indexesLoading: boolean
  indexesError: string | null
  refreshIndexes: () => Promise<void>

  // Vectors (formerly Documents)
  queryVectors: (params: QueryVectorsParams) => Promise<QueryResult>

  // Cache management
  invalidateCache: () => void

  // Legacy aliases
  collections: any[]
  collectionsLoading: boolean
  collectionsError: string | null
  refreshCollections: () => Promise<void>
}

const PineconeContext = createContext<PineconeContextValue | null>(null)

interface PineconeProviderProps {
  profile: ConnectionProfile
  windowId: string
  children: ReactNode
}

export function ChromaDBProvider({ profile, windowId, children }: PineconeProviderProps) {
  const [currentProfile, setCurrentProfile] = useState<ConnectionProfile | null>(profile)
  const [isConnected, setIsConnected] = useState(false)
  const queryClient = useQueryClient()

  // Use React Query for indexes
  const {
    data: indexes = [],
    isLoading: indexesLoading,
    error: indexesError,
  } = useIndexesQuery(currentProfile?.id || null, isConnected)

  // Connect mutation
  const connectMutation = useConnectMutation()
  const refreshMutation = useRefreshIndexesMutation(currentProfile?.id || '')

  const connect = useCallback(async (newProfile: ConnectionProfile) => {
    try {
      await connectMutation.mutateAsync(newProfile)
      setCurrentProfile(newProfile)
      setIsConnected(true)
    } catch (error) {
      setIsConnected(false)
      throw error
    }
  }, [connectMutation])

  const disconnect = useCallback(() => {
    setCurrentProfile(null)
    setIsConnected(false)
    // Clear all queries for this profile
    if (currentProfile) {
      queryClient.removeQueries({ queryKey: ['pinecone', 'indexes', currentProfile.id] })
      queryClient.removeQueries({ queryKey: ['pinecone', 'vectors', currentProfile.id] })
    }
  }, [currentProfile, queryClient])

  const refreshIndexes = useCallback(async () => {
    if (!currentProfile) return
    await refreshMutation.mutateAsync()
  }, [currentProfile, refreshMutation])

  const queryVectors = useCallback(async (params: QueryVectorsParams): Promise<QueryResult> => {
    if (!currentProfile) {
      throw new Error('Not connected to Pinecone')
    }

    try {
      const results = await window.electronAPI.pinecone.queryVectors(currentProfile.id, params)
      return results
    } catch (error) {
      console.error('Error querying vectors:', error)
      throw error
    }
  }, [currentProfile])

  const invalidateCache = useCallback(() => {
    if (currentProfile) {
      queryClient.invalidateQueries({ queryKey: ['pinecone', 'vectors', currentProfile.id] })
    }
  }, [currentProfile, queryClient])

  // Auto-connect when profile changes or on initial mount
  useEffect(() => {
    if (profile && (profile !== currentProfile || !isConnected)) {
      connect(profile).catch(console.error)
    }
  }, [profile, currentProfile, isConnected, connect])

  // Listen for Cmd+R refresh (via custom window event) - only refresh vectors
  useEffect(() => {
    const handleRefresh = () => {
      if (currentProfile) {
        queryClient.resetQueries({ queryKey: ['pinecone', 'vectors', currentProfile.id] })
      }
    }
    window.addEventListener('pinecone:refresh', handleRefresh)
    // Also listen for legacy event name
    window.addEventListener('chroma:refresh', handleRefresh)
    return () => {
      window.removeEventListener('pinecone:refresh', handleRefresh)
      window.removeEventListener('chroma:refresh', handleRefresh)
    }
  }, [currentProfile, queryClient])

  const value: PineconeContextValue = {
    currentProfile,
    isConnected,
    connect,
    disconnect,
    indexes,
    indexesLoading,
    indexesError: indexesError ? (indexesError as Error).message : null,
    refreshIndexes,
    queryVectors,
    invalidateCache,
    // Legacy aliases
    collections: indexes,
    collectionsLoading: indexesLoading,
    collectionsError: indexesError ? (indexesError as Error).message : null,
    refreshCollections: refreshIndexes,
  }

  return (
    <PineconeContext.Provider value={value}>
      {children}
    </PineconeContext.Provider>
  )
}

export function useChromaDB() {
  const context = useContext(PineconeContext)
  if (!context) {
    throw new Error('useChromaDB must be used within a ChromaDBProvider (PineconeProvider)')
  }
  return context
}

// Alias for migration
export const usePinecone = useChromaDB
export const PineconeProvider = ChromaDBProvider
