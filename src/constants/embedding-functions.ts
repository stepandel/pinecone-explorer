export type EmbeddingFunctionType =
  | 'pinecone'
  | 'openai'

export type VectorType = 'dense' | 'sparse'
export type DistanceMetric = 'cosine' | 'euclidean' | 'dotproduct'

export interface EmbeddingFunctionConfig {
  id: string
  label: string
  type: EmbeddingFunctionType
  modelName: string
  vectorType: VectorType
  supportedMetrics: DistanceMetric[]
  defaultDimension?: number // Not applicable for sparse vectors
  availableDimensions?: number[] // For models with variable dimensions
  group: string // For UI grouping
}

export const EMBEDDING_FUNCTIONS: EmbeddingFunctionConfig[] = [
  // Pinecone Inference - Dense models (no additional API key needed)
  {
    id: 'pinecone-llama-text-embed-v2',
    label: 'Llama Text Embed v2',
    type: 'pinecone',
    modelName: 'llama-text-embed-v2',
    vectorType: 'dense',
    supportedMetrics: ['cosine', 'dotproduct'],
    defaultDimension: 1024,
    availableDimensions: [384, 512, 768, 1024, 2048],
    group: 'Pinecone',
  },
  {
    id: 'pinecone-multilingual-e5-large',
    label: 'Multilingual E5 Large',
    type: 'pinecone',
    modelName: 'multilingual-e5-large',
    vectorType: 'dense',
    supportedMetrics: ['cosine', 'euclidean'],
    defaultDimension: 1024,
    group: 'Pinecone',
  },

  // Pinecone Inference - Sparse model
  {
    id: 'pinecone-sparse-english-v0',
    label: 'Sparse English v0',
    type: 'pinecone',
    modelName: 'pinecone-sparse-english-v0',
    vectorType: 'sparse',
    supportedMetrics: ['dotproduct'],
    // No defaultDimension - sparse vectors have variable dimensions
    group: 'Pinecone',
  },

  // OpenAI (requires OPENAI_API_KEY) - Dense models
  {
    id: 'openai-3-small',
    label: 'OpenAI 3-Small',
    type: 'openai',
    modelName: 'text-embedding-3-small',
    vectorType: 'dense',
    supportedMetrics: ['cosine', 'dotproduct'],
    defaultDimension: 1536,
    availableDimensions: [1536, 512],
    group: 'OpenAI',
  },
  {
    id: 'openai-3-large',
    label: 'OpenAI 3-Large',
    type: 'openai',
    modelName: 'text-embedding-3-large',
    vectorType: 'dense',
    supportedMetrics: ['cosine', 'dotproduct'],
    defaultDimension: 1024,
    availableDimensions: [3072, 1024, 256],
    group: 'OpenAI',
  },
]

// Get unique groups in order
export const EMBEDDING_FUNCTION_GROUPS = [...new Set(EMBEDDING_FUNCTIONS.map(ef => ef.group))]

// Helper to get config by ID
export const getEmbeddingFunctionById = (id: string) =>
  EMBEDDING_FUNCTIONS.find((ef) => ef.id === id)

// Helper to get config by ID with strict validation (throws on not found)
export const getEmbeddingFunctionByIdStrict = (id: string): EmbeddingFunctionConfig => {
  const func = EMBEDDING_FUNCTIONS.find((ef) => ef.id === id)
  if (!func) {
    throw new Error(`Unknown embedding function ID: ${id}`)
  }
  return func
}

// Helper to get config by type+model
export const getEmbeddingFunctionByModel = (type: string, modelName: string) =>
  EMBEDDING_FUNCTIONS.find((ef) => ef.type === type && ef.modelName === modelName)

// Helper to get config by type+model with validation (logs warning on not found)
export const getEmbeddingFunctionByModelStrict = (type: string, modelName: string): EmbeddingFunctionConfig | null => {
  const func = EMBEDDING_FUNCTIONS.find((ef) => ef.type === type && ef.modelName === modelName)
  if (!func) {
    console.warn(`No matching embedding function for type=${type}, model=${modelName}`)
  }
  return func ?? null
}

// Helper to get functions by group
export const getEmbeddingFunctionsByGroup = (group: string) =>
  EMBEDDING_FUNCTIONS.filter((ef) => ef.group === group)

// Default embedding function ID
export const DEFAULT_EMBEDDING_FUNCTION_ID = 'pinecone-llama-text-embed-v2'
