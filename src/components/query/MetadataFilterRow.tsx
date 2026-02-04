import { MetadataFilter, MetadataOperator, getOperatorLabel, getOperatorsForType } from '../../types/filters'
import { formStyles } from '../../styles/form-controls'

interface MetadataFilterRowProps {
  filter: MetadataFilter
  availableFields: string[]
  fieldTypes: Record<string, 'string' | 'number' | 'boolean'>
  onChange: (id: string, updates: Partial<MetadataFilter>) => void
  onRemove: (id: string) => void
  onAdd?: () => void
  onSearch?: () => void
  isLast?: boolean
}

const inputClassName = formStyles.input
const selectClassName = formStyles.select
const buttonClassName = formStyles.iconButton
const inputStyle = formStyles.inputShadow

export function MetadataFilterRow({
  filter,
  availableFields,
  fieldTypes,
  onChange,
  onRemove,
  onAdd,
  onSearch,
  isLast = false,
}: MetadataFilterRowProps) {
  // Handle Enter key to trigger search
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onSearch) {
      e.preventDefault()
      onSearch()
    }
  }
  // Get the type of the currently selected field
  const fieldType = fieldTypes[filter.field] || 'string'

  // Get available operators for this field type
  const availableOperators = getOperatorsForType(fieldType)

  // Handle field change - reset operator if it's not available for new field type
  const handleFieldChange = (newField: string) => {
    const newFieldType = fieldTypes[newField] || 'string'
    const newOperators = getOperatorsForType(newFieldType)

    const updates: Partial<MetadataFilter> = { field: newField }

    // Reset operator if current one isn't valid for new field type
    if (!newOperators.includes(filter.operator)) {
      updates.operator = '$eq'
    }

    onChange(filter.id, updates)
  }

  // Get placeholder text based on operator
  const getPlaceholder = (): string => {
    if (filter.operator === '$exists') return 'true or false'
    if (filter.operator === '$in' || filter.operator === '$nin') return 'value1, value2, ...'
    if (fieldType === 'number') return 'number'
    if (fieldType === 'boolean') return 'true or false'
    return 'value'
  }

  return (
    <div className="flex gap-2 items-center" data-testid="metadata-filter-row">
      {/* Field selector */}
      {availableFields.length > 0 ? (
        <select
          value={filter.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className={`w-28 ${selectClassName}`}
          style={inputStyle}
          data-testid="filter-field-select"
        >
          <option value="">Select field...</option>
          {availableFields.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={filter.field}
          onChange={(e) => onChange(filter.id, { field: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="field name"
          className={`w-28 ${inputClassName}`}
          style={inputStyle}
          data-testid="filter-field-input"
        />
      )}

      {/* Operator selector */}
      <select
        value={filter.operator}
        onChange={(e) => onChange(filter.id, { operator: e.target.value as MetadataOperator })}
        className={`w-16 ${selectClassName}`}
        style={inputStyle}
        data-testid="filter-operator-select"
      >
        {availableOperators.map((op) => (
          <option key={op} value={op}>
            {getOperatorLabel(op)}
          </option>
        ))}
      </select>

      {/* Value input */}
      <input
        type="text"
        value={filter.value}
        onChange={(e) => onChange(filter.id, { value: e.target.value })}
        onKeyDown={handleKeyDown}
        placeholder={getPlaceholder()}
        className={`flex-1 min-w-[100px] ${inputClassName}`}
        style={inputStyle}
        data-testid="filter-value-input"
      />

      {/* Remove button */}
      <button
        onClick={() => onRemove(filter.id)}
        className={`${buttonClassName} text-muted-foreground hover:text-destructive`}
        title="Remove filter"
        data-testid="remove-filter-button"
      >
        -
      </button>

      {/* Add button - only on last row */}
      {isLast && onAdd && (
        <button
          onClick={onAdd}
          className={`${buttonClassName} text-muted-foreground`}
          title="Add filter"
          data-testid="add-filter-button"
        >
          +
        </button>
      )}
    </div>
  )
}
