import { ChevronDown, X } from 'lucide-react'
import { type MetadataField, type MetadataValueType } from '../../utils/vectorJsonParser'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

interface MetadataFieldEditorProps {
  field: MetadataField
  onChange: (field: MetadataField) => void
  onRemove: () => void
  disabled?: boolean
  autoFocusKey?: boolean
}

const TYPE_OPTIONS: { value: MetadataValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'string[]', label: 'String[]' },
]

export function MetadataFieldEditor({
  field,
  onChange,
  onRemove,
  disabled = false,
  autoFocusKey = false,
}: MetadataFieldEditorProps) {
  const handleKeyChange = (key: string) => {
    onChange({ ...field, key })
  }

  const handleTypeChange = (type: MetadataValueType) => {
    // Reset value when type changes
    let defaultValue = ''
    if (type === 'boolean') defaultValue = 'false'
    if (type === 'string[]') defaultValue = '[]'
    if (type === 'number') defaultValue = '0'

    onChange({ ...field, type, value: defaultValue })
  }

  const handleValueChange = (value: string) => {
    onChange({ ...field, value })
  }

  const renderValueInput = () => {
    switch (field.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-1.5 h-6 px-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={field.value === 'true'}
              onChange={(e) => handleValueChange(e.target.checked ? 'true' : 'false')}
              disabled={disabled}
              className="h-3 w-3 rounded border-input"
            />
            <span className="text-[11px] text-muted-foreground">
              {field.value === 'true' ? 'true' : 'false'}
            </span>
          </label>
        )

      case 'number':
        return (
          <input
            type="number"
            value={field.value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="0"
            disabled={disabled}
            className={inputClassName}
            style={inputStyle}
          />
        )

      case 'string[]':
        return (
          <input
            type="text"
            value={field.value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder='["a", "b"] or a, b'
            disabled={disabled}
            className={inputClassName}
            style={inputStyle}
          />
        )

      default: // string
        return (
          <input
            type="text"
            value={field.value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Value"
            disabled={disabled}
            className={inputClassName}
            style={inputStyle}
          />
        )
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Field Name */}
      <input
        type="text"
        value={field.key}
        onChange={(e) => handleKeyChange(e.target.value)}
        placeholder="field_name"
        disabled={disabled}
        autoFocus={autoFocusKey}
        className={`${inputClassName} flex-[2] min-w-0`}
        style={inputStyle}
      />

      {/* Type Dropdown */}
      <div className="relative flex-1 min-w-[80px]">
        <select
          value={field.type}
          onChange={(e) => handleTypeChange(e.target.value as MetadataValueType)}
          disabled={disabled}
          className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={inputStyle}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
      </div>

      {/* Value Input */}
      <div className="flex-[3] min-w-0">
        {renderValueInput()}
      </div>

      {/* Remove Button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Remove field"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface MetadataFieldListProps {
  fields: MetadataField[]
  onChange: (fields: MetadataField[]) => void
  disabled?: boolean
}

export function MetadataFieldList({
  fields,
  onChange,
  disabled = false,
}: MetadataFieldListProps) {
  const handleFieldChange = (index: number, field: MetadataField) => {
    const newFields = [...fields]
    newFields[index] = field
    onChange(newFields)
  }

  const handleFieldRemove = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index)
    onChange(newFields)
  }

  const handleAddField = () => {
    onChange([...fields, { key: '', type: 'string', value: '' }])
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      {fields.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium px-0.5">
          <span className="flex-[2]">Field Name</span>
          <span className="flex-1 min-w-[80px]">Type</span>
          <span className="flex-[3]">Value</span>
          <span className="w-6" />
        </div>
      )}

      {/* Field Rows */}
      {fields.map((field, index) => (
        <MetadataFieldEditor
          key={index}
          field={field}
          onChange={(f) => handleFieldChange(index, f)}
          onRemove={() => handleFieldRemove(index)}
          disabled={disabled}
          autoFocusKey={index === fields.length - 1 && field.key === ''}
        />
      ))}

      {/* Add Field Button */}
      <button
        type="button"
        onClick={handleAddField}
        disabled={disabled}
        className="w-full h-7 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-input rounded-md hover:border-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span>+</span>
        <span>Add Field</span>
      </button>
    </div>
  )
}
