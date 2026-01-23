import { useState } from 'react'
import { RefreshCw, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { useDraftNamespace } from '../../context/DraftNamespaceContext'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut'
import { SHORTCUTS } from '../../constants/keyboard-shortcuts'
import { MetadataFieldList } from '../shared/MetadataFieldEditor'

const inputClassName =
  'w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

export function NamespaceConfigView() {
  const {
    draftNamespace,
    updateDraft,
    updateVector,
    addVector,
    removeVector,
    cancelCreation,
    saveDraft,
    parseJson,
    isSaving,
    validationErrors,
  } = useDraftNamespace()

  const [expandedVectors, setExpandedVectors] = useState<Set<number>>(new Set([0]))

  const handleSave = () => {
    if (draftNamespace) saveDraft()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { shortcut: SHORTCUTS.SAVE, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.SAVE_ENTER, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.CANCEL, handler: cancelCreation },
  ])

  const toggleVectorExpanded = (index: number) => {
    setExpandedVectors((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const generateNewId = (index: number) => {
    updateVector(index, { id: crypto.randomUUID() })
  }

  if (!draftNamespace) return null

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium">Create Namespace</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          in {draftNamespace.indexName}
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
          {validationErrors.name && (
            <p className="text-[10px] text-destructive">{validationErrors.name}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Leave empty to use the default namespace
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-medium text-muted-foreground">
              Initial Vectors
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateDraft({ jsonMode: !draftNamespace.jsonMode })}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {draftNamespace.jsonMode ? 'Use Form' : 'Paste JSON'}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">
            {draftNamespace.jsonMode
              ? 'Paste JSON to create one or more vectors'
              : 'Define the first vector(s) to create the namespace'}
          </p>
        </div>

        {/* JSON Mode */}
        {draftNamespace.jsonMode ? (
          <div className="space-y-2">
            <textarea
              value={draftNamespace.jsonValue}
              onChange={(e) => updateDraft({ jsonValue: e.target.value })}
              placeholder={`{
  "id": "vec-001",
  "metadata": {
    "title": "My Document",
    "category": "articles",
    "views": 1250,
    "published": true,
    "tags": ["tech", "news"]
  }
}

Or an array of vectors:
[
  { "id": "vec-001", "metadata": { ... } },
  { "id": "vec-002", "metadata": { ... } }
]`}
              className="w-full h-48 text-[11px] px-2 py-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono resize-none"
              style={inputStyle}
            />
            {validationErrors.json && (
              <p className="text-[10px] text-destructive">{validationErrors.json}</p>
            )}
            {validationErrors.jsonPosition && (
              <p className="text-[10px] text-muted-foreground">{validationErrors.jsonPosition}</p>
            )}
            <button
              type="button"
              onClick={parseJson}
              disabled={!draftNamespace.jsonValue.trim()}
              className="h-6 px-3 text-[11px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              style={inputStyle}
            >
              Parse JSON
            </button>
          </div>
        ) : (
          /* Form Mode - Vector List */
          <div className="space-y-3">
            {draftNamespace.vectors.map((vector, vIndex) => {
              const isExpanded = expandedVectors.has(vIndex)
              return (
                <div
                  key={vIndex}
                  className="border border-border rounded-md overflow-hidden"
                >
                  {/* Vector Header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleVectorExpanded(vIndex)}
                  >
                    <button
                      type="button"
                      className="p-0.5 hover:bg-muted rounded"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleVectorExpanded(vIndex)
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    <span className="text-[11px] font-medium flex-1 truncate">
                      {vector.id || `Vector ${vIndex + 1}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {vector.metadataFields.length} field{vector.metadataFields.length !== 1 ? 's' : ''}
                    </span>
                    {draftNamespace.vectors.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeVector(vIndex)
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        title="Remove vector"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Vector Content */}
                  {isExpanded && (
                    <div className="p-3 space-y-3">
                      {/* Vector ID */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Vector ID
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={vector.id}
                            onChange={(e) => updateVector(vIndex, { id: e.target.value })}
                            placeholder="vec-001"
                            className={`${inputClassName} flex-1`}
                            style={inputStyle}
                          />
                          <button
                            type="button"
                            onClick={() => generateNewId(vIndex)}
                            className="h-6 w-6 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
                            style={inputStyle}
                            title="Generate UUID"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        </div>
                        {validationErrors[`vector_${vIndex}_id`] && (
                          <p className="text-[10px] text-destructive">
                            {validationErrors[`vector_${vIndex}_id`]}
                          </p>
                        )}
                      </div>

                      {/* Metadata Fields */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Metadata
                        </label>
                        <MetadataFieldList
                          fields={vector.metadataFields}
                          onChange={(fields) => updateVector(vIndex, { metadataFields: fields })}
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add Vector Button */}
            <button
              type="button"
              onClick={addVector}
              disabled={isSaving}
              className="w-full h-8 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-input rounded-md hover:border-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>Add Another Vector</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-background">
        <div className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">
            {SHORTCUTS.SAVE_ENTER.keys}
          </kbd>{' '}
          create
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">
            {SHORTCUTS.CANCEL.keys}
          </kbd>{' '}
          cancel
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
            disabled={isSaving || draftNamespace.vectors.length === 0}
            className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving
              ? 'Creating...'
              : `Create${draftNamespace.vectors.length > 1 ? ` (${draftNamespace.vectors.length} vectors)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
