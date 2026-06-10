import { Badge, Box, Button, Flex, Heading, HStack, Input, Stack, Text, Textarea } from '@chakra-ui/react'
import type { PanoramaFocusRect, PanoramaGroup, PanoramaItem, PanoramaSection, PanoramaViewport } from '../../../shared/panorama-types'

interface PanoramaInspectorPanelProps {
  section: PanoramaSection | null
  group: PanoramaGroup | null
  item: PanoramaItem | null
  globalPanoramaImageUrl: string
  viewport: PanoramaViewport | null
  focusRect: PanoramaFocusRect | null
  viewportMode: 'group-default' | 'item-override'
  onViewportModeChange: (mode: 'group-default' | 'item-override') => void
  onClearViewportOverride: () => void
  onGroupTitleChange: (title: string) => void
  onGlobalPanoramaImageUrlChange: (imageUrl: string) => void
  onItemTitleChange: (title: string) => void
  onItemDescriptionChange: (description: string) => void
  onViewportChange: (viewport: PanoramaViewport) => void
  onFocusRectChange: (focusRect: PanoramaFocusRect) => void
}

function handleViewportNumberChange(
  viewport: PanoramaViewport | null,
  key: keyof PanoramaViewport,
  rawValue: string,
  onViewportChange: (viewport: PanoramaViewport) => void,
) {
  if (!viewport) return
  const nextValue = Number(rawValue)
  if (!Number.isFinite(nextValue)) return
  onViewportChange({
    ...viewport,
    [key]: nextValue,
  })
}

function handleFocusRectNumberChange(
  focusRect: PanoramaFocusRect | null,
  key: keyof PanoramaFocusRect,
  rawValue: string,
  onFocusRectChange: (focusRect: PanoramaFocusRect) => void,
) {
  if (!focusRect) return
  const nextValue = Number(rawValue)
  if (!Number.isFinite(nextValue)) return
  onFocusRectChange({
    ...focusRect,
    [key]: nextValue,
  })
}

