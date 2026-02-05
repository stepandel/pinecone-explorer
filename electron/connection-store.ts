import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import { existsSync } from 'fs'
import { ConnectionProfile, EmbeddingConfig, HybridEmbeddingConfig } from './types'
import { getEncryptionKey } from './secure-key-manager'

interface StoreSchema {
  profiles: ConnectionProfile[]
  lastActiveProfileId: string | null
  // Store embedding overrides separately so they persist even for unsaved profiles
  // Key format: "profileId:indexName"
  embeddingOverrides: Record<string, EmbeddingConfig>
  // Store hybrid embedding overrides separately
  // Key format: "profileId:indexName"
  hybridEmbeddingOverrides: Record<string, HybridEmbeddingConfig>
}

// Lazy-initialized store (requires app to be ready for keychain access)
let store: Store<StoreSchema> | null = null

function getStore(): Store<StoreSchema> {
  if (!store) {
    try {
      store = new Store<StoreSchema>({
        name: 'pinecone-connections',
        defaults: {
          profiles: [],
          lastActiveProfileId: null,
          embeddingOverrides: {},
          hybridEmbeddingOverrides: {},
        },
        encryptionKey: getEncryptionKey(),
      })

      // Test if we can read the store (will throw if encryption key is wrong)
      store.get('profiles')

      // Migrate from old Chroma store if exists and new store is empty
      migrateFromChromaStore(store)
    } catch (error) {
      console.error('[ConnectionStore] Failed to initialize store:', error)

      // If decryption failed, the encryption key changed
      // Clear the corrupted store and start fresh
      const storePath = path.join(app.getPath('userData'), 'pinecone-connections.json')
      if (existsSync(storePath)) {
        console.warn('[ConnectionStore] Removing corrupted store file to start fresh')
        try {
          const { unlinkSync } = require('fs')
          unlinkSync(storePath)
        } catch {
          // Ignore deletion errors
        }
      }

      // Create a fresh store
      store = new Store<StoreSchema>({
        name: 'pinecone-connections',
        defaults: {
          profiles: [],
          lastActiveProfileId: null,
          embeddingOverrides: {},
          hybridEmbeddingOverrides: {},
        },
        encryptionKey: getEncryptionKey(),
      })
    }
  }
  return store
}

/**
 * Migrate data from old Chroma Explorer store if it exists
 * Note: Only profile names are migrated; users need to re-enter Pinecone API keys
 */
function migrateFromChromaStore(newStore: Store<StoreSchema>): void {
  // Only migrate if new store is empty
  const currentProfiles = newStore.get('profiles', [])
  if (currentProfiles.length > 0) return

  // Check if legacy Chroma store file exists
  const legacyPaths = [
    path.join(app.getPath('userData'), 'chroma-connections-v2.json'),
    path.join(app.getPath('userData'), 'chroma-connections.json'),
  ]

  for (const legacyPath of legacyPaths) {
    if (!existsSync(legacyPath)) continue

    try {
      console.log(`[ConnectionStore] Found legacy Chroma store at ${legacyPath}`)

      // We can't decrypt the old store (different encryption), so just log migration notice
      console.log('[ConnectionStore] Note: Existing ChromaDB profiles cannot be automatically migrated.')
      console.log('[ConnectionStore] Users will need to create new profiles with Pinecone API keys.')
      break
    } catch (error) {
      console.warn('[ConnectionStore] Could not check legacy store:', error)
    }
  }
}

export class ConnectionStore {
  getProfiles(): ConnectionProfile[] {
    return getStore().get('profiles', [])
  }

  getProfile(id: string): ConnectionProfile | undefined {
    return this.getProfiles().find((p) => p.id === id)
  }

  saveProfile(profile: ConnectionProfile): void {
    const profiles = this.getProfiles()
    const existingIndex = profiles.findIndex((p) => p.id === profile.id)

    if (existingIndex >= 0) {
      // Update existing profile
      profiles[existingIndex] = { ...profile, lastUsed: Date.now() }
    } else {
      // Add new profile
      profiles.push({ ...profile, createdAt: Date.now(), lastUsed: Date.now() })
    }

    getStore().set('profiles', profiles)
  }

  deleteProfile(id: string): void {
    const profiles = this.getProfiles().filter((p) => p.id !== id)
    getStore().set('profiles', profiles)

    // Clear last active if it was the deleted profile
    if (this.getLastActiveProfileId() === id) {
      this.setLastActiveProfileId(null)
    }

    // Clear any embedding overrides for this profile
    const overrides = getStore().get('embeddingOverrides', {})
    const newOverrides: Record<string, EmbeddingConfig> = {}
    for (const [key, value] of Object.entries(overrides)) {
      if (!key.startsWith(`${id}:`)) {
        newOverrides[key] = value
      }
    }
    getStore().set('embeddingOverrides', newOverrides)

    // Clear any hybrid embedding overrides for this profile
    const hybridOverrides = getStore().get('hybridEmbeddingOverrides', {})
    const newHybridOverrides: Record<string, HybridEmbeddingConfig> = {}
    for (const [key, value] of Object.entries(hybridOverrides)) {
      if (!key.startsWith(`${id}:`)) {
        newHybridOverrides[key] = value
      }
    }
    getStore().set('hybridEmbeddingOverrides', newHybridOverrides)
  }

