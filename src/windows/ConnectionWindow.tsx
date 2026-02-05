import { PineconeProvider } from '../providers/PineconeProvider'
import { SelectionProvider } from '../context/SelectionContext'
import { QueryStateProvider } from '../context/QueryStateContext'
import { EmbeddingProvider } from '../context/EmbeddingContext'
import { DraftIndexProvider } from '../context/DraftIndexContext'
import { DraftNamespaceProvider } from '../context/DraftNamespaceContext'
import { DraftAssistantProvider } from '../context/DraftAssistantContext'
import { ClipboardProvider } from '../context/ClipboardContext'
import { ModeProvider } from '../context/ModeContext'
import { AssistantSelectionProvider } from '../context/AssistantSelectionContext'
import { FileSelectionProvider } from '../context/FileSelectionContext'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { AppLayout } from '../components/layout/AppLayout'
import { useProfileQuery } from '../hooks/usePineconeQueries'

interface ConnectionWindowProps {
  windowId: string
  profileId: string
}

export function ConnectionWindow({ windowId, profileId }: ConnectionWindowProps) {
  const { data: profile, isLoading: loading, error } = useProfileQuery(profileId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">
          Error: {error ? (error as Error).message : 'Profile not found'}
        </div>
      </div>
    )
  }

  return (
    <PineconeProvider profile={profile} windowId={windowId}>
      <ModeProvider>
        <ClipboardProvider>
          <SelectionProvider>
            <AssistantSelectionProvider>
              <FileSelectionProvider>
                <QueryStateProvider>
                  <EmbeddingProvider>
                    <DraftIndexProvider>
                      <DraftNamespaceProvider>
                        <DraftAssistantProvider>
                          <ErrorBoundary>
                            <AppLayout />
                          </ErrorBoundary>
                        </DraftAssistantProvider>
                      </DraftNamespaceProvider>
                    </DraftIndexProvider>
                  </EmbeddingProvider>
                </QueryStateProvider>
              </FileSelectionProvider>
            </AssistantSelectionProvider>
          </SelectionProvider>
        </ClipboardProvider>
      </ModeProvider>
    </PineconeProvider>
  )
}
