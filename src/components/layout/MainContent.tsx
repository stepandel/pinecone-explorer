import { useState, useCallback, useEffect } from 'react'
import { useSelection } from '../../context/SelectionContext'
import { useDraftIndex } from '../../context/DraftIndexContext'
import { usePanel } from '../../context/PanelContext'
import { usePinecone } from '../../providers/PineconeProvider'
import { IndexesPanel } from '../indexes/IndexesPanel'
import { NamespacesPanel } from '../namespaces/NamespacesPanel'
import { IndexConfigView } from '../indexes/IndexConfigView'
import VectorsView from '../vectors/VectorsView'
import VectorDetailPanel from '../vectors/VectorDetailPanel'

interface VectorRecord {
  id: string
  metadata: Record<string, unknown> | null
  embedding: number[] | null
}

export function MainContent() {
  const { activeIndex, activeNamespace } = useSelection()
  const { draftIndex } = useDraftIndex()
  const { currentProfile } = usePinecone()
  const {
    indexesPanelWidth,
    setIndexesPanelWidth,
    leftPanelOpen,
    leftPanelWidth,
    setLeftPanelWidth,
    rightPanelOpen,
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
  } = usePanel()
  const [selectedVector, setSelectedVector] = useState<VectorRecord | null>(null)
  const [isSelectedDraft, setIsSelectedDraft] = useState(false)
  const [isFirstVector, setIsFirstVector] = useState(false)
  const [draftUpdateHandler, setDraftUpdateHandler] = useState<((updates: { id?: string; metadata?: Record<string, unknown> }) => void) | null>(null)

  // Resize state
  const [isResizingIndexes, setIsResizingIndexes] = useState(false)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  const handleSelectedVectorChange = (vector: VectorRecord | null, isDraft: boolean) => {
    setSelectedVector(vector)
    setIsSelectedDraft(isDraft)
  }

  const handleExposeDraftHandler = (handler: ((updates: { id?: string; metadata?: Record<string, unknown> }) => void) | null) => {
    setDraftUpdateHandler(() => handler)
  }

  const handleIsFirstVectorChange = (isFirst: boolean) => {
    setIsFirstVector(isFirst)
  }

  // Handle mouse move for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizingIndexes) {
      const newWidth = Math.max(60, Math.min(240, e.clientX))
      setIndexesPanelWidth(newWidth)
    } else if (isResizingLeft) {
      // Adjust for the IndexesPanel width
      const newWidth = Math.max(180, Math.min(400, e.clientX - indexesPanelWidth))
      setLeftPanelWidth(newWidth)
    } else if (isResizingRight) {
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
      setRightPanelWidth(newWidth)
    }
  }, [isResizingIndexes, isResizingLeft, isResizingRight, indexesPanelWidth, setIndexesPanelWidth, setLeftPanelWidth, setRightPanelWidth])

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    setIsResizingIndexes(false)
    setIsResizingLeft(false)
    setIsResizingRight(false)
  }, [])

  // Add/remove global event listeners for resize
  useEffect(() => {
    if (isResizingIndexes || isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingIndexes, isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp])

  // Calculate main content padding based on open panels
  // Always account for IndexesPanel, plus the namespaces panel if open
  const leftPadding = indexesPanelWidth + (leftPanelOpen ? leftPanelWidth : 0)
  const rightPadding = rightPanelOpen ? rightPanelWidth : 0

  // Determine what to show in the main area
  const showVectors = activeIndex && activeNamespace !== null

  return (
    <main className="flex-1 relative overflow-hidden bg-content">
      {/* IndexesPanel - always visible, resizable */}
      <div
        className="absolute top-0 left-0 h-full z-30"
        style={{ width: `${indexesPanelWidth}px` }}
      >
        <IndexesPanel />
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizingIndexes(true)
          }}
        />
      </div>

      {/* Main content area */}
      <div
        className="h-full transition-[padding] duration-200"
        style={{ paddingLeft: `${leftPadding}px`, paddingRight: `${rightPadding}px` }}
      >
        {draftIndex ? (
          <IndexConfigView />
        ) : showVectors ? (
          <VectorsView
            collectionName={activeIndex}
            namespace={activeNamespace}
            selectedVectorIds={selectedVectorIds}
            primarySelectedVectorId={primarySelectedVectorId}
            selectionAnchor={selectionAnchor}
            onSingleSelect={selectVector}
            onToggleSelect={toggleVectorSelection}
            onRangeSelect={selectVectorRange}
            onAddToSelection={addToSelection}
            onClearSelection={clearSelection}
            onSetSelectionAnchor={setSelectionAnchor}
            onSelectedVectorChange={handleSelectedVectorChange}
            onExposeDraftHandler={handleExposeDraftHandler}
            onIsFirstVectorChange={handleIsFirstVectorChange}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{ background: 'var(--canvas-background)' }}
          >
            <div className="text-center text-muted-foreground">
              {!activeIndex ? (
                <>
                  <p className="text-lg mb-2">No index selected</p>
                  <p className="text-sm">Select an index from the sidebar to get started</p>
                </>
              ) : (
                <>
                  <p className="text-lg mb-2">No namespace selected</p>
                  <p className="text-sm">Select a namespace to view vectors</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Namespaces Panel - Collapsible, positioned after IndexesPanel */}
      <aside
        className={`absolute top-0 h-full transition-transform duration-200 ${
          leftPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          left: `${indexesPanelWidth}px`,
          width: `${leftPanelWidth}px`,
        }}
      >
        <NamespacesPanel />
        {/* Resize handle */}
        {leftPanelOpen && (
          <div
            className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingLeft(true)
            }}
          />
        )}
      </aside>

      {/* Right Panel: Vector Detail - Floating glass overlay */}
      <aside
        className={`absolute top-0 right-0 h-full transition-transform duration-200 ${
          rightPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: `${rightPanelWidth}px` }}
      >
        {selectedVector && activeIndex && currentProfile ? (
          <VectorDetailPanel
            vector={selectedVector}
            collectionName={activeIndex}
            namespace={activeNamespace ?? undefined}
            profileId={currentProfile.id}
            isDraft={isSelectedDraft}
            isFirstVector={isFirstVector}
            onDraftChange={isSelectedDraft ? draftUpdateHandler ?? undefined : undefined}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{
              background: 'var(--panel-detail)',
              backdropFilter: 'blur(24px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
              boxShadow: 'var(--panel-detail-shadow)',
            }}
          >
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No vector selected</p>
            </div>
          </div>
        )}
        {/* Resize handle - rendered last to be on top */}
        {rightPanelOpen && (
          <div
            className="absolute top-0 left-0 w-[5px] h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-20"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingRight(true)
            }}
          />
        )}
      </aside>
    </main>
  )
}