  getLastActiveProfileId(): string | null {
    return getStore().get('lastActiveProfileId', null)
  }

  setLastActiveProfileId(id: string | null): void {
    getStore().set('lastActiveProfileId', id)
  }

  /**
   * Get embedding override for a specific profile and index
   */
  getEmbeddingOverride(profileId: string, indexName: string): EmbeddingConfig | null {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('embeddingOverrides', {})
    return overrides[key] ?? null
  }

  /**
   * Set embedding override for a specific profile and index
   */
  setEmbeddingOverride(profileId: string, indexName: string, override: EmbeddingConfig): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('embeddingOverrides', {})
    overrides[key] = override
    getStore().set('embeddingOverrides', overrides)
  }

  /**
   * Clear embedding override for a specific profile and index
   */
  clearEmbeddingOverride(profileId: string, indexName: string): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('embeddingOverrides', {})
    delete overrides[key]
    getStore().set('embeddingOverrides', overrides)
  }

  /**
   * Get all embedding overrides for a profile
   */
  getProfileEmbeddingOverrides(profileId: string): Record<string, EmbeddingConfig> {
    const overrides = getStore().get('embeddingOverrides', {})
    const result: Record<string, EmbeddingConfig> = {}

    for (const [key, value] of Object.entries(overrides)) {
      if (key.startsWith(`${profileId}:`)) {
        const indexName = key.substring(profileId.length + 1)
        result[indexName] = value
      }
    }

    return result
  }

  /**
   * Update profile's default embedding config
   */
  setDefaultEmbeddingConfig(profileId: string, config: EmbeddingConfig | undefined): void {
    const profiles = this.getProfiles()
    const profile = profiles.find((p) => p.id === profileId)

    if (profile) {
      profile.defaultEmbeddingConfig = config
      getStore().set('profiles', profiles)
    }
  }

  /**
   * Get text field override for a specific profile and index
   * Returns the metadata field name used for text embedding, or null if not set
   */
  getTextFieldOverride(profileId: string, indexName: string): string | null {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('textFieldOverrides', {}) as Record<string, string>
    return overrides[key] ?? null
  }

  /**
   * Set text field override for a specific profile and index
   */
  setTextFieldOverride(profileId: string, indexName: string, textField: string): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('textFieldOverrides', {}) as Record<string, string>
    overrides[key] = textField
    getStore().set('textFieldOverrides', overrides)
  }

  /**
   * Clear text field override for a specific profile and index
   */
  clearTextFieldOverride(profileId: string, indexName: string): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('textFieldOverrides', {}) as Record<string, string>
    delete overrides[key]
    getStore().set('textFieldOverrides', overrides)
  }

  /**
   * Get hybrid embedding override for a specific profile and index
   */
  getHybridEmbeddingOverride(profileId: string, indexName: string): HybridEmbeddingConfig | null {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('hybridEmbeddingOverrides', {})
    return overrides[key] ?? null
  }

  /**
   * Set hybrid embedding override for a specific profile and index
   */
  setHybridEmbeddingOverride(profileId: string, indexName: string, override: HybridEmbeddingConfig): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('hybridEmbeddingOverrides', {})
    overrides[key] = override
    getStore().set('hybridEmbeddingOverrides', overrides)
  }

  /**
   * Clear hybrid embedding override for a specific profile and index
   */
  clearHybridEmbeddingOverride(profileId: string, indexName: string): void {
    const key = `${profileId}:${indexName}`
    const overrides = getStore().get('hybridEmbeddingOverrides', {})
    delete overrides[key]
    getStore().set('hybridEmbeddingOverrides', overrides)
  }

  /**
   * Get all hybrid embedding overrides for a profile
   */
  getProfileHybridEmbeddingOverrides(profileId: string): Record<string, HybridEmbeddingConfig> {
    const overrides = getStore().get('hybridEmbeddingOverrides', {})
    const result: Record<string, HybridEmbeddingConfig> = {}

    for (const [key, value] of Object.entries(overrides)) {
      if (key.startsWith(`${profileId}:`)) {
        const indexName = key.substring(profileId.length + 1)
        result[indexName] = value
      }
    }

    return result
  }

  /**
   * Get the preferred explorer mode for a profile
   */
  getPreferredMode(profileId: string): 'index' | 'assistant' | null {
    const profile = this.getProfile(profileId)
    return profile?.preferredMode ?? null
  }

  /**
   * Set the preferred explorer mode for a profile
   */
  setPreferredMode(profileId: string, mode: 'index' | 'assistant'): void {
    const profiles = this.getProfiles()
    const profile = profiles.find((p) => p.id === profileId)

    if (profile) {
      profile.preferredMode = mode
      getStore().set('profiles', profiles)
    }
  }
}

export const connectionStore = new ConnectionStore()
