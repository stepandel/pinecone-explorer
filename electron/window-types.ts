export type WindowType = 'setup' | 'connection'

export interface WindowInfo {
  type: WindowType
  windowId?: string  // UUID for connection windows (for tabs)
  profileId?: string // UUID for connection windows (for pinecone)
}

export interface ConnectionWindowData {
  windowId: string
  profileId: string
}
