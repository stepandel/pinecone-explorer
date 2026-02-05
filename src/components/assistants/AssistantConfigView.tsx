import { ChevronDown } from 'lucide-react'
import { useDraftAssistant } from '../../context/DraftAssistantContext'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut'
import { SHORTCUTS } from '../../constants/keyboard-shortcuts'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

export function AssistantConfigView() {
  const {
    draftAssistant,
    isEditing,
    isSubmitting,
    validationErrors,
    updateDraft,
    cancelDraft,
    saveDraft,
  } = useDraftAssistant()

  const handleSave = () => {
    if (draftAssistant) saveDraft()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { shortcut: SHORTCUTS.SAVE, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.SAVE_ENTER, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.CANCEL, handler: cancelDraft },
  ])

  if (!draftAssistant) return null

  const isNameValid = !validationErrors.name
  const canSubmit = isEditing
    ? !isSubmitting && isNameValid
    : !isSubmitting && isNameValid && draftAssistant.name.trim().length > 0

  return (
    <div className="flex flex-col h-full bg-background" data-testid="assistant-config-view">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">
          {isEditing ? 'Edit Assistant' : 'Create Assistant'}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {isEditing
            ? 'Update assistant configuration'
            : 'Configure a new Pinecone Assistant'}
        </p>
      </div>

      {/* Configuration Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Form error */}
        {validationErrors._form && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-[11px] text-destructive">{validationErrors._form}</p>
          </div>
        )}

        {/* Assistant Name */}
        <div className="space-y-1">
          <label htmlFor="assistant-name" className="text-[11px] font-medium text-muted-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="assistant-name"
            type="text"
            value={draftAssistant.name}
            onChange={(e) => updateDraft({ name: e.target.value.toLowerCase() })}
            placeholder="my-assistant"
            className={inputClassName}
            style={inputStyle}
            autoFocus={!isEditing}
            disabled={isEditing}
            data-testid="assistant-name-input"
          />
          {validationErrors.name && (
            <p className="text-[10px] text-destructive">{validationErrors.name}</p>
          )}
          {!isEditing && (
            <p className="text-[10px] text-muted-foreground">
              1-63 characters, lowercase letters, numbers, and hyphens only
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="space-y-1">
          <label htmlFor="assistant-instructions" className="text-[11px] font-medium text-muted-foreground">
            Instructions
          </label>
          <textarea
            id="assistant-instructions"
            value={draftAssistant.instructions}
            onChange={(e) => updateDraft({ instructions: e.target.value })}
            placeholder="You are a helpful assistant that answers questions based on the provided documents..."
            className="w-full h-32 text-[11px] px-1.5 py-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            style={inputStyle}
            data-testid="assistant-instructions-input"
          />
          {validationErrors.instructions && (
            <p className="text-[10px] text-destructive">{validationErrors.instructions}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            System instructions that guide the assistant's behavior (max 16KB)
          </p>
        </div>

        {/* Metadata */}
        <div className="space-y-1">
          <label htmlFor="assistant-metadata" className="text-[11px] font-medium text-muted-foreground">
            Metadata
          </label>
          <textarea
            id="assistant-metadata"
            value={draftAssistant.metadata}
            onChange={(e) => updateDraft({ metadata: e.target.value })}
            placeholder={`{
  "team": "engineering",
  "project": "docs"
}`}
            className="w-full h-24 text-[11px] px-1.5 py-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none font-mono"
            style={inputStyle}
          />
          {validationErrors.metadata && (
            <p className="text-[10px] text-destructive">{validationErrors.metadata}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Optional JSON object with string key-value pairs
          </p>
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label htmlFor="assistant-region" className="text-[11px] font-medium text-muted-foreground">
            Region
          </label>
          <div className="relative">
            <select
              id="assistant-region"
              value={draftAssistant.region}
              onChange={(e) => updateDraft({ region: e.target.value as 'us' | 'eu' })}
              className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={inputStyle}
              disabled={isEditing}
            >
              <option value="us">US (United States)</option>
              <option value="eu">EU (Europe)</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          {isEditing && (
            <p className="text-[10px] text-muted-foreground">
              Region cannot be changed after creation
            </p>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-background">
        <div className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.SAVE_ENTER.keys}</kbd> {isEditing ? 'save' : 'create'}
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.CANCEL.keys}</kbd> cancel
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={cancelDraft}
            disabled={isSubmitting}
            className="h-6 px-2 text-[11px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            style={inputStyle}
            data-testid="assistant-cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="assistant-save-button"
          >
            {isSubmitting
              ? (isEditing ? 'Saving...' : 'Creating...')
              : (isEditing ? 'Save Changes' : 'Create Assistant')}
          </button>
        </div>
      </div>
    </div>
  )
}
