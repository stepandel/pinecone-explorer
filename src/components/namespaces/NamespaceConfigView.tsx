import { useDraftNamespace } from '../../context/DraftNamespaceContext'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut'
import { SHORTCUTS } from '../../constants/keyboard-shortcuts'
import { SchemaEditor } from '../shared/SchemaEditor'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

export function NamespaceConfigView() {
  const { draftNamespace, updateDraft, cancelCreation, saveDraft, isSaving, validationErrors } = useDraftNamespace()

  const handleSave = () => {
    if (draftNamespace) saveDraft()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { shortcut: SHORTCUTS.SAVE, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.SAVE_ENTER, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.CANCEL, handler: cancelCreation },
  ])

  if (!draftNamespace) return null

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Configuration Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Form error */}
        {validationErrors._form && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-[11px] text-destructive">{validationErrors._form}</p>
          </div>
        )}

        {/* Target Index (read-only) */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Index
          </label>
          <div className="h-6 px-1.5 rounded-md border border-input bg-muted text-[11px] flex items-center text-muted-foreground">
            {draftNamespace.indexName}
          </div>
        </div>

        {/* Namespace Name */}
        <div className="space-y-1">
          <label htmlFor="namespace-name" className="text-[11px] font-medium text-muted-foreground">
            Namespace Name
          </label>
          <input
            id="namespace-name"
            type="text"
            value={draftNamespace.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder="my-namespace (leave empty for default)"
            className={inputClassName}
            style={inputStyle}
            autoFocus
          />
          {validationErrors.name && <p className="text-[10px] text-destructive">{validationErrors.name}</p>}
          <p className="text-[10px] text-muted-foreground">
            Leave empty to use the default namespace
          </p>
        </div>

        {/* Schema Definition */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Vector Schema <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <p className="text-[10px] text-muted-foreground mb-2">
            Define metadata fields for vectors in this namespace. Leave empty to add fields manually later.
          </p>
          <SchemaEditor
            fields={draftNamespace.schema}
            onChange={(schema) => updateDraft({ schema })}
            textField={draftNamespace.textField}
            onTextFieldChange={(textField) => updateDraft({ textField })}
            disabled={isSaving}
          />
          {validationErrors.schema && <p className="text-[10px] text-destructive">{validationErrors.schema}</p>}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-background">
        <div className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.SAVE_ENTER.keys}</kbd> create
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.CANCEL.keys}</kbd> cancel
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={cancelCreation}
            disabled={isSaving}
            className="h-6 px-2 text-[11px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            style={inputStyle}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Creating...' : 'Create Namespace'}
          </button>
        </div>
      </div>
    </div>
  )
}
