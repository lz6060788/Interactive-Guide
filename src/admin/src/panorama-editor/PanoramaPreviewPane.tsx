import { Box, Grid, GridItem, Heading, Stack, Text } from '@chakra-ui/react'
import type { PanoramaRuntimeState } from '../../../shared/panorama-types'

interface PanoramaPreviewPaneProps {
  runtimeState: PanoramaRuntimeState | null
}

export function PanoramaPreviewPane({ runtimeState }: PanoramaPreviewPaneProps) {
  return (
    <Box
      bg="surface"
      borderRadius="xl"
      p="5"
      border="1px solid"
      borderColor="border-default"
      boxShadow="lg"
    >
      <Heading size="sm" mb="1" color="text-primary">预览状态</Heading>
      <Text fontSize="xs" color="text-tertiary" mb="4">当前运行时状态快照</Text>
      <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap="3">
        <GridItem p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Stack gap="1" fontSize="sm">
            <Text color="text-tertiary">activeSectionId</Text>
            <Text color="text-primary" fontFamily="mono">{runtimeState?.activeSectionId ?? '-'}</Text>
          </Stack>
        </GridItem>
        <GridItem p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Stack gap="1" fontSize="sm">
            <Text color="text-tertiary">activeGroupId</Text>
            <Text color="text-primary" fontFamily="mono">{runtimeState?.activeGroupId ?? '-'}</Text>
          </Stack>
        </GridItem>
        <GridItem p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Stack gap="1" fontSize="sm">
            <Text color="text-tertiary">activeItemId</Text>
            <Text color="text-primary" fontFamily="mono">{runtimeState?.activeItemId ?? '-'}</Text>
          </Stack>
        </GridItem>
      </Grid>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3" mt="3">
        <GridItem p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Stack gap="1" fontSize="sm">
            <Text color="text-tertiary">interactionMode</Text>
            <Text color="text-primary" fontFamily="mono">{runtimeState?.interactionMode ?? '-'}</Text>
          </Stack>
        </GridItem>
        <GridItem p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Stack gap="1" fontSize="sm">
            <Text color="text-tertiary">viewport</Text>
            <Text color="text-primary" fontFamily="mono">
              {runtimeState ? `${runtimeState.activeViewport.centerX.toFixed(2)}, ${runtimeState.activeViewport.centerY.toFixed(2)}, zoom ${runtimeState.activeViewport.zoom.toFixed(2)}` : '-'}
            </Text>
          </Stack>
        </GridItem>
      </Grid>
      <Box mt="3" p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
        <Stack gap="1" fontSize="sm">
          <Text color="text-tertiary">focusRect</Text>
          <Text color="text-primary" fontFamily="mono">
            {runtimeState ? `${runtimeState.activeFocusRect.x.toFixed(2)}, ${runtimeState.activeFocusRect.y.toFixed(2)}, ${runtimeState.activeFocusRect.width.toFixed(2)}, ${runtimeState.activeFocusRect.height.toFixed(2)}` : '-'}
          </Text>
        </Stack>
      </Box>
    </Box>
  )
}
