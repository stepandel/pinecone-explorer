import { Pinecone } from '@pinecone-database/pinecone'
import { AssistantModel, CreateAssistantParams, UpdateAssistantParams } from './types'

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
}
