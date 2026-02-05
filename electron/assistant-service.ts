import { Pinecone } from '@pinecone-database/pinecone'
import {
  AssistantModel,
  CreateAssistantParams,
  UpdateAssistantParams,
  AssistantFile,
  AssistantFileStatus,
  ListAssistantFilesFilter,
  UploadAssistantFileParams,
  ChatParams,
  ChatResponse,
  ChatStreamChunk,
  ChatMessage,
  Citation,
} from './types'

/**
 * Service layer for Pinecone Assistant API operations.
 * Wraps the Pinecone SDK's Assistant methods and provides a clean interface
 * for CRUD operations on assistants.
 */
export class AssistantService {
  private client: Pinecone

  constructor(client: Pinecone) {
    this.client = client
  }

  /**
   * List all assistants for the current Pinecone API key
   */
  async listAssistants(): Promise<AssistantModel[]> {
    const response = await this.client.listAssistants()
    return (response.assistants || []).map(this.mapAssistantModel)
  }

  /**
   * Create a new assistant
   */
  async createAssistant(params: CreateAssistantParams): Promise<AssistantModel> {
    const response = await this.client.createAssistant({
      name: params.name,
      instructions: params.instructions,
      metadata: params.metadata,
      region: params.region,
    })
    return this.mapAssistantModel(response)
  }

  /**
   * Get details of a specific assistant by name
   */
  async describeAssistant(name: string): Promise<AssistantModel> {
    const response = await this.client.describeAssistant(name)
    return this.mapAssistantModel(response)
  }

  /**
   * Update an existing assistant
   */
  async updateAssistant(name: string, params: UpdateAssistantParams): Promise<AssistantModel> {
    const response = await this.client.updateAssistant(name, {
      instructions: params.instructions,
      metadata: params.metadata,
    })
    // updateAssistant returns a different response type, reconstruct AssistantModel
    // by fetching the updated assistant
    return this.describeAssistant(name)
  }

  /**
   * Delete an assistant by name
   */
  async deleteAssistant(name: string): Promise<void> {
    await this.client.deleteAssistant(name)
  }

