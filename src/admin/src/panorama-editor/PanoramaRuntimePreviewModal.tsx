import { Badge, Box, Button, Flex, Text } from '@chakra-ui/react'
import { X } from 'lucide-react'
import type { PanoramaEditorDocument } from '../../../shared/panorama-types'
import { PanoramaRuntimeHostView } from './PanoramaRuntimeHostView'

interface PanoramaRuntimePreviewModalProps {
  document: PanoramaEditorDocument
  onClose: () => void
}

export function PanoramaRuntimePreviewModal({
  document,
  onClose,
}: PanoramaRuntimePreviewModalProps) {
  return (
    <Flex position="fixed" inset="0" zIndex={220} align="center" justify="center">
      <Box position="absolute" inset="0" bg="rgba(2, 4, 10, 0.82)" backdropFilter="blur(6px)" onClick={onClose} />
      <Flex
        position="relative"
        zIndex={1}
        w="min(620px, calc(100vw - 48px))"
        h="min(620px, calc(100vh - 48px))"
        borderRadius="2xl"
        overflow="hidden"
        bg="rgba(10, 11, 15, 0.98)"
        border="1px solid"
        borderColor="border-default"
        boxShadow="2xl"
        direction="column"
      >
        <Flex align="center" gap="4" px="6" py="4" borderBottom="1px solid" borderColor="border-default">
          <Box flex="1">
            <Text fontSize="lg" fontWeight="800" color="text-primary">运行时预览</Text>
            <Text fontSize="sm" color="text-secondary">基于当前编辑结果的本地运行时预览</Text>
          </Box>
          <Badge bg="brand-subtle" color="brand">Panorama Runtime</Badge>
          <Button
            size="sm"
            variant="ghost"
            color="text-secondary"
            _hover={{ bg: 'surface-overlay', color: 'text-primary' }}
            onClick={onClose}
          >
            <X size={16} style={{ marginRight: 4 }} />
            关闭
          </Button>
        </Flex>

        <Flex px="6" py="5" flex="1" minH="0" align="center" justify="center">
          <Box
            w="min(455px, calc(100vw - 120px), calc(100vh - 180px))"
            h="min(455px, calc(100vw - 120px), calc(100vh - 180px))"
            maxW="100%"
            maxH="100%"
            borderRadius="xl"
            overflow="hidden"
            border="1px solid"
            borderColor="border-default"
            bg="rgba(5, 8, 15, 0.92)"
            boxShadow="inset 0 0 0 1px rgba(255,255,255,0.02)"
          >
            <PanoramaRuntimeHostView product={document.product} />
          </Box>
        </Flex>
      </Flex>
    </Flex>
  )
}
