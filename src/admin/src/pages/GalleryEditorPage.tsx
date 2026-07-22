import { useState } from 'react'
import { Box, Button, Flex, HStack } from '@chakra-ui/react'
import { Settings } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader, StatusFooter } from '../components/PageHeader'
import { GalleryEditor } from '../features/gallery-editor/components/GalleryEditor'

export function GalleryEditorPage(): JSX.Element {
  const navigate = useNavigate()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [state, setState] = useState({ dirty: false, revision: 0 })
  return (
    <Flex direction="column" h="100vh">
      <PageHeader
        crumbs={[
          { label: 'Projects', to: '/' },
          { label: projectId, to: `/projects/${projectId}/gallery-editor` },
          { label: 'Gallery Editor' },
        ]}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/projects/${projectId}/settings`)}
          >
            <HStack gap="1.5">
              <Settings size={14} />
              Settings
            </HStack>
          </Button>
        }
      />
      <Box flex="1" minH="0">
        <GalleryEditor projectId={projectId} onStateChange={setState} />
      </Box>
      <StatusFooter revision={state.revision} isDirty={state.dirty} backendOk />
    </Flex>
  )
}
