import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { useSelection } from '../../context/SelectionContext'
import { SHORTCUTS, matchesShortcut } from '../../constants/keyboard-shortcuts'

const inputClassName = "w-full h-7 text-[11px] px-2 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

interface NewNamespaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  indexName: string
}

export function NewNamespaceDialog({ open, onOpenChange, indexName }: NewNamespaceDialogProps) {
  const [namespaceName, setNamespaceName] = useState('')
  const { selectIndexAndNamespace } = useSelection()

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setNamespaceName('')
    }
  }, [open])

  const handleCreate = useCallback(() => {
    // Navigate to the namespace (it will be created when first vector is added)
    selectIndexAndNamespace(indexName, namespaceName.trim())
    onOpenChange(false)
  }, [indexName, namespaceName, selectIndexAndNamespace, onOpenChange])

  // Keyboard handler
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesShortcut(e, SHORTCUTS.SAVE_ENTER)) {
        e.preventDefault()
        handleCreate()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleCreate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">New Namespace</DialogTitle>
          <DialogDescription className="text-[11px]">
            Create a new namespace in <span className="font-medium text-foreground">{indexName}</span>.
            The namespace will be created when you add the first vector.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-1.5">
            <label htmlFor="namespace-name" className="text-[11px] font-medium text-muted-foreground">
              Namespace Name
            </label>
            <input
              id="namespace-name"
              type="text"
              value={namespaceName}
              onChange={(e) => setNamespaceName(e.target.value)}
              placeholder="my-namespace (leave empty for default)"
              className={inputClassName}
              style={inputStyle}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Leave empty to use the default namespace
            </p>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.SAVE_ENTER.keys}</kbd> create
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="h-7 px-3 text-[11px] rounded-md border border-input bg-background hover:bg-accent"
                style={inputStyle}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="h-7 px-3 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white"
              >
                Create
              </button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
