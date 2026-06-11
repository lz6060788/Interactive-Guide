import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Flex, Heading, HStack, Input, Stack, Text, Textarea } from '@chakra-ui/react'
import type { PanoramaFocusRect, PanoramaGroup, PanoramaItem, PanoramaSection, PanoramaViewport } from '../../../shared/panorama-types'
import { isHtmlGroup, isPanoramaGroup } from '../../../shared/panorama-types'

interface PanoramaInspectorPanelProps {
  section: PanoramaSection | null
  group: PanoramaGroup | null
  item: PanoramaItem | null
  globalPanoramaImageUrl: string
  viewport: PanoramaViewport | null
  focusRect: PanoramaFocusRect | null
  viewportMode: 'group-default' | 'item-override'
  onGroupRenderModeChange: (mode: 'panorama' | 'html') => void
  onViewportModeChange: (mode: 'group-default' | 'item-override') => void
  onClearViewportOverride: () => void
  onGroupTitleChange: (title: string) => void
  onGlobalPanoramaImageUrlChange: (imageUrl: string) => void
  onGroupHtmlEntryUrlChange: (entryUrl: string) => void
  onGroupHtmlMessageTypeChange: (messageType: string) => void
  onGroupHtmlTargetOriginChange: (targetOrigin: string) => void
  onGroupHtmlPayloadChange: (payload: Record<string, unknown>) => void
  onGroupHtmlBundleUpload: (file: File) => void | Promise<void>
  htmlBundleUploading?: boolean
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
  onGroupRenderModeChange,
  onViewportModeChange,
  onClearViewportOverride,
  onGroupTitleChange,
  onGlobalPanoramaImageUrlChange,
  onGroupHtmlEntryUrlChange,
  onGroupHtmlMessageTypeChange,
  onGroupHtmlTargetOriginChange,
  onGroupHtmlPayloadChange,
  onGroupHtmlBundleUpload,
  htmlBundleUploading = false,
  onItemTitleChange,
  onItemDescriptionChange,
  onViewportChange,
  onFocusRectChange,
}: PanoramaInspectorPanelProps) {
  const [payloadDraft, setPayloadDraft] = useState('{}')
  const htmlBundleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!group || !isHtmlGroup(group)) return
    setPayloadDraft(JSON.stringify(group.activationMessage?.payload ?? {}, null, 2))
  }, [group])

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
          <Flex mt="3" gap="2">
            <Button
              size="xs"
              bg={group && isPanoramaGroup(group) ? 'brand' : 'transparent'}
              color={group && isPanoramaGroup(group) ? 'white' : 'text-secondary'}
              border="1px solid"
              borderColor={group && isPanoramaGroup(group) ? 'brand' : 'border-default'}
              _hover={{ bg: group && isPanoramaGroup(group) ? 'brand-hover' : 'surface-overlay', color: 'text-primary' }}
              onClick={() => onGroupRenderModeChange('panorama')}
              isDisabled={!group}
            >
              Panorama
            </Button>
            <Button
              size="xs"
              bg={group && isHtmlGroup(group) ? 'brand' : 'transparent'}
              color={group && isHtmlGroup(group) ? 'white' : 'text-secondary'}
              border="1px solid"
              borderColor={group && isHtmlGroup(group) ? 'brand' : 'border-default'}
              _hover={{ bg: group && isHtmlGroup(group) ? 'brand-hover' : 'surface-overlay', color: 'text-primary' }}
              onClick={() => onGroupRenderModeChange('html')}
              isDisabled={!group}
            >
              HTML
            </Button>
          </Flex>
          <HStack mt="2" gap="2">
            <Badge bg={group && isHtmlGroup(group) ? 'info-subtle' : 'success-subtle'} color={group && isHtmlGroup(group) ? 'info' : 'success'}>
              {group && isHtmlGroup(group) ? 'HTML 视图' : 'Panorama'}
            </Badge>
            <Text color="text-tertiary" fontSize="xs">
              {group && isPanoramaGroup(group) ? `默认视口缩放：${group.defaultViewport.zoom}` : '二级按钮会驱动 HTML 视图切换'}
            </Text>
          </HStack>
        </Box>
        {group && isHtmlGroup(group) ? (
          <Box p="4" borderRadius="lg" bg="linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" border="1px solid" borderColor="border-subtle">
            <Text fontWeight="700" mb="3" color="text-primary">HTML 视图配置</Text>
            <Stack gap="2">
              <Input
                ref={htmlBundleInputRef}
                type="file"
                accept=".zip,application/zip"
                display="none"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void Promise.resolve(onGroupHtmlBundleUpload(file)).finally(() => {
                    event.target.value = ''
                  })
                }}
              />
              <Button
                size="sm"
                variant="outline"
                bg="base"
                color="text-primary"
                borderColor="border-default"
                _hover={{ bg: 'surface-overlay' }}
                isLoading={htmlBundleUploading}
                loadingText="上传中"
                onClick={() => htmlBundleInputRef.current?.click()}
              >
                上传 HTML 压缩包
              </Button>
              <Input
                size="sm"
                value={group.htmlAsset.entryUrl}
                placeholder="输入 HTML 入口 URL"
                onChange={event => onGroupHtmlEntryUrlChange(event.target.value)}
                {...inputProps}
              />
              <Input
                size="sm"
                value={group.activationMessage?.type ?? ''}
                placeholder="输入切换事件类型，例如 switch-view"
                onChange={event => onGroupHtmlMessageTypeChange(event.target.value)}
                {...inputProps}
              />
              <Input
                size="sm"
                value={group.htmlBridge?.targetOrigin ?? ''}
                placeholder="postMessage targetOrigin，默认 *"
                onChange={event => onGroupHtmlTargetOriginChange(event.target.value)}
                {...inputProps}
              />
              <Textarea
                size="sm"
                minH="120px"
                value={payloadDraft}
                placeholder='输入 JSON payload，例如 { "view": "火箭" }'
                onChange={event => setPayloadDraft(event.target.value)}
                onBlur={() => {
                  try {
                    const parsed = JSON.parse(payloadDraft) as unknown
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      onGroupHtmlPayloadChange(parsed as Record<string, unknown>)
                    }
                  } catch {
                    // Keep draft text for further editing until it becomes valid JSON.
                  }
                }}
                {...inputProps}
              />
            </Stack>
            <Text color="text-tertiary" fontSize="xs" mt="2">
              当前组不会显示三级热点，运行时切换到该二级按钮时会向 HTML 发送激活事件；payload 需要是合法 JSON 对象。
            </Text>
            <Text color="text-tertiary" fontSize="xs">
              压缩包内应包含入口 HTML 和它依赖的静态资源，系统会自动解压并绑定入口文件。
            </Text>
          </Box>
        ) : (
          <>
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
          </>
        )}
      </Stack>
    </Box>
  )
}
