import { useEffect, useRef, useState } from 'react'
import { Box, Flex, HStack, Text } from '@chakra-ui/react'
import { Eye } from 'lucide-react'
import type { GuideProject } from '@domain/project-types'
import { readLocalizedText } from '@domain/localization'
import { compileGallery } from '@products/gallery/compiler/gallery-compiler'
import { resolveGalleryManifest } from '@products/contracts/manifest-localization'
import { GalleryScene } from '@products/gallery/runtime/gallery-scene'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'

interface GalleryPreviewCanvasProps {
  project: GuideProject
  selectedItemId: string
  locale: string
  onSelectItem: (itemId: string) => void
}

export function GalleryPreviewCanvas({
  project,
  selectedItemId,
  locale,
  onSelectItem,
}: GalleryPreviewCanvasProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<GalleryScene | null>(null)
  const selectedItemIdRef = useRef(selectedItemId)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId
    const scene = sceneRef.current
    if (!scene || !selectedItemId || scene.getSelection().itemId === selectedItemId) return
    scene.selectItem(selectedItemId)
  }, [selectedItemId])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.innerHTML = ''
    setPreviewError(null)
    let scene: GalleryScene | null = null
    try {
      const previewProject: GuideProject = {
        ...project,
        products: {
          ...project.products,
          gallery: { ...project.products.gallery, enabled: true },
        },
      }
      const resolveAssetUrl = createProjectAssetUrlResolver(previewProject)
      const compiled = compileGallery(previewProject, resolveAssetUrl, () => 'draft-preview')
      const manifest = resolveGalleryManifest(compiled.manifest, locale, {
        allowMissingTranslations: true,
      })
      scene = new GalleryScene({
        root,
        manifest,
        resolveAssetUrl: url => url,
        initialSelection: selectedItemIdRef.current
          ? { itemId: selectedItemIdRef.current }
          : undefined,
        onSelectionChange: next => {
          if (sceneRef.current !== scene || next.itemId === selectedItemIdRef.current) return
          selectedItemIdRef.current = next.itemId
          onSelectItem(next.itemId)
        },
      })
      sceneRef.current = scene
      scene.mount()
    } catch (cause) {
      sceneRef.current = null
      setPreviewError(cause instanceof Error ? cause.message : String(cause))
    }
    return () => {
      if (sceneRef.current === scene) sceneRef.current = null
      scene?.destroy()
    }
  }, [locale, onSelectItem, project])

  const selectedItem = project.knowledge.items[selectedItemId]

  return (
    <Flex h="100%" minW="0" direction="column" bg="bg.sunken" overflow="hidden">
      <HStack
        h="9"
        px="4"
        justify="space-between"
        flexShrink="0"
        borderBottomWidth="1px"
        borderColor="border"
        bg="bg.raised"
      >
        <HStack gap="1.5" color="ink.muted">
          <Eye size={13} />
          <Text className="eyebrow">运行时预览</Text>
        </HStack>
        <Text fontSize="11px" color="ink.faint" fontFamily="mono">
          {selectedItem ? readLocalizedText(selectedItem.title, locale) : '未选择节点'}
        </Text>
      </HStack>
      <Flex flex="1" minH="0" align="center" justify="center" p="5">
        <Box
          data-testid="gallery-preview-frame"
          position="relative"
          w="100%"
          maxW="calc(100vh - 190px)"
          style={{ aspectRatio: '1 / 1' }}
          maxH="calc(100vh - 190px)"
          borderRadius="lg"
          overflow="hidden"
          boxShadow="lg"
          borderWidth="1px"
          borderColor="border.strong"
          bg="#020304"
        >
          <Box ref={rootRef} data-testid="gallery-live-preview" position="absolute" inset="0" />
          {previewError && (
            <Flex
              data-testid="gallery-preview-incomplete"
              position="absolute"
              inset="0"
              align="center"
              justify="center"
              p="8"
              bg="#080a0c"
              color="whiteAlpha.800"
              textAlign="center"
            >
              <Box maxW="420px">
                <Text fontSize="14px" fontWeight="600">
                  预览尚未就绪
                </Text>
                <Text mt="2" fontSize="12px" lineHeight="1.7" color="whiteAlpha.600">
                  请先为全部三级节点绑定真实图片。{previewError}
                </Text>
              </Box>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  )
}
