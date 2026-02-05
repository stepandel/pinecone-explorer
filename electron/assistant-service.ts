import { Pinecone } from '@pinecone-database/pinecone'
import {
  AssistantModel,
  CreateAssistantParams,
  UpdateAssistantParams,
  AssistantFile,
  AssistantFileStatus,
  ListAssistantFilesFilter,
  UploadAssistantFileParams,
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
      metadata: model.metadata as Record<string, string> | undefined,
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
    })
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
}
