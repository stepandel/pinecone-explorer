import { describe, it, expect, vi } from 'vitest'
import { AssistantService } from './assistant-service'

// Create a minimal mock Pinecone client
function createMockPinecone(overrides: Record<string, unknown> = {}) {
  return {
    listAssistants: vi.fn(),
    createAssistant: vi.fn(),
    describeAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    assistant: vi.fn(),
    ...overrides,
  } as any
}

describe('AssistantService', () => {
  describe('listAssistants', () => {
    it('maps SDK response to AssistantModel[]', async () => {
      const mockClient = createMockPinecone({
        listAssistants: vi.fn().mockResolvedValue({
          assistants: [
            {
              name: 'test-assistant',
              status: 'Ready',
              instructions: 'Be helpful',
              metadata: { team: 'engineering' },
              host: 'https://api.pinecone.io',
              createdAt: new Date('2024-01-15T00:00:00Z'),
              updatedAt: new Date('2024-01-16T00:00:00Z'),
            },
          ],
        }),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listAssistants()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'test-assistant',
        status: 'Ready',
        instructions: 'Be helpful',
        metadata: { team: 'engineering' },
        host: 'https://api.pinecone.io',
        createdAt: '2024-01-15T00:00:00.000Z',
        updatedAt: '2024-01-16T00:00:00.000Z',
      })
    })

    it('handles empty assistant list', async () => {
      const mockClient = createMockPinecone({
        listAssistants: vi.fn().mockResolvedValue({ assistants: [] }),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listAssistants()

      expect(result).toEqual([])
    })

    it('handles null assistants response', async () => {
      const mockClient = createMockPinecone({
        listAssistants: vi.fn().mockResolvedValue({}),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listAssistants()

      expect(result).toEqual([])
    })

    it('handles null instructions and metadata', async () => {
      const mockClient = createMockPinecone({
        listAssistants: vi.fn().mockResolvedValue({
          assistants: [
            {
              name: 'minimal',
              status: 'Initializing',
              instructions: null,
              metadata: null,
            },
          ],
        }),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listAssistants()

      expect(result[0].instructions).toBeUndefined()
      expect(result[0].metadata).toBeUndefined()
      expect(result[0].createdAt).toBeUndefined()
      expect(result[0].updatedAt).toBeUndefined()
    })
  })

  describe('listFiles', () => {
    it('maps SDK file response to AssistantFile[]', async () => {
      const mockAssistant = {
        listFiles: vi.fn().mockResolvedValue({
          files: [
            {
              id: 'file-123',
              name: 'report.pdf',
              status: 'Available',
              percentDone: 1.0,
              metadata: { department: 'sales' },
              signedUrl: 'https://storage.example.com/file-123',
              errorMessage: null,
              createdOn: new Date('2024-02-01T10:00:00Z'),
              updatedOn: new Date('2024-02-01T12:00:00Z'),
            },
          ],
        }),
      }

      const mockClient = createMockPinecone({
        assistant: vi.fn().mockReturnValue(mockAssistant),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listFiles('my-assistant')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'file-123',
        name: 'report.pdf',
        status: 'Available',
        percentDone: 1.0,
        metadata: { department: 'sales' },
        signedUrl: 'https://storage.example.com/file-123',
        errorMessage: null,
        createdOn: '2024-02-01T10:00:00.000Z',
        updatedOn: '2024-02-01T12:00:00.000Z',
      })
    })

    it('defaults to Processing status when missing', async () => {
      const mockAssistant = {
        listFiles: vi.fn().mockResolvedValue({
          files: [
            {
              id: 'file-456',
              name: 'doc.txt',
              // status intentionally omitted
            },
          ],
        }),
      }

      const mockClient = createMockPinecone({
        assistant: vi.fn().mockReturnValue(mockAssistant),
      })

      const service = new AssistantService(mockClient)
      const result = await service.listFiles('my-assistant')

      expect(result[0].status).toBe('Processing')
    })
  })

  describe('mapSingleCitation (via chat)', () => {
    it('maps citation with file references and pages', async () => {
      const mockAssistant = {
        chat: vi.fn().mockResolvedValue({
          id: 'chat-1',
          message: { role: 'assistant', content: 'Hello' },
          citations: [
            {
              position: 42,
              references: [
                {
                  file: { name: 'guide.pdf', id: 'file-abc' },
                  pages: [1, 2, 3],
                },
              ],
            },
          ],
          model: 'gpt-4o',
        }),
      }

      const mockClient = createMockPinecone({
        assistant: vi.fn().mockReturnValue(mockAssistant),
      })

      const service = new AssistantService(mockClient)
      const result = await service.chat('my-assistant', {
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.citations).toBeDefined()
      expect(result.citations).toHaveLength(1)
      expect(result.citations![0]).toEqual({
        position: 42,
        references: [
          {
            file: { name: 'guide.pdf', id: 'file-abc' },
            pages: [1, 2, 3],
          },
        ],
      })
    })

    it('handles null/undefined citations', async () => {
      const mockAssistant = {
        chat: vi.fn().mockResolvedValue({
          id: 'chat-2',
          message: { role: 'assistant', content: 'Hello' },
          citations: undefined,
        }),
      }

      const mockClient = createMockPinecone({
        assistant: vi.fn().mockReturnValue(mockAssistant),
      })

      const service = new AssistantService(mockClient)
      const result = await service.chat('my-assistant', {
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.citations).toBeUndefined()
    })

    it('filters out invalid citations', async () => {
      const mockAssistant = {
        chat: vi.fn().mockResolvedValue({
          id: 'chat-3',
          message: { role: 'assistant', content: 'Hello' },
          citations: [null, undefined, 'invalid', { position: 1, references: [] }],
        }),
      }

      const mockClient = createMockPinecone({
        assistant: vi.fn().mockReturnValue(mockAssistant),
      })

      const service = new AssistantService(mockClient)
      const result = await service.chat('my-assistant', {
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.citations).toHaveLength(1)
      expect(result.citations![0].position).toBe(1)
    })
  })
})
