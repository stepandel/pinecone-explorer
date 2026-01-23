import { useEffect, useCallback } from 'react'
import { usePanel } from '../context/PanelContext'
import { useSelection } from '../context/SelectionContext'
import { useDraftIndex } from '../context/DraftIndexContext'
import { useDraftNamespace } from '../context/DraftNamespaceContext'

/**
 * Hook to handle native menu events in the connection window.
 * Dispatches custom window events that components can listen to.
 */
export function useMenuHandlers() {
  const { leftPanelOpen, setLeftPanelOpen, rightPanelOpen, setRightPanelOpen } = usePanel()
  const { activeIndex, activeNamespace } = useSelection()
  const { startCreation: startIndexCreation } = useDraftIndex()
  const { startCreation: startNamespaceCreation } = useDraftNamespace()

  // View menu handlers
  const handleToggleLeftPanel = useCallback(() => {
    setLeftPanelOpen(!leftPanelOpen)
  }, [leftPanelOpen, setLeftPanelOpen])

  const handleToggleRightPanel = useCallback(() => {
    setRightPanelOpen(!rightPanelOpen)
  }, [rightPanelOpen, setRightPanelOpen])

  const handleFocusSearch = useCallback(() => {
    // Dispatch event for VectorsView to focus the search input
    window.dispatchEvent(new CustomEvent('menu:focus-search'))
  }, [])

  const handleClearFilters = useCallback(() => {
    // Dispatch event for VectorsView to clear filters
    window.dispatchEvent(new CustomEvent('menu:clear-filters'))
  }, [])

  // Index menu handlers
  const handleNewIndex = useCallback(() => {
    startIndexCreation()
  }, [startIndexCreation])

  const handleDuplicateIndex = useCallback(() => {
    // Dispatch event to duplicate the active index
    if (activeIndex) {
      window.dispatchEvent(new CustomEvent('menu:duplicate-index'))
    }
  }, [activeIndex])

  const handleRenameIndex = useCallback(() => {
    // Dispatch event to start renaming
    if (activeIndex) {
      window.dispatchEvent(new CustomEvent('menu:rename-index'))
    }
  }, [activeIndex])

  const handleDeleteIndex = useCallback(() => {
    // Dispatch event to delete the active index
    if (activeIndex) {
      window.dispatchEvent(new CustomEvent('menu:delete-index'))
    }
  }, [activeIndex])

  // Namespace menu handlers
  const handleNewNamespace = useCallback(() => {
    if (activeIndex) {
      startNamespaceCreation(activeIndex)
    }
  }, [activeIndex, startNamespaceCreation])

  const handleDuplicateNamespace = useCallback(() => {
    // Dispatch event to duplicate the active namespace
    if (activeIndex && activeNamespace !== null) {
      window.dispatchEvent(new CustomEvent('menu:duplicate-namespace'))
    }
  }, [activeIndex, activeNamespace])

  const handleDeleteNamespace = useCallback(() => {
    // Dispatch event to delete the active namespace
    if (activeIndex && activeNamespace !== null) {
      window.dispatchEvent(new CustomEvent('menu:delete-namespace'))
    }
  }, [activeIndex, activeNamespace])

  // Vector menu handlers
  const handleNewVector = useCallback(() => {
    // Dispatch event for VectorsView to create a new vector
    if (activeIndex) {
      window.dispatchEvent(new CustomEvent('menu:new-vector'))
    }
  }, [activeIndex])

  const handleEditVector = useCallback(() => {
    // Dispatch event for VectorsView to edit the selected vector
    window.dispatchEvent(new CustomEvent('menu:edit-vector'))
  }, [])

  const handleDeleteSelected = useCallback(() => {
    // Dispatch event for VectorsView to delete selected vectors
    window.dispatchEvent(new CustomEvent('menu:delete-selected'))
  }, [])

  const handleCopyVectors = useCallback(() => {
    // Dispatch event for VectorsView to copy selected vectors
    window.dispatchEvent(new CustomEvent('menu:copy-vectors'))
  }, [])

  const handlePasteVectors = useCallback(() => {
    // Dispatch event for VectorsView to paste vectors
    window.dispatchEvent(new CustomEvent('menu:paste-vectors'))
  }, [])

  const handleSelectAllVectors = useCallback(() => {
    // Dispatch event for VectorsView to select all vectors
    window.dispatchEvent(new CustomEvent('menu:select-all-vectors'))
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

    // Namespace menu
    const unsubNewNamespace = window.electronAPI.menu.onNewNamespace(handleNewNamespace)
    const unsubDuplicateNamespace = window.electronAPI.menu.onDuplicateNamespace(handleDuplicateNamespace)
    const unsubDeleteNamespace = window.electronAPI.menu.onDeleteNamespace(handleDeleteNamespace)

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
      unsubNewNamespace()
      unsubDuplicateNamespace()
      unsubDeleteNamespace()
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
    handleNewNamespace,
    handleDuplicateNamespace,
    handleDeleteNamespace,
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
