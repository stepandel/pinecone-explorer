import { useEffect, useRef } from 'react'
import { useSelection } from '../context/SelectionContext'
import { useDraftIndex } from '../context/DraftIndexContext'
import { useDraftNamespace } from '../context/DraftNamespaceContext'

/**
 * Hook to handle native menu events in the connection window.
 * Dispatches custom window events that components can listen to.
 *
 * Uses refs for all handlers to avoid re-subscribing to Electron IPC
 * events on every state change. This prevents constant event listener
 * registration/deregistration which causes performance issues.
 */
export function useMenuHandlers() {
  const { activeIndex, activeNamespace } = useSelection()
  const { startCreation: startIndexCreation } = useDraftIndex()
  const { startCreation: startNamespaceCreation } = useDraftNamespace()

  // Store current values in refs for stable access in event handlers
  const stateRef = useRef({
    activeIndex,
    activeNamespace,
    startIndexCreation,
    startNamespaceCreation,
  })

  // Update ref when dependencies change (doesn't trigger re-subscription)
  useEffect(() => {
    stateRef.current = {
      activeIndex,
      activeNamespace,
      startIndexCreation,
      startNamespaceCreation,
    }
  })

  // Subscribe once on mount with stable handlers that read from refs
  useEffect(() => {
    // View menu handlers
    const handleFocusSearch = () => {
      window.dispatchEvent(new CustomEvent('menu:focus-search'))
    }

    const handleClearFilters = () => {
      window.dispatchEvent(new CustomEvent('menu:clear-filters'))
    }

    const handleAddFilter = () => {
      window.dispatchEvent(new CustomEvent('menu:add-filter'))
    }

    const handleRemoveFilter = () => {
      window.dispatchEvent(new CustomEvent('menu:remove-filter'))
    }

    // Index menu handlers
    const handleNewIndex = () => {
      stateRef.current.startIndexCreation()
    }

    const handleDuplicateIndex = () => {
      if (stateRef.current.activeIndex) {
        window.dispatchEvent(new CustomEvent('menu:duplicate-index'))
      }
    }

    const handleRenameIndex = () => {
      if (stateRef.current.activeIndex) {
        window.dispatchEvent(new CustomEvent('menu:rename-index'))
      }
    }

    const handleDeleteIndex = () => {
      if (stateRef.current.activeIndex) {
        window.dispatchEvent(new CustomEvent('menu:delete-index'))
      }
    }

    // Namespace menu handlers
    const handleNewNamespace = () => {
      const { activeIndex } = stateRef.current
      if (activeIndex) {
        stateRef.current.startNamespaceCreation(activeIndex)
      }
    }

    const handleDuplicateNamespace = () => {
      const { activeIndex, activeNamespace } = stateRef.current
      if (activeIndex && activeNamespace !== null) {
        window.dispatchEvent(new CustomEvent('menu:duplicate-namespace'))
      }
    }

    const handleDeleteNamespace = () => {
      const { activeIndex, activeNamespace } = stateRef.current
      if (activeIndex && activeNamespace !== null) {
        window.dispatchEvent(new CustomEvent('menu:delete-namespace'))
      }
    }

    // Vector menu handlers
    const handleNewVector = () => {
      if (stateRef.current.activeIndex) {
        window.dispatchEvent(new CustomEvent('menu:new-vector'))
      }
    }

    const handleEditVector = () => {
      window.dispatchEvent(new CustomEvent('menu:edit-vector'))
    }

    const handleDeleteSelected = () => {
      window.dispatchEvent(new CustomEvent('menu:delete-selected'))
    }

    const handleCopyVectors = () => {
      window.dispatchEvent(new CustomEvent('menu:copy-vectors'))
    }

    const handlePasteVectors = () => {
      window.dispatchEvent(new CustomEvent('menu:paste-vectors'))
    }

    const handleSelectAllVectors = () => {
      window.dispatchEvent(new CustomEvent('menu:select-all-vectors'))
    }

    const handleConfigureEmbedding = () => {
      window.dispatchEvent(new CustomEvent('menu:configure-embedding'))
    }

    // Window menu handlers
    const handleDisconnect = () => {
      window.electronAPI.window.closeCurrent()
    }

    // Help menu handlers
    const handleShowShortcuts = () => {
      window.electronAPI.settings.openWindow()
    }

    // Subscribe to menu events from main process
    // View menu
    const unsubFocusSearch = window.electronAPI.menu.onFocusSearch(handleFocusSearch)
    const unsubClearFilters = window.electronAPI.menu.onClearFilters(handleClearFilters)
    const unsubAddFilter = window.electronAPI.menu.onAddFilter(handleAddFilter)
    const unsubRemoveFilter = window.electronAPI.menu.onRemoveFilter(handleRemoveFilter)

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
      unsubFocusSearch()
      unsubClearFilters()
      unsubAddFilter()
      unsubRemoveFilter()
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
  }, []) // Empty deps - subscribe once on mount
}
