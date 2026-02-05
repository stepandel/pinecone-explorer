import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { ConnectionProfile, VectorRecord, QueryVectorsParams, QueryResult, IndexInfo } from '../../electron/types'
import { useIndexesQuery, useConnectMutation, useRefreshIndexesMutation } from '../hooks/usePineconeQueries'
import { useQueryClient } from '@tanstack/react-query'

/** Safely extract error message from unknown error */
function getErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An error occurred'
}

interface PineconeContextValue {
  // Connection state
  currentProfile: ConnectionProfile | null
  isConnected: boolean
  isLocalMode: boolean  // True when connected to Pinecone Local (controllerHostUrl is set)
  connect: (profile: ConnectionProfile) => Promise<void>
  disconnect: () => void

  // Indexes
  indexes: IndexInfo[]
  indexesLoading: boolean
  indexesError: string | null
  refreshIndexes: () => Promise<void>

  // Vectors
  queryVectors: (params: QueryVectorsParams) => Promise<QueryResult>

  // Cache management
  invalidateCache: () => void
}

const PineconeContext = createContext<PineconeContextValue | null>(null)

interface PineconeProviderProps {
  profile: ConnectionProfile
  windowId: string
  children: ReactNode
}

export function PineconeProvider({ profile, windowId, children }: PineconeProviderProps) {
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
    return () => {
      window.removeEventListener('pinecone:refresh', handleRefresh)
    }
  }, [currentProfile, queryClient])

  const value: PineconeContextValue = {
    currentProfile,
    isConnected,
    isLocalMode: !!currentProfile?.controllerHostUrl,
    connect,
    disconnect,
    indexes,
    indexesLoading,
    indexesError: getErrorMessage(indexesError),
    refreshIndexes,
    queryVectors,
    invalidateCache,
  }

  return (
    <PineconeContext.Provider value={value}>
      {children}
    </PineconeContext.Provider>
  )
}

export function usePinecone() {
  const context = useContext(PineconeContext)
  if (!context) {
    throw new Error('usePinecone must be used within a PineconeProvider')
  }
  return context
}
