import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface PanelContextType {
  // Indexes panel (fixed, resizable, not collapsible)
  indexesPanelWidth: number
  setIndexesPanelWidth: (width: number) => void

  // Left panel (NamespacesPanel) state
  leftPanelOpen: boolean
  setLeftPanelOpen: (open: boolean) => void
  leftPanelWidth: number
  setLeftPanelWidth: (width: number) => void

  // Right panel (VectorDetailPanel) state
  rightPanelOpen: boolean
  setRightPanelOpen: (open: boolean) => void
  rightPanelWidth: number
  setRightPanelWidth: (width: number) => void

  // Multi-select vector state
  selectedVectorIds: Set<string>
  primarySelectedVectorId: string | null // Last selected, shown in detail panel
  selectionAnchor: string | null // For shift+click range selection

  // Selection actions
  selectVector: (id: string) => void // Single select (clears others)
  toggleVectorSelection: (id: string) => void // ⌘+click toggle
  selectVectorRange: (ids: string[], newAnchor?: string) => void // Range select
  addToSelection: (ids: string[]) => void // Add range to existing
  clearSelection: () => void
  setSelectionAnchor: (id: string | null) => void

  // Embedding text field (for regeneration prompts)
  embeddingTextField: string | null
  setEmbeddingTextField: (field: string | null) => void
}

const PanelContext = createContext<PanelContextType | undefined>(undefined)

export function PanelProvider({ children }: { children: ReactNode }) {
  const [indexesPanelWidth, setIndexesPanelWidth] = useState(73)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(220)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(320)
  const [selectedVectorIds, setSelectedVectorIds] = useState<Set<string>>(new Set())
  const [primarySelectedVectorId, setPrimarySelectedVectorId] = useState<string | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [embeddingTextField, setEmbeddingTextField] = useState<string | null>(null)

  // Single select - clears all others, sets this as primary and anchor
  const selectVector = useCallback((id: string) => {
    setSelectedVectorIds(new Set([id]))
    setPrimarySelectedVectorId(id)
    setSelectionAnchor(id)
    setRightPanelOpen(true)
  }, [])

  // Toggle selection (⌘+click)
  const toggleVectorSelection = useCallback((id: string) => {
    setSelectedVectorIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        // Update primary if we removed it
        if (id === primarySelectedVectorId) {
          const remaining = Array.from(next)
          setPrimarySelectedVectorId(remaining.length > 0 ? remaining[remaining.length - 1] : null)
        }
      } else {
        next.add(id)
        setPrimarySelectedVectorId(id)
      }
      // Open/close panel based on selection
      setRightPanelOpen(next.size > 0)
      return next
    })
    setSelectionAnchor(id)
  }, [primarySelectedVectorId])

  // Range select (shift+click) - replaces selection with range
  const selectVectorRange = useCallback((ids: string[], newAnchor?: string) => {
    setSelectedVectorIds(new Set(ids))
    setPrimarySelectedVectorId(ids.length > 0 ? ids[ids.length - 1] : null)
    if (newAnchor !== undefined) {
      setSelectionAnchor(newAnchor)
    }
    setRightPanelOpen(ids.length > 0)
  }, [])

  // Add to selection (⌘+shift+click) - adds range to existing
  const addToSelection = useCallback((ids: string[]) => {
    setSelectedVectorIds(prev => {
      const next = new Set([...prev, ...ids])
      return next
    })
    if (ids.length > 0) {
      setPrimarySelectedVectorId(ids[ids.length - 1])
      setRightPanelOpen(true)
    }
  }, [])

  // Clear all selection
  const clearSelection = useCallback(() => {
    setSelectedVectorIds(new Set())
    setPrimarySelectedVectorId(null)
    setSelectionAnchor(null)
    setRightPanelOpen(false)
  }, [])

  return (
    <PanelContext.Provider
      value={{
        indexesPanelWidth,
        setIndexesPanelWidth,
        leftPanelOpen,
        setLeftPanelOpen,
        leftPanelWidth,
        setLeftPanelWidth,
        rightPanelOpen,
        setRightPanelOpen,
        rightPanelWidth,
        setRightPanelWidth,
        selectedVectorIds,
        primarySelectedVectorId,
        selectionAnchor,
        selectVector,
        toggleVectorSelection,
        selectVectorRange,
        addToSelection,
        clearSelection,
        setSelectionAnchor,
        embeddingTextField,
        setEmbeddingTextField,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel() {
  const context = useContext(PanelContext)
  if (context === undefined) {
    throw new Error('usePanel must be used within a PanelProvider')
  }
  return context
}
