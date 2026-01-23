// Filter row types
export type FilterRowType = 'search' | 'select'

export interface FilterRow {
  id: string
  type: FilterRowType
  // For search type
  searchValue?: string
  // For select type (ID filtering)
  selectField?: 'id'
  selectValue?: string
}
