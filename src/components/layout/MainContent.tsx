import { useState, useCallback, useEffect } from 'react'
import { useSelection } from '../../context/SelectionContext'
import { useDraftIndex } from '../../context/DraftIndexContext'
import { useDraftNamespace } from '../../context/DraftNamespaceContext'
import { usePanel } from '../../context/PanelContext'
import { useEmbedding } from '../../context/EmbeddingContext'
import { usePinecone } from '../../providers/PineconeProvider'
import { IndexesPanel } from '../indexes/IndexesPanel'
import { NamespacesPanel } from '../namespaces/NamespacesPanel'
import { IndexConfigView } from '../indexes/IndexConfigView'
import { NamespaceConfigView } from '../namespaces/NamespaceConfigView'
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
  const { draftNamespace } = useDraftNamespace()
  const { currentProfile } = usePinecone()
  const { indexEmbedConfig, clientTextFieldOverride } = useEmbedding()
  const isEmbeddingFieldConfigured = !!indexEmbedConfig || !!clientTextFieldOverride
  const {
    indexesPanelOpen,
    setIndexesPanelOpen,
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
    embeddingTextField,
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
      const newWidth = Math.max(120, Math.min(240, e.clientX))
      setIndexesPanelWidth(newWidth)
    } else if (isResizingLeft) {
      // Adjust for the IndexesPanel width
      const effectiveIndexesWidth = indexesPanelOpen ? indexesPanelWidth : 0
      const newWidth = Math.max(180, Math.min(400, e.clientX - effectiveIndexesWidth))
      setLeftPanelWidth(newWidth)
    } else if (isResizingRight) {
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
      setRightPanelWidth(newWidth)
    }
  }, [isResizingIndexes, isResizingLeft, isResizingRight, indexesPanelOpen, indexesPanelWidth, setIndexesPanelWidth, setLeftPanelWidth, setRightPanelWidth])

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
  const effectiveIndexesWidth = indexesPanelOpen ? indexesPanelWidth : 0
  const leftPadding = effectiveIndexesWidth + (leftPanelOpen ? leftPanelWidth : 0)
  const rightPadding = rightPanelOpen ? rightPanelWidth : 0

  // Determine what to show in the main area
  const showVectors = activeIndex && activeNamespace !== null

  return (
    <main className="flex-1 relative overflow-hidden bg-content">
      {/* IndexesPanel - Collapsible */}
      <aside
        className={`absolute top-0 left-0 h-full z-30 transition-transform duration-200 ${
          indexesPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: `${indexesPanelWidth}px` }}
      >
        <IndexesPanel onToggleCollapse={() => setIndexesPanelOpen(false)} />
        {/* Resize handle */}
        {indexesPanelOpen && (
          <div
            className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingIndexes(true)
            }}
          />
        )}
      </aside>

      {/* Main content area */}
      <div
        className="h-full transition-[padding] duration-200"
        style={{ paddingLeft: `${leftPadding}px`, paddingRight: `${rightPadding}px` }}
      >
        {draftIndex ? (
          <IndexConfigView />
        ) : draftNamespace ? (
          <NamespaceConfigView />
        ) : showVectors ? (
          <VectorsView
            key={`${activeIndex}::${activeNamespace ?? ''}`}
            indexName={activeIndex}
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
          left: `${effectiveIndexesWidth}px`,
          width: `${leftPanelWidth}px`,
        }}
      >
        <NamespacesPanel
          showIndexesToggle={!indexesPanelOpen}
          onToggleIndexesPanel={() => setIndexesPanelOpen(true)}
        />
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
            indexName={activeIndex}
            namespace={activeNamespace ?? undefined}
            profileId={currentProfile.id}
            isDraft={isSelectedDraft}
            isFirstVector={isFirstVector}
            onDraftChange={isSelectedDraft ? draftUpdateHandler ?? undefined : undefined}
            embeddingTextField={embeddingTextField ?? undefined}
            isEmbeddingFieldConfigured={isEmbeddingFieldConfigured}
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
