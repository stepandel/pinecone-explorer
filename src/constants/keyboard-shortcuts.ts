/**
 * Centralized keyboard shortcuts configuration.
 * This is the single source of truth for all keyboard shortcuts in the app.
 *
 * Format: { keys, accelerator, action, category }
 * - keys: Display format for UI (e.g., '⌘N')
 * - accelerator: Electron accelerator format (e.g., 'CmdOrCtrl+N')
 * - action: Human-readable description
 * - category: Grouping for settings display
 */

export interface KeyboardShortcut {
  id: string
  keys: string
  accelerator: string
  action: string
  category: 'general' | 'indexes' | 'namespaces' | 'vectors' | 'view' | 'editing'
}

// Helper to check if a keyboard event matches a shortcut
export function matchesShortcut(e: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const accel = shortcut.accelerator.toLowerCase()

  // Parse accelerator
  const wantsMeta = accel.includes('cmdorctrl') || accel.includes('cmd') || accel.includes('meta')
  const wantsShift = accel.includes('shift')
  const wantsAlt = accel.includes('alt') || accel.includes('option')

  // Extract the key (last part after +)
  const parts = accel.split('+')
  let wantsKey = parts[parts.length - 1].trim()

  // Normalize key names
  if (wantsKey === 'backspace') wantsKey = 'backspace'
  if (wantsKey === 'delete') wantsKey = 'delete'
  if (wantsKey === 'return' || wantsKey === 'enter') wantsKey = 'enter'
  if (wantsKey === '/') wantsKey = '/'
  if (wantsKey === ',') wantsKey = ','

  // Get actual key pressed
  // For letter keys with Alt/Option on macOS, e.key produces special characters (e.g., Option+N = ˜)
  // So we use e.code for single letter keys when Alt is pressed
  let actualKey: string
  if (wantsAlt && wantsKey.length === 1 && wantsKey >= 'a' && wantsKey <= 'z') {
    // Use e.code (e.g., 'KeyN') and extract the letter
    actualKey = e.code.replace('Key', '').toLowerCase()
  } else {
    // Use e.key for other keys
    actualKey = e.key.toLowerCase()
    if (actualKey === 'backspace') actualKey = 'backspace'
    if (actualKey === 'delete') actualKey = 'delete'
    if (actualKey === 'enter') actualKey = 'enter'
  }

  // Check modifiers
  const hasMeta = e.metaKey || e.ctrlKey
  const hasShift = e.shiftKey
  const hasAlt = e.altKey

  return (
    hasMeta === wantsMeta &&
    hasShift === wantsShift &&
    hasAlt === wantsAlt &&
    actualKey === wantsKey
  )
}

