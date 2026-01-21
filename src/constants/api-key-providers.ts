export interface ApiKeyProvider {
  id: string
  name: string
  description: string
  envVars: string[]
  docsUrl?: string
}

export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Required for OpenAI embedding models (text-embedding-3-small, text-embedding-3-large)',
    envVars: ['OPENAI_API_KEY'],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
]