export function PanoramaInspectorPanel({
  section,
  group,
  item,
  globalPanoramaImageUrl,
  viewport,
  focusRect,
  viewportMode,
  onViewportModeChange,
  onClearViewportOverride,
  onGroupTitleChange,
  onGlobalPanoramaImageUrlChange,
  onItemTitleChange,
  onItemDescriptionChange,
  onViewportChange,
  onFocusRectChange,
}: PanoramaInspectorPanelProps) {
  const inputProps = {
    bg: 'base',
    color: 'text-primary',
    borderColor: 'border-default',
    _placeholder: { color: 'text-tertiary' },
    _hover: { borderColor: 'text-secondary' },
    _focusVisible: {
      borderColor: 'brand',
      boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.45)',
    },
  }

  return (
    <Box
      w="360px"
      bg="surface"
      borderRadius="xl"
      p="5"
      overflowY="auto"
      border="1px solid"
      borderColor="border-default"
      boxShadow="lg"
    >
      <Flex justify="space-between" align="flex-start" mb="4">
        <Box>
          <Heading size="sm" color="text-primary">属性面板</Heading>
          <Text fontSize="xs" color="text-tertiary" mt="1">编辑当前选中一级 / 二级 / 三级对象</Text>
        </Box>
        <Badge bg="surface-raised" color="text-secondary">Inspector</Badge>
      </Flex>
      <Stack gap="4" fontSize="sm">
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Text fontWeight="700" mb="3" color="text-primary">全局全景图</Text>
          <Input
            size="sm"
            value={globalPanoramaImageUrl}
            placeholder="输入全局全景图 URL"
            onChange={event => onGlobalPanoramaImageUrlChange(event.target.value)}
            {...inputProps}
          />
          <Text color="text-tertiary" fontSize="xs" mt="2">当前编辑器按同一张全景图统一预览所有一级/二级/三级内容。</Text>
        </Box>
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Text fontWeight="700" mb="1" color="text-primary">一级</Text>
          <Text color="text-secondary">{section?.label ?? '未选择'}</Text>
        </Box>
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Text fontWeight="700" mb="3" color="text-primary">二级</Text>
          <Input
            size="sm"
            value={group?.title ?? ''}
            placeholder="输入二级标题"
            onChange={event => onGroupTitleChange(event.target.value)}
            isDisabled={!group}
            {...inputProps}
          />
          <Text color="text-tertiary" fontSize="xs" mt="2">默认视口缩放：{group?.defaultViewport.zoom ?? '-'}</Text>
        </Box>
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Text fontWeight="700" mb="3" color="text-primary">三级</Text>
          <Stack gap="2">
            <Input
              size="sm"
              value={item?.title ?? ''}
              placeholder="输入三级标题"
              onChange={event => onItemTitleChange(event.target.value)}
              isDisabled={!item}
              {...inputProps}
            />
            <Textarea
              size="sm"
              minH="120px"
              value={item?.description ?? ''}
              placeholder="输入三级说明文案"
              onChange={event => onItemDescriptionChange(event.target.value)}
              isDisabled={!item}
              {...inputProps}
            />
          </Stack>
        </Box>
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <Text fontWeight="700" mb="2" color="text-primary">视口编辑</Text>
          <Flex gap="2" mb="3">
            <Button
              size="xs"
              bg={viewportMode === 'group-default' ? 'brand' : 'transparent'}
              color={viewportMode === 'group-default' ? 'white' : 'text-secondary'}
              border="1px solid"
              borderColor={viewportMode === 'group-default' ? 'brand' : 'border-default'}
              _hover={{ bg: viewportMode === 'group-default' ? 'brand-hover' : 'surface-overlay', color: 'text-primary' }}
              onClick={() => onViewportModeChange('group-default')}
              isDisabled={!group}
            >
              二级默认
            </Button>
            <Button
              size="xs"
              bg={viewportMode === 'item-override' ? 'brand' : 'transparent'}
              color={viewportMode === 'item-override' ? 'white' : 'text-secondary'}
              border="1px solid"
              borderColor={viewportMode === 'item-override' ? 'brand' : 'border-default'}
              _hover={{ bg: viewportMode === 'item-override' ? 'brand-hover' : 'surface-overlay', color: 'text-primary' }}
              onClick={() => onViewportModeChange('item-override')}
              isDisabled={!item}
            >
              三级覆盖
            </Button>
          </Flex>
          <Text color="text-tertiary" fontSize="xs" mb="3">
            当前编辑对象：{viewportMode === 'group-default' ? '二级默认视口' : '三级覆盖视口'}
          </Text>
          <Text color="text-tertiary" fontSize="xs" mb="3">
            预估范围按 1:1 比例显示，默认 zoom 建议值为 3.6。
          </Text>
          <Stack gap="2">
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={viewport?.centerX ?? ''}
              placeholder="centerX"
              onChange={event => handleViewportNumberChange(viewport, 'centerX', event.target.value, onViewportChange)}
              isDisabled={!viewport}
              {...inputProps}
            />
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={viewport?.centerY ?? ''}
              placeholder="centerY"
              onChange={event => handleViewportNumberChange(viewport, 'centerY', event.target.value, onViewportChange)}
              isDisabled={!viewport}
              {...inputProps}
            />
            <Flex gap="2">
              <Button
                size="xs"
                variant="outline"
                bg="base"
                color="text-primary"
                borderColor="border-default"
                _hover={{ bg: 'surface-overlay' }}
                onClick={() => {
                  if (!viewport) return
                  onViewportChange({ ...viewport, zoom: Math.max(0.1, Number((viewport.zoom - 0.1).toFixed(2))) })
                }}
                isDisabled={!viewport}
              >
                -0.1
              </Button>
              <Input
                size="sm"
                type="number"
                step="0.01"
                min="0.1"
                value={viewport?.zoom ?? ''}
                placeholder="zoom"
                onChange={event => handleViewportNumberChange(viewport, 'zoom', event.target.value, onViewportChange)}
                isDisabled={!viewport}
                {...inputProps}
              />
              <Button
                size="xs"
                variant="outline"
                bg="base"
                color="text-primary"
                borderColor="border-default"
                _hover={{ bg: 'surface-overlay' }}
                onClick={() => {
                  if (!viewport) return
                  onViewportChange({ ...viewport, zoom: Number((viewport.zoom + 0.1).toFixed(2)) })
                }}
                isDisabled={!viewport}
              >
                +0.1
              </Button>
            </Flex>
            <Button
              size="xs"
              variant="ghost"
              color="text-secondary"
              _hover={{ bg: 'surface-overlay', color: 'text-primary' }}
              alignSelf="flex-start"
              onClick={onClearViewportOverride}
              isDisabled={!item?.viewportOverride}
            >
              清除三级覆盖，回到二级默认
            </Button>
          </Stack>
        </Box>
        <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
          <HStack justify="space-between" mb="2">
            <Text fontWeight="700" color="text-primary">聚焦框编辑</Text>
            <Badge bg="warning-subtle" color="warning">Focus Rect</Badge>
          </HStack>
          <Stack gap="2">
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={focusRect?.x ?? ''}
              placeholder="focusRect.x"
              onChange={event => handleFocusRectNumberChange(focusRect, 'x', event.target.value, onFocusRectChange)}
              isDisabled={!focusRect}
              {...inputProps}
            />
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={focusRect?.y ?? ''}
              placeholder="focusRect.y"
              onChange={event => handleFocusRectNumberChange(focusRect, 'y', event.target.value, onFocusRectChange)}
              isDisabled={!focusRect}
              {...inputProps}
            />
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0.04"
              max="1"
              value={focusRect?.width ?? ''}
              placeholder="focusRect.width"
              onChange={event => handleFocusRectNumberChange(focusRect, 'width', event.target.value, onFocusRectChange)}
              isDisabled={!focusRect}
              {...inputProps}
            />
            <Input
              size="sm"
              type="number"
              step="0.01"
              min="0.04"
              max="1"
              value={focusRect?.height ?? ''}
              placeholder="focusRect.height"
              onChange={event => handleFocusRectNumberChange(focusRect, 'height', event.target.value, onFocusRectChange)}
              isDisabled={!focusRect}
              {...inputProps}
            />
          </Stack>
        </Box>
      </Stack>
    </Box>
  )
}
