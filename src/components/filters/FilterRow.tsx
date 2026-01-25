import { FilterRow as FilterRowType } from '../../types/filters'
import { formStyles } from '../../styles/form-controls'

interface FilterRowProps {
  row: FilterRowType
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  onChange: (id: string, updates: Partial<FilterRowType>) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onSearch?: () => void
  nResults?: number
  onNResultsChange?: (n: number) => void
}

const inputClassName = formStyles.input
const selectClassName = formStyles.select
const buttonClassName = formStyles.iconButton
const inputStyle = formStyles.inputShadow

export function FilterRow({
  row,
  isFirst,
  isLast,
  canRemove,
  onChange,
  onAdd,
  onRemove,
  onSearch,
  nResults,
  onNResultsChange,
}: FilterRowProps) {
  const handleTypeChange = (value: string) => {
    if (value === 'search') {
      onChange(row.id, {
        type: 'search',
        searchValue: '',
        selectField: undefined,
        selectValue: undefined,
      })
    } else if (value === 'select:id') {
      onChange(row.id, {
        type: 'select',
        searchValue: undefined,
        selectField: 'id',
        selectValue: '',
      })
    }
  }

  // Get current select value: 'search' or 'select:id'
  const selectValue = row.type === 'search'
    ? 'search'
    : `select:${row.selectField || 'id'}`

  return (
    <div className="flex gap-2 items-center w-full">
      {/* Type selector */}
      <select
        value={selectValue}
        onChange={(e) => handleTypeChange(e.target.value)}
        className={`w-28 ${selectClassName}`}
        style={inputStyle}
      >
        <option value="search">Query</option>
        <option value="select:id">ID</option>
      </select>

      {/* Conditional inputs based on type */}
      {row.type === 'search' ? (
        <input
          type="text"
          value={row.searchValue || ''}
          onChange={(e) => onChange(row.id, { searchValue: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSearch) {
              e.preventDefault()
              onSearch()
            }
          }}
          placeholder="Search query..."
          className={`flex-1 ${inputClassName}`}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={row.selectValue || ''}
          onChange={(e) => onChange(row.id, { selectValue: e.target.value })}
          placeholder="Vector ID..."
          className={`flex-1 ${inputClassName}`}
          style={inputStyle}
        />
      )}

      {/* Limit selector - only show on first row */}
      {isFirst && nResults !== undefined && onNResultsChange && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Limit:</span>
          <select
            value={nResults.toString()}
            onChange={(e) => onNResultsChange(parseInt(e.target.value, 10))}
            className={selectClassName}
            style={inputStyle}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="300">300</option>
            <option value="500">500</option>
            <option value="0">No limit</option>
          </select>
        </div>
      )}

      {/* Add/Remove buttons */}
      <div className="flex gap-1">
        {isLast && (
          <button
            onClick={onAdd}
            className={buttonClassName}
            title="Add filter"
          >
            +
          </button>
        )}
        {canRemove && (
          <button
            onClick={() => onRemove(row.id)}
            className={`${buttonClassName} text-muted-foreground hover:text-destructive`}
            title="Remove filter"
          >
            -
          </button>
        )}
      </div>
    </div>
  )
}
