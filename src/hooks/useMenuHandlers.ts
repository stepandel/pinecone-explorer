import { useEffect, useCallback } from 'react'
import { usePanel } from '../context/PanelContext'
import { useCollection } from '../context/CollectionContext'
import { useDraftCollection } from '../context/DraftCollectionContext'

/**
 * Hook to handle native menu events in the connection window.
 * Dispatches custom window events that components can listen to.
 */
export function useMenuHandlers() {
  const { leftPanelOpen, setLeftPanelOpen, rightPanelOpen, setRightPanelOpen } = usePanel()
  const { activeCollection } = useCollection()
  const { startCreation } = useDraftCollection()

  // View menu handlers
  const handleToggleLeftPanel = useCallback(() => {
    setLeftPanelOpen(!leftPanelOpen)
  }, [leftPanelOpen, setLeftPanelOpen])

  const handleToggleRightPanel = useCallback(() => {
    setRightPanelOpen(!rightPanelOpen)
  }, [rightPanelOpen, setRightPanelOpen])

  const handleFocusSearch = useCallback(() => {
    // Dispatch event for DocumentsView to focus the search input
    window.dispatchEvent(new CustomEvent('menu:focus-search'))
  }, [])

  const handleClearFilters = useCallback(() => {
    // Dispatch event for DocumentsView to clear filters
    window.dispatchEvent(new CustomEvent('menu:clear-filters'))
  }, [])

  // Index menu handlers (formerly collection)
  const handleNewIndex = useCallback(() => {
    startCreation()
  }, [startCreation])

  const handleDuplicateIndex = useCallback(() => {
    // Dispatch event for CollectionPanel to duplicate the active index
    if (activeCollection) {
      window.dispatchEvent(new CustomEvent('menu:duplicate-collection'))
    }
  }, [activeCollection])

  const handleRenameIndex = useCallback(() => {
    // Dispatch event for CollectionPanel to start renaming
    if (activeCollection) {
      window.dispatchEvent(new CustomEvent('menu:rename-collection'))
    }
  }, [activeCollection])

  const handleDeleteIndex = useCallback(() => {
    // Dispatch event for CollectionPanel to delete the active index
    if (activeCollection) {
      window.dispatchEvent(new CustomEvent('menu:delete-collection'))
    }
  }, [activeCollection])

  const handleCopyIndex = useCallback(() => {
    // Dispatch event for CollectionPanel to copy the active index
    if (activeCollection) {
      window.dispatchEvent(new CustomEvent('menu:copy-collection'))
    }
  }, [activeCollection])

  const handlePasteIndex = useCallback(() => {
    // Dispatch event for CollectionPanel to paste index
    window.dispatchEvent(new CustomEvent('menu:paste-collection'))
  }, [])

  // Vector menu handlers (formerly document)
  const handleNewVector = useCallback(() => {
    // Dispatch event for DocumentsView to create a new vector
    if (activeCollection) {
      window.dispatchEvent(new CustomEvent('menu:new-document'))
    }
  }, [activeCollection])

  const handleEditVector = useCallback(() => {
    // Dispatch event for DocumentsView to edit the selected vector
    window.dispatchEvent(new CustomEvent('menu:edit-document'))
  }, [])

  const handleDeleteSelected = useCallback(() => {
    // Dispatch event for DocumentsView to delete selected vectors
    window.dispatchEvent(new CustomEvent('menu:delete-selected'))
  }, [])

  const handleCopyVectors = useCallback(() => {
    // Dispatch event for DocumentsView to copy selected vectors
    window.dispatchEvent(new CustomEvent('menu:copy-documents'))
  }, [])

  const handlePasteVectors = useCallback(() => {
    // Dispatch event for DocumentsView to paste vectors
    window.dispatchEvent(new CustomEvent('menu:paste-documents'))
  }, [])

  const handleSelectAllVectors = useCallback(() => {
    // Dispatch event for DocumentsView to select all vectors
    window.dispatchEvent(new CustomEvent('menu:select-all-documents'))
  }, [])

  const handleConfigureEmbedding = useCallback(() => {
    // Dispatch event to open embedding configuration
    window.dispatchEvent(new CustomEvent('menu:configure-embedding'))
  }, [])

  // Window menu handlers
  const handleDisconnect = useCallback(() => {
    window.electronAPI.window.closeCurrent()
  }, [])

  // Help menu handlers
  const handleShowShortcuts = useCallback(() => {
    // Open settings window which contains the keyboard shortcuts section
    window.electronAPI.settings.openWindow()
  }, [])

  // Subscribe to menu events from main process
  useEffect(() => {
    // View menu
    const unsubToggleLeft = window.electronAPI.menu.onToggleLeftPanel(handleToggleLeftPanel)
    const unsubToggleRight = window.electronAPI.menu.onToggleRightPanel(handleToggleRightPanel)
    const unsubFocusSearch = window.electronAPI.menu.onFocusSearch(handleFocusSearch)
    const unsubClearFilters = window.electronAPI.menu.onClearFilters(handleClearFilters)

    // Index menu
    const unsubNewIndex = window.electronAPI.menu.onNewIndex(handleNewIndex)
    const unsubDuplicateIndex = window.electronAPI.menu.onDuplicateIndex(handleDuplicateIndex)
    const unsubRenameIndex = window.electronAPI.menu.onRenameIndex(handleRenameIndex)
    const unsubDeleteIndex = window.electronAPI.menu.onDeleteIndex(handleDeleteIndex)
    const unsubCopyIndex = window.electronAPI.menu.onCopyIndex(handleCopyIndex)
    const unsubPasteIndex = window.electronAPI.menu.onPasteIndex(handlePasteIndex)

    // Vector menu
    const unsubNewVector = window.electronAPI.menu.onNewVector(handleNewVector)
    const unsubEditVector = window.electronAPI.menu.onEditVector(handleEditVector)
    const unsubDeleteSelected = window.electronAPI.menu.onDeleteSelected(handleDeleteSelected)
    const unsubCopyVectors = window.electronAPI.menu.onCopyVectors(handleCopyVectors)
    const unsubPasteVectors = window.electronAPI.menu.onPasteVectors(handlePasteVectors)
    const unsubSelectAllVectors = window.electronAPI.menu.onSelectAllVectors(handleSelectAllVectors)
    const unsubConfigureEmbedding = window.electronAPI.menu.onConfigureEmbedding(handleConfigureEmbedding)

    // Window menu
    const unsubDisconnect = window.electronAPI.menu.onDisconnect(handleDisconnect)

    // Help menu
    const unsubShowShortcuts = window.electronAPI.menu.onShowShortcuts(handleShowShortcuts)

    return () => {
      unsubToggleLeft()
      unsubToggleRight()
      unsubFocusSearch()
      unsubClearFilters()
      unsubNewIndex()
      unsubDuplicateIndex()
      unsubRenameIndex()
      unsubDeleteIndex()
      unsubCopyIndex()
      unsubPasteIndex()
      unsubNewVector()
      unsubEditVector()
      unsubDeleteSelected()
      unsubCopyVectors()
      unsubPasteVectors()
      unsubSelectAllVectors()
      unsubConfigureEmbedding()
      unsubDisconnect()
      unsubShowShortcuts()
    }
  }, [
    handleToggleLeftPanel,
    handleToggleRightPanel,
    handleFocusSearch,
    handleClearFilters,
    handleNewIndex,
    handleDuplicateIndex,
    handleRenameIndex,
    handleDeleteIndex,
    handleCopyIndex,
    handlePasteIndex,
    handleNewVector,
    handleEditVector,
    handleDeleteSelected,
    handleCopyVectors,
    handlePasteVectors,
    handleSelectAllVectors,
    handleConfigureEmbedding,
    handleDisconnect,
    handleShowShortcuts,
  ])
}
