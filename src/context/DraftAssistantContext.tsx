import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useCreateAssistantMutation, useUpdateAssistantMutation, useAssistantDetailQuery } from '../hooks/useAssistantQueries'
import { useAssistantSelection } from './AssistantSelectionContext'
import type { AssistantModel } from '../../electron/types'

export interface DraftAssistant {
  name: string
  instructions: string
  metadata: string // JSON string for editing
  region: 'us' | 'eu'
}

interface DraftAssistantContextValue {
  draftAssistant: DraftAssistant | null
  isEditing: boolean
  editingAssistantName: string | null
  isSubmitting: boolean
  validationErrors: Record<string, string>
  startCreation: () => void
  startEditing: (assistantName: string) => void
  updateDraft: (updates: Partial<DraftAssistant>) => void
  cancelDraft: () => void
  saveDraft: () => Promise<void>
}

const DraftAssistantContext = createContext<DraftAssistantContextValue | null>(null)

// Validation constants
const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 63
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const INSTRUCTIONS_MAX_LENGTH = 16 * 1024 // 16KB

// Helper: create initial draft with defaults
function createInitialDraft(): DraftAssistant {
  return {
    name: '',
    instructions: '',
    metadata: '',
    region: 'us',
  }
}

// Helper: create draft from existing assistant
function createDraftFromAssistant(assistant: AssistantModel): DraftAssistant {
  return {
    name: assistant.name,
    instructions: assistant.instructions || '',
    metadata: assistant.metadata ? JSON.stringify(assistant.metadata, null, 2) : '',
    region: 'us', // Region is set at creation time; cannot be changed
  }
}

// Helper: validate draft and return errors
function validateDraft(draft: DraftAssistant, isEditing: boolean): Record<string, string> {
  const errors: Record<string, string> = {}

  // Name validation (only for create, not edit)
  if (!isEditing) {
    const name = draft.name.trim()
    if (!name) {
      errors.name = 'Name is required'
    } else if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
      errors.name = `Name must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters`
    } else if (!NAME_PATTERN.test(name)) {
      errors.name = 'Name must be lowercase alphanumeric with hyphens (e.g., my-assistant)'
    }
  }

  // Instructions validation
  if (draft.instructions && draft.instructions.length > INSTRUCTIONS_MAX_LENGTH) {
    errors.instructions = `Instructions must be under ${INSTRUCTIONS_MAX_LENGTH / 1024}KB`
  }

  // Metadata validation (must be valid JSON if provided)
  if (draft.metadata.trim()) {
    try {
      const parsed = JSON.parse(draft.metadata)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        errors.metadata = 'Metadata must be a JSON object'
      } else {
        // Check that all values are strings
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value !== 'string') {
            errors.metadata = `Metadata value for "${key}" must be a string`
            break
          }
        }
      }
    } catch {
      errors.metadata = 'Invalid JSON format'
    }
  }

  return errors
}

export function DraftAssistantProvider({ children }: { children: ReactNode }) {
  const [draftAssistant, setDraftAssistant] = useState<DraftAssistant | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editingAssistantName, setEditingAssistantName] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const { currentProfile } = usePinecone()
  const { setActiveAssistant } = useAssistantSelection()
  const createMutation = useCreateAssistantMutation(currentProfile?.id || '')
  const updateMutation = useUpdateAssistantMutation(currentProfile?.id || '')

  // Fetch assistant detail when editing
  const { data: editingAssistant } = useAssistantDetailQuery(
    currentProfile?.id || null,
    editingAssistantName,
    !!editingAssistantName
  )

  // Update draft when editing assistant data loads
  useEffect(() => {
    if (isEditing && editingAssistant && editingAssistantName) {
      setDraftAssistant(createDraftFromAssistant(editingAssistant))
    }
  }, [isEditing, editingAssistant, editingAssistantName])

  const startCreation = useCallback(() => {
    setDraftAssistant(createInitialDraft())
    setIsEditing(false)
    setEditingAssistantName(null)
    setValidationErrors({})
    setActiveAssistant(null)
  }, [setActiveAssistant])

  const startEditing = useCallback((assistantName: string) => {
    setEditingAssistantName(assistantName)
    setIsEditing(true)
    setValidationErrors({})
    // Draft will be populated when editingAssistant data loads
    setDraftAssistant({
      name: assistantName,
      instructions: '',
      metadata: '',
      region: 'us',
    })
    setActiveAssistant(null)
  }, [setActiveAssistant])

  const updateDraft = useCallback((updates: Partial<DraftAssistant>) => {
    setDraftAssistant(prev => prev ? { ...prev, ...updates } : prev)
    // Clear validation errors for updated fields
    const updatedKeys = Object.keys(updates)
    if (updatedKeys.length > 0) {
      setValidationErrors(prev => {
        const next = { ...prev }
        updatedKeys.forEach(key => delete next[key])
        return next
      })
    }
  }, [])

  const cancelDraft = useCallback(() => {
    setDraftAssistant(null)
    setIsEditing(false)
    setEditingAssistantName(null)
    setValidationErrors({})
  }, [])

  const saveDraft = useCallback(async () => {
    if (!draftAssistant || !currentProfile) return

    // Validate
    const errors = validateDraft(draftAssistant, isEditing)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      // Parse metadata
      let metadata: Record<string, string> | undefined
      if (draftAssistant.metadata.trim()) {
        metadata = JSON.parse(draftAssistant.metadata)
      }

      if (isEditing && editingAssistantName) {
        // Update existing assistant
        await updateMutation.mutateAsync({
          name: editingAssistantName,
          params: {
            instructions: draftAssistant.instructions || undefined,
            metadata,
          },
        })
        // Select the updated assistant
        setActiveAssistant(editingAssistantName)
      } else {
        // Create new assistant
        await createMutation.mutateAsync({
          name: draftAssistant.name.trim(),
          instructions: draftAssistant.instructions || undefined,
          metadata,
          region: draftAssistant.region,
        })
        // Select the new assistant
        setActiveAssistant(draftAssistant.name.trim())
      }

      // Clear draft on success
      setDraftAssistant(null)
      setIsEditing(false)
      setEditingAssistantName(null)
      setValidationErrors({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save assistant'
      setValidationErrors({ _form: message })
    } finally {
      setIsSubmitting(false)
    }
  }, [draftAssistant, currentProfile, isEditing, editingAssistantName, createMutation, updateMutation, setActiveAssistant])

  const value = useMemo<DraftAssistantContextValue>(() => ({
    draftAssistant,
    isEditing,
    editingAssistantName,
    isSubmitting,
    validationErrors,
    startCreation,
    startEditing,
    updateDraft,
    cancelDraft,
    saveDraft,
  }), [
    draftAssistant,
    isEditing,
    editingAssistantName,
    isSubmitting,
    validationErrors,
    startCreation,
    startEditing,
    updateDraft,
    cancelDraft,
    saveDraft,
  ])

  return <DraftAssistantContext.Provider value={value}>{children}</DraftAssistantContext.Provider>
}

export function useDraftAssistant() {
  const context = useContext(DraftAssistantContext)
  if (!context) {
    throw new Error('useDraftAssistant must be used within a DraftAssistantProvider')
  }
  return context
}
