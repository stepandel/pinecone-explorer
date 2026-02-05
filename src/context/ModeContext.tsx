import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'

export type ExplorerMode = 'index' | 'assistant'

interface ModeContextType {
  mode: ExplorerMode
  setMode: (mode: ExplorerMode) => void
}

const ModeContext = createContext<ModeContextType | undefined>(undefined)

export function ModeProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = usePinecone()
  const [mode, setModeState] = useState<ExplorerMode>('index')
  const [isInitialized, setIsInitialized] = useState(false)

  // Load initial mode from electron-store
  useEffect(() => {
    if (!currentProfile) return

    window.electronAPI.profiles.getPreferredMode(currentProfile.id)
      .then((savedMode) => {
        if (savedMode) {
          setModeState(savedMode)
        }
        setIsInitialized(true)
      })
      .catch((err) => {
        console.warn('Failed to load saved mode, using default:', err)
        setIsInitialized(true)
      })
  }, [currentProfile])

  const setMode = useCallback((newMode: ExplorerMode) => {
    setModeState(newMode)
    
    // Persist to electron-store
    if (currentProfile) {
      window.electronAPI.profiles.setPreferredMode(currentProfile.id, newMode)
        .catch((err) => {
          console.warn('Failed to persist mode preference:', err)
        })
    }
  }, [currentProfile])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl + 1 or 2
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault()
          setMode('index')
        } else if (e.key === '2') {
          e.preventDefault()
          setMode('assistant')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setMode])

  // Don't render children until we've loaded the initial mode
  if (!isInitialized) {
    return null
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const context = useContext(ModeContext)
  if (context === undefined) {
    throw new Error('useMode must be used within a ModeProvider')
  }
  return context
}
