import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

interface FileSelectionContextValue {
  // Selected file ID
  activeFile: string | null
  setActiveFile: (fileId: string | null) => void
}

const FileSelectionContext = createContext<FileSelectionContextValue | null>(null)

export function FileSelectionProvider({ children }: { children: ReactNode }) {
  const [activeFile, setActiveFileState] = useState<string | null>(null)

  const setActiveFile = useCallback((fileId: string | null) => {
    setActiveFileState(fileId)
  }, [])

  const value = useMemo<FileSelectionContextValue>(
    () => ({
      activeFile,
      setActiveFile,
    }),
    [activeFile, setActiveFile]
  )

  return (
    <FileSelectionContext.Provider value={value}>
      {children}
    </FileSelectionContext.Provider>
  )
}

export function useFileSelection() {
  const context = useContext(FileSelectionContext)
  if (!context) {
    throw new Error('useFileSelection must be used within a FileSelectionProvider')
  }
  return context
}
