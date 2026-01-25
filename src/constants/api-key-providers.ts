export interface ApiKeyProvider {
  id: string
  name: string
  description: string
  envVars: string[]
  docsUrl?: string
}

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  {
    id: 'pinecone',
    name: 'Pinecone',
    description: 'Required for Pinecone embeddings/reranking when using Pinecone Local',
    envVars: ['PINECONE_API_KEY'],
    docsUrl: 'https://app.pinecone.io/organizations/-/projects/-/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Required for OpenAI embedding models (text-embedding-3-small, text-embedding-3-large)',
    envVars: ['OPENAI_API_KEY'],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
]
