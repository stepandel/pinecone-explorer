import { useState, useCallback, useEffect } from 'react'
import { useCollection } from '../../context/CollectionContext'
import { useDraftCollection } from '../../context/DraftCollectionContext'
import { usePanel } from '../../context/PanelContext'
import { usePinecone } from '../../providers/PineconeProvider'
import { IndexesPanel, INDEXES_PANEL_WIDTH } from '../indexes/IndexesPanel'
import { NamespacesPanel } from '../namespaces/NamespacesPanel'
import { CollectionConfigView } from '../collections/CollectionConfigView'
import DocumentsView from '../documents/DocumentsView'
import DocumentDetailPanel from '../documents/DocumentDetailPanel'

interface DocumentRecord {
  id: string
  document: string | null
  metadata: Record<string, unknown> | null
  embedding: number[] | null
}

export function MainContent() {
  const { activeIndex, activeNamespace } = useCollection()
  const { draftCollection } = useDraftCollection()
  const { currentProfile } = usePinecone()
  const {
    leftPanelOpen,
    leftPanelWidth,
    setLeftPanelWidth,
    rightPanelOpen,
    rightPanelWidth,
    setRightPanelWidth,
    selectedDocumentIds,
    primarySelectedDocumentId,
    selectionAnchor,
    selectDocument,
    toggleDocumentSelection,
    selectDocumentRange,
    addToSelection,
    clearSelection,
    setSelectionAnchor,
  } = usePanel()
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null)
  const [isSelectedDraft, setIsSelectedDraft] = useState(false)
  const [isFirstDocument, setIsFirstDocument] = useState(false)
  const [draftUpdateHandler, setDraftUpdateHandler] = useState<((updates: { id?: string; document?: string; metadata?: Record<string, unknown> }) => void) | null>(null)

  // Resize state
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  const handleSelectedDocumentChange = (document: DocumentRecord | null, isDraft: boolean) => {
    setSelectedDocument(document)
    setIsSelectedDraft(isDraft)
  }

  const handleExposeDraftHandler = (handler: ((updates: { id?: string; document?: string; metadata?: Record<string, unknown> }) => void) | null) => {
    setDraftUpdateHandler(() => handler)
  }

  const handleIsFirstDocumentChange = (isFirst: boolean) => {
    setIsFirstDocument(isFirst)
  }

  // Handle mouse move for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizingLeft) {
      // Adjust for the fixed IndexesPanel width
      const newWidth = Math.max(180, Math.min(400, e.clientX - INDEXES_PANEL_WIDTH))
      setLeftPanelWidth(newWidth)
    } else if (isResizingRight) {
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX))
      setRightPanelWidth(newWidth)
    }
  }, [isResizingLeft, isResizingRight, setLeftPanelWidth, setRightPanelWidth])

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    setIsResizingLeft(false)
    setIsResizingRight(false)
  }, [])

  // Add/remove global event listeners for resize
  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
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
  }, [isResizingLeft, isResizingRight, handleMouseMove, handleMouseUp])

  // Calculate main content padding based on open panels
  // Always account for fixed IndexesPanel, plus the namespaces panel if open
  const leftPadding = INDEXES_PANEL_WIDTH + (leftPanelOpen ? leftPanelWidth : 0)
  const rightPadding = rightPanelOpen ? rightPanelWidth : 0

  // Determine what to show in the main area
  const showDocuments = activeIndex && activeNamespace !== null

  return (
    <main className="flex-1 relative overflow-hidden bg-content">
      {/* Fixed IndexesPanel - always visible */}
      <div
        className="absolute top-0 left-0 h-full z-30"
        style={{ width: `${INDEXES_PANEL_WIDTH}px` }}
      >
        <IndexesPanel />
      </div>

      {/* Main content area */}
      <div
        className="h-full transition-[padding] duration-200"
        style={{ paddingLeft: `${leftPadding}px`, paddingRight: `${rightPadding}px` }}
      >
        {draftCollection ? (
          <CollectionConfigView />
        ) : showDocuments ? (
          <DocumentsView
            collectionName={activeIndex}
            namespace={activeNamespace}
            selectedDocumentIds={selectedDocumentIds}
            primarySelectedDocumentId={primarySelectedDocumentId}
            selectionAnchor={selectionAnchor}
            onSingleSelect={selectDocument}
            onToggleSelect={toggleDocumentSelection}
            onRangeSelect={selectDocumentRange}
            onAddToSelection={addToSelection}
            onClearSelection={clearSelection}
            onSetSelectionAnchor={setSelectionAnchor}
            onSelectedDocumentChange={handleSelectedDocumentChange}
            onExposeDraftHandler={handleExposeDraftHandler}
            onIsFirstDocumentChange={handleIsFirstDocumentChange}
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
          left: `${INDEXES_PANEL_WIDTH}px`,
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

      {/* Right Panel: Document Detail - Floating glass overlay */}
      <aside
        className={`absolute top-0 right-0 h-full transition-transform duration-200 ${
          rightPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: `${rightPanelWidth}px` }}
      >
        {selectedDocument && activeIndex && currentProfile ? (
          <DocumentDetailPanel
            document={selectedDocument}
            collectionName={activeIndex}
            profileId={currentProfile.id}
            isDraft={isSelectedDraft}
            isFirstDocument={isFirstDocument}
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
