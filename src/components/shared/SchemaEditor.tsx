import { Plus, X, ChevronDown } from 'lucide-react'
import { MetadataValueType } from '../../types/metadata'

export interface SchemaField {
  key: string
  type: MetadataValueType
}

interface SchemaEditorProps {
  fields: SchemaField[]
  onChange: (fields: SchemaField[]) => void
  textField?: string | null
  onTextFieldChange?: (field: string | null) => void
  disabled?: boolean
}

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

export function SchemaEditor({
  fields,
  onChange,
  textField,
  onTextFieldChange,
  disabled = false,
}: SchemaEditorProps) {
  // Get string fields for the text field dropdown
  const stringFields = fields.filter(f => f.type === 'string' && f.key.trim())

  const handleAddField = () => {
    const newField: SchemaField = {
      key: '',
      type: 'string',
    }
    onChange([...fields, newField])
  }

  const handleRemoveField = (index: number) => {
    const removedField = fields[index]
    const newFields = fields.filter((_, i) => i !== index)
    onChange(newFields)
    // Clear text field if the removed field was selected
    if (textField === removedField.key && onTextFieldChange) {
      onTextFieldChange(null)
    }
  }

  const handleFieldKeyChange = (index: number, key: string) => {
    const oldKey = fields[index].key
    const newFields = fields.map((f, i) => (i === index ? { ...f, key } : f))
    onChange(newFields)
    // Update text field reference if needed
    if (textField === oldKey && onTextFieldChange) {
      onTextFieldChange(key)
    }
  }

  const handleFieldTypeChange = (index: number, type: MetadataValueType) => {
    const field = fields[index]
    const newFields = fields.map((f, i) => (i === index ? { ...f, type } : f))
    onChange(newFields)
    // Clear text field if this field was selected and is no longer a string
    if (textField === field.key && type !== 'string' && onTextFieldChange) {
      onTextFieldChange(null)
    }
  }

  return (
    <div className="space-y-2">
      {/* Schema Fields */}
      {fields.map((field, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            type="text"
            value={field.key}
            onChange={(e) => handleFieldKeyChange(index, e.target.value)}
            placeholder="field name"
            disabled={disabled}
            className={`flex-1 ${inputClassName} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={inputStyle}
          />
          <div className="relative">
            <select
              value={field.type}
              onChange={(e) => handleFieldTypeChange(index, e.target.value as MetadataValueType)}
              disabled={disabled}
              className={`h-6 pl-1.5 pr-5 appearance-none rounded-md border border-input bg-background text-[10px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={inputStyle}
            >
              <option value="string">str</option>
              <option value="number">num</option>
              <option value="boolean">bool</option>
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => handleRemoveField(index)}
            disabled={disabled}
            className={`p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* Add Field Button */}
      <button
        type="button"
        onClick={handleAddField}
        disabled={disabled}
        className={`flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Plus className="h-3 w-3" />
        Add field
      </button>

      {/* Text Field Selector */}
      {onTextFieldChange && (
        <div className="pt-2 border-t border-border mt-3">
          <label className="text-[10px] font-medium text-muted-foreground">
            Embedding Text Field
          </label>
          <div className="relative mt-1">
            <select
              value={textField || ''}
              onChange={(e) => onTextFieldChange(e.target.value || null)}
              disabled={disabled || stringFields.length === 0}
              className={`w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring ${
                disabled || stringFields.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${textField ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
              style={inputStyle}
            >
              <option value="">Select field...</option>
              {stringFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.key}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {stringFields.length === 0
              ? 'Add a string field to enable text embedding'
              : 'Field containing text for embedding generation'}
          </p>
        </div>
      )}
    </div>
  )
}