  /**
   * Map SDK AssistantModel to our internal type
   */
  private mapAssistantModel(model: {
    name: string
    status: string
    instructions?: string | null
    metadata?: object | null
    host?: string
    createdAt?: Date
    updatedAt?: Date
  }): AssistantModel {
    return {
      name: model.name,
      status: model.status as AssistantModel['status'],
      instructions: model.instructions ?? undefined,
      metadata: (model.metadata ?? undefined) as Record<string, string> | undefined,
      host: model.host,
      createdAt: model.createdAt?.toISOString(),
      updatedAt: model.updatedAt?.toISOString(),
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * List files for an assistant with optional filter
   */
  async listFiles(assistantName: string, filter?: ListAssistantFilesFilter): Promise<AssistantFile[]> {
    const assistant = this.client.assistant(assistantName)
    const response = await assistant.listFiles(filter ? { filter } : undefined)
    return (response.files || []).map(this.mapFileModel)
  }

  /**
   * Get details of a specific file by ID
   */
  async describeFile(assistantName: string, fileId: string): Promise<AssistantFile> {
    const assistant = this.client.assistant(assistantName)
    const response = await assistant.describeFile(fileId, true) // include signed URL
    return this.mapFileModel(response)
  }

  /**
   * Upload a file to an assistant from a local path
   */
  async uploadFile(assistantName: string, params: UploadAssistantFileParams): Promise<AssistantFile> {
    const assistant = this.client.assistant(assistantName)
    const response = await assistant.uploadFile({
      path: params.filePath,
      metadata: params.metadata,
      multimodal: params.multimodal,
    } as Parameters<typeof assistant.uploadFile>[0])
    return this.mapFileModel(response)
  }

  /**
   * Delete a file from an assistant
   */
  async deleteFile(assistantName: string, fileId: string): Promise<void> {
    const assistant = this.client.assistant(assistantName)
    await assistant.deleteFile(fileId)
  }

  /**
   * Map SDK AssistantFileModel to our internal type
   */
  private mapFileModel(file: {
    id: string
    name: string
    status?: string
    percentDone?: number | null
    metadata?: object | null
    signedUrl?: string | null
    errorMessage?: string | null
    createdOn?: Date
    updatedOn?: Date
  }): AssistantFile {
    return {
      id: file.id,
      name: file.name,
      status: (file.status || 'Processing') as AssistantFileStatus,
      percentDone: file.percentDone,
      metadata: file.metadata as Record<string, string | number> | null | undefined,
      signedUrl: file.signedUrl,
      errorMessage: file.errorMessage,
      createdOn: file.createdOn?.toISOString(),
      updatedOn: file.updatedOn?.toISOString(),
    }
  }

  // ============================================================================
  // Chat Operations
  // ============================================================================

  /**
   * Send a chat message to an assistant (non-streaming)
   */
  async chat(assistantName: string, params: ChatParams): Promise<ChatResponse> {
    const assistant = this.client.assistant(assistantName)
    const response = await assistant.chat({
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      model: params.model,
      filter: params.filter,
      jsonResponse: params.jsonResponse,
      includeHighlights: params.includeHighlights,
      temperature: params.temperature,
      contextOptions: params.contextOptions,
    } as Parameters<typeof assistant.chat>[0])

    return {
      id: response.id || crypto.randomUUID(),
      message: {
        role: 'assistant' as const,
        content: response.message?.content || '',
      },
      citations: this.mapCitations(response.citations),
      usage: response.usage ? {
        promptTokens: response.usage.promptTokens || 0,
        completionTokens: response.usage.completionTokens || 0,
        totalTokens: response.usage.totalTokens || 0,
      } : undefined,
      model: response.model,
      finishReason: response.finishReason,
    }
  }

  /**
   * Send a chat message to an assistant with streaming response
   * @param onChunk Callback for each chunk received
   * @param signal AbortSignal for cancellation
   */
  async chatStream(
    assistantName: string,
    params: ChatParams,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const assistant = this.client.assistant(assistantName)

    try {
      const stream = await assistant.chatStream({
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
        model: params.model,
        filter: params.filter,
      })

      // Process the stream
      for await (const chunk of stream) {
        if (signal?.aborted) {
          break
        }

        // Map chunk type based on content
        if (chunk.type === 'message_start') {
          onChunk({
            type: 'message_start',
            id: chunk.id,
            model: chunk.model,
            role: 'assistant',
          })
        } else if (chunk.type === 'content_chunk') {
          onChunk({
            type: 'content',
            content: chunk.delta?.content || '',
          })
        } else if (chunk.type === 'citation') {
          onChunk({
            type: 'citation',
            citation: this.mapSingleCitation(chunk.citation),
          })
        } else if (chunk.type === 'message_end') {
          onChunk({
            type: 'message_end',
            usage: chunk.usage ? {
              promptTokens: chunk.usage.promptTokens || 0,
              completionTokens: chunk.usage.completionTokens || 0,
              totalTokens: chunk.usage.totalTokens || 0,
            } : undefined,
            finishReason: chunk.finishReason,
          })
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        return // Don't send error for intentional abort
      }
      onChunk({
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream error',
      })
    }
  }

  /**
   * Map SDK citations to our Citation type
   */
  private mapCitations(citations?: unknown[]): Citation[] | undefined {
    if (!citations || !Array.isArray(citations)) return undefined
    return citations.map(c => this.mapSingleCitation(c)).filter((c): c is Citation => c !== undefined)
  }

  /**
   * Map a single citation
   */
  private mapSingleCitation(citation: unknown): Citation | undefined {
    if (!citation || typeof citation !== 'object') return undefined
    const c = citation as Record<string, unknown>
    return {
      position: (c.position as number) || 0,
      references: Array.isArray(c.references) ? c.references.map((ref: unknown) => {
        const r = ref as Record<string, unknown>
        const file = r.file as Record<string, unknown> | undefined
        return {
          file: {
            name: (file?.name as string) || '',
            id: (file?.id as string) || '',
          },
          pages: r.pages as number[] | undefined,
        }
      }) : [],
    }
  }
}
