import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import { Send, Trash2, StopCircle, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStream, DEFAULT_MODELS } from '@/hooks/useChatStream'
import { useAssistantSelection } from '@/context/AssistantSelectionContext'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { SHORTCUTS } from '@/constants/keyboard-shortcuts'
import { ChatMessage } from './ChatMessage'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ChatViewProps {
  assistantName: string
}

function EmptyState({ assistantName }: { assistantName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Bot className="w-6 h-6 text-secondary-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Chat with {assistantName}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Start a conversation by typing a message below. The assistant will use
        its knowledge base to help answer your questions.
      </p>
    </div>
  )
}

export function ChatView({ assistantName }: ChatViewProps) {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { activeAssistant } = useAssistantSelection()

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    cancelStream,
    setModel,
    currentModel,
  } = useChatStream({
    assistantName,
  })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [inputValue])

  // Focus textarea on mount and when assistant changes
  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeAssistant])

  // Focus chat input handler
  const focusChatInput = useCallback(() => {
    textareaRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  useKeyboardShortcut(SHORTCUTS.FOCUS_CHAT_INPUT, focusChatInput, {
    skipInputs: false, // Allow focusing even when already in input
  })

  useKeyboardShortcut(SHORTCUTS.CLEAR_CONVERSATION, () => {
    if (messages.length > 0 && !isStreaming) {
      clearMessages()
    }
  }, {
    skipInputs: false,
  })

  // Listen for menu IPC events
  useEffect(() => {
    const unsubFocus = window.electronAPI.menu.onFocusChatInput(() => {
      textareaRef.current?.focus()
    })
    const unsubClear = window.electronAPI.menu.onClearConversation(() => {
      if (messages.length > 0 && !isStreaming) {
        clearMessages()
      }
    })

    return () => {
      unsubFocus()
      unsubClear()
    }
  }, [messages.length, isStreaming, clearMessages])

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    sendMessage(inputValue)
    setInputValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputValue, isStreaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Don't submit during IME composition (CJK input)
      if (e.nativeEvent.isComposing) return
      // Submit on Enter (without Shift) or Cmd/Ctrl+Enter
      if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Listen for menu send message event
  useEffect(() => {
    const unsubSend = window.electronAPI.menu.onSendMessage(() => {
      handleSubmit()
    })
    return () => unsubSend()
  }, [handleSubmit])

  const handleStopGeneration = useCallback(() => {
    cancelStream()
  }, [cancelStream])

  return (
    <div className="flex flex-col h-full" data-testid="chat-view">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-white/60 dark:bg-white/[0.06]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {assistantName}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <Select value={currentModel} onValueChange={setModel}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_MODELS.map((model) => (
                  <SelectItem key={model} value={model} className="text-xs">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear button */}
            <button
              onClick={clearMessages}
              disabled={messages.length === 0 || isStreaming}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-md transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-secondary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          background: 'var(--canvas-background)',
        }}
      >
        {messages.length === 0 ? (
          <EmptyState assistantName={assistantName} />
        ) : (
          <div className="py-4">
            {messages.map((message, idx) => (
              <ChatMessage 
                key={idx} 
                role={message.role}
                content={message.content}
                citations={message.citations}
                isStreaming={message.isStreaming}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-white/60 dark:bg-white/[0.06]">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={isStreaming}
              className={cn(
                'w-full resize-none rounded-lg border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'min-h-[40px] max-h-[200px]'
              )}
              rows={1}
            />
          </div>
          
          {isStreaming ? (
            <button
              onClick={handleStopGeneration}
              className={cn(
                'h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg',
                'bg-destructive text-white hover:bg-destructive/90',
                'transition-colors'
              )}
              title="Stop generation"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className={cn(
                'h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

export default ChatView
