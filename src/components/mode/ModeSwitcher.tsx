import { Database, Bot } from 'lucide-react'
import { useMode, ExplorerMode } from '../../context/ModeContext'

interface ModeOption {
  value: ExplorerMode
  icon: typeof Database
  label: string
  shortcut: string
}

const modes: ModeOption[] = [
  { value: 'index', icon: Database, label: 'Index Explorer', shortcut: '⌘1' },
  { value: 'assistant', icon: Bot, label: 'Assistant Explorer', shortcut: '⌘2' },
]

export function ModeSwitcher() {
  const { mode, setMode } = useMode()

  return (
    <div 
      className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] rounded-md p-0.5"
      role="tablist"
      aria-label="Explorer mode"
      data-testid="mode-switcher"
    >
      {modes.map(({ value, icon: Icon, label, shortcut }) => {
        const isActive = mode === value
        return (
          <button
            key={value}
            role="tab"
            aria-selected={isActive}
            onClick={() => setMode(value)}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-all
              ${isActive 
                ? 'bg-white dark:bg-white/[0.12] text-foreground shadow-sm' 
                : 'text-foreground/50 hover:text-foreground/70'
              }
            `}
            title={`${label} (${shortcut})`}
            data-testid={`mode-${value}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{value === 'index' ? 'Index' : 'Assistant'}</span>
          </button>
        )
      })}
    </div>
  )
}
