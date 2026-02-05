import { useState, useCallback, useRef, useEffect } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import type { ChatMessage, Citation, ChatUsage, ChatStreamChunk } from '../../electron/types'

export interface ChatMessageWithMeta extends ChatMessage {
  id?: string
  isStreaming?: boolean
  citations?: Citation[]
  usage?: ChatUsage
  model?: string
}

interface UseChatStreamOptions {
  assistantName: string
  model?: string
}

interface UseChatStreamReturn {
  messages: ChatMessageWithMeta[]
  isStreaming: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
  cancelStream: () => void
  setModel: (model: string) => void
  currentModel: string
}

const DEFAULT_MODELS = [
  'gpt-4o',
  'gpt-4.1',
  'gpt-5',
  'o4-mini',
  'claude-sonnet-4-5',
  'gemini-2.5-pro',
]

export function useChatStream({
  assistantName,
  model: initialModel,
}: UseChatStreamOptions): UseChatStreamReturn {
  const { currentProfile } = usePinecone()
  const [messages, setMessages] = useState<ChatMessageWithMeta[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentModel, setCurrentModel] = useState(initialModel || DEFAULT_MODELS[0])
  
  const currentStreamIdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
      if (currentStreamIdRef.current) {
        window.electronAPI.assistant.chatStream.cancel(currentStreamIdRef.current).catch(console.error)
      }
    }
  }, [])

  // Reset state when assistant changes
  useEffect(() => {
    if (currentStreamIdRef.current) {
      window.electronAPI.assistant.chatStream.cancel(currentStreamIdRef.current).catch(console.error)
      currentStreamIdRef.current = null
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setMessages([])
    setIsStreaming(false)
    setError(null)
  }, [assistantName])

  const sendMessage = useCallback(async (content: string) => {
    if (!currentProfile?.id || !assistantName || !content.trim()) return
    if (isStreaming) return

    setError(null)
    setIsStreaming(true)

    // Add user message
    const userMessage: ChatMessageWithMeta = {
      role: 'user',
      content: content.trim(),
    }
    setMessages(prev => [...prev, userMessage])

    // Prepare messages for API (convert to ChatMessage format)
    const apiMessages: ChatMessage[] = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: content.trim() },
    ]

    // Add placeholder assistant message
    const assistantPlaceholder: ChatMessageWithMeta = {
      role: 'assistant',
      content: '',
      isStreaming: true,
    }
    setMessages(prev => [...prev, assistantPlaceholder])

    try {
      // Subscribe to chunk events
      unsubscribeRef.current = window.electronAPI.assistant.chatStream.onChunk(
        (streamId: string, chunk: ChatStreamChunk) => {
          // Initialize stream id from first chunk if not yet set (handles race condition)
          if (!currentStreamIdRef.current) {
            currentStreamIdRef.current = streamId
          }
          if (streamId !== currentStreamIdRef.current) return

          switch (chunk.type) {
            case 'message_start':
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    id: chunk.id,
                    model: chunk.model,
                  }
                }
                return updated
              })
              break

            case 'content':
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: updated[lastIdx].content + (chunk.content || ''),
                  }
                }
                return updated
              })
              break

            case 'citation':
              if (chunk.citation) {
                setMessages(prev => {
                  const updated = [...prev]
                  const lastIdx = updated.length - 1
                  if (updated[lastIdx]?.role === 'assistant') {
                    const currentCitations = updated[lastIdx].citations || []
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      citations: [...currentCitations, chunk.citation!],
                    }
                  }
                  return updated
                })
              }
              break

            case 'message_end':
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (updated[lastIdx]?.role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    isStreaming: false,
                    usage: chunk.usage,
                  }
                }
                return updated
              })
              setIsStreaming(false)
              currentStreamIdRef.current = null
              if (unsubscribeRef.current) {
                unsubscribeRef.current()
                unsubscribeRef.current = null
              }
              break

            case 'error':
              setError(chunk.error || 'An error occurred')
              setMessages(prev => {
                const updated = [...prev]
                const lastIdx = updated.length - 1
                if (updated[lastIdx]?.role === 'assistant' && updated[lastIdx].isStreaming) {
                  // Remove the placeholder if no content was received
                  if (!updated[lastIdx].content) {
                    updated.pop()
                  } else {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      isStreaming: false,
                    }
                  }
                }
                return updated
              })
              setIsStreaming(false)
              currentStreamIdRef.current = null
              if (unsubscribeRef.current) {
                unsubscribeRef.current()
                unsubscribeRef.current = null
              }
              break
          }
        }
      )

      // Start the stream
      const streamId = await window.electronAPI.assistant.chatStream.start(
        currentProfile.id,
        assistantName,
        {
          messages: apiMessages,
          model: currentModel,
        }
      )
      currentStreamIdRef.current = streamId
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
      // Remove the placeholder assistant message on error
      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (updated[lastIdx]?.role === 'assistant' && updated[lastIdx].isStreaming) {
          updated.pop()
        }
        return updated
      })
      setIsStreaming(false)
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [currentProfile?.id, assistantName, messages, currentModel, isStreaming])

  const clearMessages = useCallback(() => {
    // Cancel any active stream first
    if (currentStreamIdRef.current) {
      window.electronAPI.assistant.chatStream.cancel(currentStreamIdRef.current).catch(console.error)
      currentStreamIdRef.current = null
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setMessages([])
    setIsStreaming(false)
    setError(null)
  }, [])

  const cancelStream = useCallback(() => {
    if (currentStreamIdRef.current) {
      window.electronAPI.assistant.chatStream.cancel(currentStreamIdRef.current).catch(console.error)
      currentStreamIdRef.current = null
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
    setIsStreaming(false)
    // Mark the last message as no longer streaming, or remove if empty
    setMessages(prev => {
      const updated = [...prev]
      const lastIdx = updated.length - 1
      if (updated[lastIdx]?.role === 'assistant' && updated[lastIdx].isStreaming) {
        // Remove empty placeholder if no content was received
        if (!updated[lastIdx].content) {
          updated.pop()
        } else {
          updated[lastIdx] = {
            ...updated[lastIdx],
            isStreaming: false,
          }
        }
      }
      return updated
    })
  }, [])

  const setModel = useCallback((model: string) => {
    setCurrentModel(model)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    cancelStream,
    setModel,
    currentModel,
  }
}

export { DEFAULT_MODELS }
