import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'

// Clipboard TTL: 30 minutes (in milliseconds)
const CLIPBOARD_TTL_MS = 30 * 60 * 1000

interface VectorsClipboard {
  type: 'vectors'
  vectors: Array<{
    id: string
    metadata: Record<string, unknown> | null
  }>
  sourceIndexName: string
  sourceProfileId: string
  copiedAt: number  // Timestamp when copied
}

type ClipboardItem = VectorsClipboard

interface ClipboardContextValue {
  clipboard: ClipboardItem | null

  // Vector methods
  copyVectors: (vectors: VectorRecord[], indexName: string, profileId: string) => void
  hasCopiedVectors: boolean

  // Shared
  clearClipboard: () => void

  // TTL info
  clipboardExpiresAt: number | null
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null)

interface ClipboardProviderProps {
  children: ReactNode
}

export function ClipboardProvider({ children }: ClipboardProviderProps) {
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null)
  const expirationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any existing timer when clipboard changes
  const clearExpirationTimer = useCallback(() => {
    if (expirationTimerRef.current) {
      clearTimeout(expirationTimerRef.current)
      expirationTimerRef.current = null
    }
  }, [])

  // Set up TTL expiration timer when clipboard is set
  useEffect(() => {
    clearExpirationTimer()

    if (clipboard) {
      const timeUntilExpiration = (clipboard.copiedAt + CLIPBOARD_TTL_MS) - Date.now()

      if (timeUntilExpiration <= 0) {
        // Already expired
        setClipboard(null)
      } else {
        // Set timer to clear clipboard when TTL expires
        expirationTimerRef.current = setTimeout(() => {
          setClipboard(null)
        }, timeUntilExpiration)
      }
    }

    return clearExpirationTimer
  }, [clipboard, clearExpirationTimer])

  const copyVectors = useCallback((vectors: VectorRecord[], indexName: string, profileId: string) => {
    // Copy vectors without embeddings (they'll be regenerated on paste)
    const vectorsToClipboard = vectors.map(vec => ({
      id: vec.id,
      metadata: vec.metadata || null,
    }))
    setClipboard({
      type: 'vectors',
      vectors: vectorsToClipboard,
      sourceIndexName: indexName,
      sourceProfileId: profileId,
      copiedAt: Date.now(),
    })
  }, [])

  const clearClipboard = useCallback(() => {
    clearExpirationTimer()
    setClipboard(null)
  }, [clearExpirationTimer])

  const clipboardExpiresAt = clipboard ? clipboard.copiedAt + CLIPBOARD_TTL_MS : null

  const value: ClipboardContextValue = {
    clipboard,
    copyVectors,
    hasCopiedVectors: clipboard?.type === 'vectors',
    clearClipboard,
    clipboardExpiresAt,
  }

  return <ClipboardContext.Provider value={value}>{children}</ClipboardContext.Provider>
}

export function useClipboard() {
  const context = useContext(ClipboardContext)
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider')
  }
  return context
}
