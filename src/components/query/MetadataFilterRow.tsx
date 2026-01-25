import { MetadataFilter, MetadataOperator, getOperatorLabel, getOperatorsForType } from '../../types/filters'

interface MetadataFilterRowProps {
  filter: MetadataFilter
  availableFields: string[]
  fieldTypes: Record<string, 'string' | 'number' | 'boolean'>
  onChange: (id: string, updates: Partial<MetadataFilter>) => void
  onRemove: (id: string) => void
  onAdd?: () => void
  isLast?: boolean
}

const inputClassName = "h-6 text-[11px] py-0 px-1.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
const selectClassName = "h-6 text-[11px] px-1.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-ring/50"
const buttonClassName = "h-6 w-6 p-0 text-[11px] rounded-md bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
const inputStyle = { boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.03)' }

export function MetadataFilterRow({
  filter,
  availableFields,
  fieldTypes,
  onChange,
  onRemove,
  onAdd,
  isLast = false,
}: MetadataFilterRowProps) {
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
    <div className="flex gap-2 items-center">
      {/* Field selector */}
      {availableFields.length > 0 ? (
        <select
          value={filter.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className={`w-28 ${selectClassName}`}
          style={inputStyle}
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
          placeholder="field name"
          className={`w-28 ${inputClassName}`}
          style={inputStyle}
        />
      )}

      {/* Operator selector */}
      <select
        value={filter.operator}
        onChange={(e) => onChange(filter.id, { operator: e.target.value as MetadataOperator })}
        className={`w-16 ${selectClassName}`}
        style={inputStyle}
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
        placeholder={getPlaceholder()}
        className={`flex-1 min-w-[100px] ${inputClassName}`}
        style={inputStyle}
      />

      {/* Remove button */}
      <button
        onClick={() => onRemove(filter.id)}
        className={`${buttonClassName} text-muted-foreground hover:text-destructive`}
        title="Remove filter"
      >
        -
      </button>

      {/* Add button - only on last row */}
      {isLast && onAdd && (
        <button
          onClick={onAdd}
          className={`${buttonClassName} text-muted-foreground`}
          title="Add filter"
        >
          +
        </button>
      )}
    </div>
  )
}