// All keyboard shortcuts - single source of truth
export const SHORTCUTS: Record<string, KeyboardShortcut> = {
  // General
  NEW_CONNECTION: {
    id: 'new-connection',
    keys: '⌘⇧O',
    accelerator: 'CmdOrCtrl+Shift+O',
    action: 'New Connection',
    category: 'general',
  },
  SETTINGS: {
    id: 'settings',
    keys: '⌘,',
    accelerator: 'CmdOrCtrl+,',
    action: 'Settings',
    category: 'general',
  },
  REFRESH: {
    id: 'refresh',
    keys: '⌘R',
    accelerator: 'CmdOrCtrl+R',
    action: 'Refresh Data',
    category: 'general',
  },
  CLOSE_WINDOW: {
    id: 'close-window',
    keys: '⌘W',
    accelerator: 'CmdOrCtrl+W',
    action: 'Close Window',
    category: 'general',
  },

  // Indexes
  NEW_INDEX: {
    id: 'new-index',
    keys: '⌘⇧N',
    accelerator: 'CmdOrCtrl+Shift+N',
    action: 'New Index',
    category: 'indexes',
  },
  // Namespaces
  NEW_NAMESPACE: {
    id: 'new-namespace',
    keys: '⌘⌥N',
    accelerator: 'CmdOrCtrl+Alt+N',
    action: 'New Namespace',
    category: 'namespaces',
  },

  // Vectors
  NEW_VECTOR: {
    id: 'new-vector',
    keys: '⌘N',
    accelerator: 'CmdOrCtrl+N',
    action: 'New Vector',
    category: 'vectors',
  },
  COPY_VECTORS: {
    id: 'copy-vectors',
    keys: '⌘C',
    accelerator: 'CmdOrCtrl+C',
    action: 'Copy Vectors',
    category: 'vectors',
  },
  PASTE_VECTORS: {
    id: 'paste-vectors',
    keys: '⌘V',
    accelerator: 'CmdOrCtrl+V',
    action: 'Paste Vectors',
    category: 'vectors',
  },
  DELETE_VECTORS: {
    id: 'delete-vectors',
    keys: '⌘⌫',
    accelerator: 'CmdOrCtrl+Backspace',
    action: 'Delete Selected',
    category: 'vectors',
  },
  SELECT_ALL_VECTORS: {
    id: 'select-all-vectors',
    keys: '⌘⇧A',
    accelerator: 'CmdOrCtrl+Shift+A',
    action: 'Select All Vectors',
    category: 'vectors',
  },

  // View
  TOGGLE_LEFT_PANEL: {
    id: 'toggle-left-panel',
    keys: '⌘1',
    accelerator: 'CmdOrCtrl+1',
    action: 'Toggle Namespaces Panel',
    category: 'view',
  },
  TOGGLE_RIGHT_PANEL: {
    id: 'toggle-right-panel',
    keys: '⌘2',
    accelerator: 'CmdOrCtrl+2',
    action: 'Toggle Details Panel',
    category: 'view',
  },
  FOCUS_SEARCH: {
    id: 'focus-search',
    keys: '⌘F',
    accelerator: 'CmdOrCtrl+F',
    action: 'Focus Search',
    category: 'view',
  },
  CLEAR_FILTERS: {
    id: 'clear-filters',
    keys: '⌘⇧F',
    accelerator: 'CmdOrCtrl+Shift+F',
    action: 'Clear Filters',
    category: 'view',
  },

  // Editing
  SAVE: {
    id: 'save',
    keys: '⌘S',
    accelerator: 'CmdOrCtrl+S',
    action: 'Save / Confirm',
    category: 'editing',
  },
  SAVE_ENTER: {
    id: 'save-enter',
    keys: '⌘↵',
    accelerator: 'CmdOrCtrl+Return',
    action: 'Save / Confirm',
    category: 'editing',
  },
  CANCEL: {
    id: 'cancel',
    keys: 'Esc',
    accelerator: 'Escape',
    action: 'Cancel',
    category: 'editing',
  },
  UNDO: {
    id: 'undo',
    keys: '⌘Z',
    accelerator: 'CmdOrCtrl+Z',
    action: 'Undo / Cancel',
    category: 'editing',
  },
  KEYBOARD_SHORTCUTS: {
    id: 'keyboard-shortcuts',
    keys: '⌘/',
    accelerator: 'CmdOrCtrl+/',
    action: 'Keyboard Shortcuts',
    category: 'general',
  },
} as const

// Get shortcuts grouped by category for display
export function getShortcutsByCategory(): Array<{
  category: string
  label: string
  shortcuts: KeyboardShortcut[]
}> {
  const categoryLabels: Record<string, string> = {
    general: 'General',
    indexes: 'Indexes',
    namespaces: 'Namespaces',
    vectors: 'Vectors',
    view: 'View',
    editing: 'Editing',
  }

  const categoryOrder = ['general', 'indexes', 'namespaces', 'vectors', 'view', 'editing']
  const grouped: Record<string, KeyboardShortcut[]> = {}

  // Group shortcuts by category
  Object.values(SHORTCUTS).forEach(shortcut => {
    if (!grouped[shortcut.category]) {
      grouped[shortcut.category] = []
    }
    grouped[shortcut.category].push(shortcut)
  })

  // Return in order, removing duplicates (same keys shown once)
  return categoryOrder
    .filter(cat => grouped[cat]?.length > 0)
    .map(cat => {
      // Remove duplicate key displays within same category
      const seen = new Set<string>()
      const unique = grouped[cat].filter(s => {
        const key = `${s.keys}-${s.action}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return {
        category: cat,
        label: categoryLabels[cat],
        shortcuts: unique,
      }
    })
}
