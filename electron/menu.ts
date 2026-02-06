import { BrowserWindow, Menu, app, shell } from 'electron'
import { windowManager } from './window-manager'
import { connectionStore } from './connection-store'
import { checkForUpdates } from './auto-updater'
import { settingsStore, Theme } from './settings-store'

// Helper to send menu events to the focused window
function sendToFocusedWindow(channel: string, ...args: unknown[]) {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow) {
    focusedWindow.webContents.send(channel, ...args)
  }
}

// Helper to set theme and broadcast to all windows
function setThemeAndBroadcast(theme: Theme) {
  settingsStore.setTheme(theme)
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('settings:theme-changed', theme)
  })
  // Rebuild menu to update checkmarks
  updateThemeMenu()
}

/**
 * Build the Theme submenu items
 */
function buildThemeSubmenu(): Electron.MenuItemConstructorOptions[] {
  const currentTheme = settingsStore.getTheme()

  return [
    {
      label: 'Light',
      type: 'radio',
      checked: currentTheme === 'light',
      click: () => setThemeAndBroadcast('light'),
    },
    {
      label: 'Dark',
      type: 'radio',
      checked: currentTheme === 'dark',
      click: () => setThemeAndBroadcast('dark'),
    },
    {
      label: 'System',
      type: 'radio',
      checked: currentTheme === 'system',
      click: () => setThemeAndBroadcast('system'),
    },
  ]
}

/**
 * Build the Recent Connections submenu items
 */
function buildRecentConnectionsSubmenu(): Electron.MenuItemConstructorOptions[] {
  const profiles = connectionStore.getProfiles()
  const lastActiveId = connectionStore.getLastActiveProfileId()

  if (profiles.length === 0) {
    return [{ label: 'No Recent Connections', enabled: false }]
  }

  const items: Electron.MenuItemConstructorOptions[] = profiles.map(profile => ({
    label: profile.name,
    type: 'normal' as const,
    checked: profile.id === lastActiveId,
    click: () => {
      windowManager.createConnectionWindow(profile)
    },
  }))

  items.push({ type: 'separator' })
  items.push({
    label: 'Clear Recent...',
    enabled: false, // Placeholder - profiles are managed in setup window
  })

  return items
}

/**
 * Build the complete menu template.
 * This is the single source of truth for the application menu structure.
 */
function buildMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  return [
    // App menu (macOS)
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            windowManager.createSettingsWindow()
          },
        },
        {
          label: 'Check for Updates...',
          click: () => {
            checkForUpdates()
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            windowManager.createSetupWindow()
          },
        },
        { type: 'separator' },
        {
          label: 'Recent Connections',
          submenu: buildRecentConnectionsSubmenu(),
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          role: 'close',
        },
      ],
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        {
          label: 'Copy Vectors',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            sendToFocusedWindow('menu:copy-vectors')
          },
          registerAccelerator: false, // Don't override system copy
        },
        {
          label: 'Paste Vectors',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            sendToFocusedWindow('menu:paste-vectors')
          },
          registerAccelerator: false, // Don't override system paste
        },
        { type: 'separator' },
        {
          label: 'Delete Selected',
          accelerator: 'CmdOrCtrl+Backspace',
          click: () => {
            sendToFocusedWindow('menu:delete-selected')
          },
        },
        { type: 'separator' },
        { role: 'selectAll' },
        {
          label: 'Select All Vectors',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            sendToFocusedWindow('menu:select-all-vectors')
          },
        },
      ],
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Refresh Data',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            sendToFocusedWindow('app:refresh')
          },
        },
        { type: 'separator' },
        {
          label: 'Index Mode',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            sendToFocusedWindow('menu:switch-to-index-mode')
          },
        },
        {
          label: 'Assistant Mode',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            sendToFocusedWindow('menu:switch-to-assistant-mode')
          },
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: buildThemeSubmenu(),
        },
        { type: 'separator' },
        {
          label: 'Focus Search',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            sendToFocusedWindow('menu:focus-search')
          },
        },
        {
          label: 'Clear Filters',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            sendToFocusedWindow('menu:clear-filters')
          },
        },
        {
          label: 'Add Filter',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            sendToFocusedWindow('menu:add-filter')
          },
        },
        {
          label: 'Remove Filter',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            sendToFocusedWindow('menu:remove-filter')
          },
        },
        { type: 'separator' },
        {
          label: 'Reload Window',
          accelerator: 'CmdOrCtrl+Shift+R',
          role: 'reload',
        },
        ...(!app.isPackaged
          ? [
              { role: 'forceReload' as const, accelerator: 'CmdOrCtrl+Alt+R' },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Index menu
    {
      label: 'Index',
      submenu: [
        {
          label: 'New Index...',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            sendToFocusedWindow('menu:new-index')
          },
        },
        { type: 'separator' },
        {
          label: 'Duplicate Index',
          click: () => {
            sendToFocusedWindow('menu:duplicate-index')
          },
        },
        {
          label: 'Rename Index',
          click: () => {
            sendToFocusedWindow('menu:rename-index')
          },
        },
        { type: 'separator' },
        {
          label: 'Delete Index',
          click: () => {
            sendToFocusedWindow('menu:delete-index')
          },
        },
      ],
    },

    // Namespace menu
    {
      label: 'Namespace',
      submenu: [
        {
          label: 'New Namespace...',
          click: () => {
            sendToFocusedWindow('menu:new-namespace')
          },
        },
        { type: 'separator' },
        {
          label: 'Duplicate Namespace',
          click: () => {
            sendToFocusedWindow('menu:duplicate-namespace')
          },
        },
        { type: 'separator' },
        {
          label: 'Delete Namespace',
          click: () => {
            sendToFocusedWindow('menu:delete-namespace')
          },
        },
      ],
    },

    // Vector menu
    {
      label: 'Vector',
      submenu: [
        {
          label: 'New Vector',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            sendToFocusedWindow('menu:new-vector')
          },
        },
        { type: 'separator' },
        {
          label: 'Edit Selected Vector',
          accelerator: 'Return',
          click: () => {
            sendToFocusedWindow('menu:edit-vector')
          },
          registerAccelerator: false, // Don't override return key globally
        },
        { type: 'separator' },
        {
          label: 'Delete Selected Vectors',
          accelerator: 'CmdOrCtrl+Backspace',
          click: () => {
            sendToFocusedWindow('menu:delete-selected')
          },
          registerAccelerator: false, // Already registered in Edit menu
        },
        { type: 'separator' },
        {
          label: 'Configure Embedding Function...',
          click: () => {
            sendToFocusedWindow('menu:configure-embedding')
          },
        },
      ],
    },

    // Assistant menu
    {
      label: 'Assistant',
      submenu: [
        {
          label: 'New Assistant...',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            sendToFocusedWindow('menu:new-assistant')
          },
        },
        { type: 'separator' },
        {
          label: 'Chat',
          submenu: [
            {
              label: 'Send Message',
              accelerator: 'CmdOrCtrl+Return',
              click: () => {
                sendToFocusedWindow('menu:send-message')
              },
              registerAccelerator: false, // Don't override globally, handle in component
            },
            {
              label: 'Focus Input',
              accelerator: 'CmdOrCtrl+K',
              click: () => {
                sendToFocusedWindow('menu:focus-chat-input')
              },
            },
            { type: 'separator' },
            {
              label: 'Clear Conversation',
              accelerator: 'CmdOrCtrl+Shift+Backspace',
              click: () => {
                sendToFocusedWindow('menu:clear-conversation')
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Edit Assistant...',
          click: () => {
            sendToFocusedWindow('menu:edit-assistant')
          },
        },
        {
          label: 'Delete Assistant',
          click: () => {
            sendToFocusedWindow('menu:delete-assistant')
          },
        },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Disconnect',
          click: () => {
            sendToFocusedWindow('menu:disconnect')
          },
        },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Pinecone Documentation',
          click: async () => {
            await shell.openExternal('https://docs.pinecone.io/')
          },
        },
        {
          label: 'Pinecone Website',
          click: async () => {
            await shell.openExternal('https://www.pinecone.io/')
          },
        },
        { type: 'separator' },
        {
          label: 'Report an Issue...',
          click: async () => {
            await shell.openExternal('https://github.com/stepandel/pinecone-explorer/issues')
          },
        },
        {
          label: 'Propose a Feature...',
          click: async () => {
            await shell.openExternal('https://github.com/stepandel/pinecone-explorer/issues')
          },
        },
        { type: 'separator' },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            windowManager.createSettingsWindow('shortcuts')
          },
        },
      ],
    },
  ]
}

/**
 * Create the initial application menu
 */
export function createApplicationMenu() {
  const template = buildMenuTemplate()
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Update the menu (rebuilds with current recent connections)
 * Call this when profiles change to refresh the Recent Connections submenu
 */
export function updateRecentConnectionsMenu() {
  // Simply rebuild the entire menu - this ensures Recent Connections is fresh
  const template = buildMenuTemplate()
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Update the menu to reflect the current theme selection
 * Call this when theme changes to update the radio button checkmarks
 */
export function updateThemeMenu() {
  // Rebuild the entire menu to update theme radio buttons
  const template = buildMenuTemplate()
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
