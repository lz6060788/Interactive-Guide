import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import { ActionButton, ControlField, TextAreaField } from './SurfaceNodeControls.js'
import type {
  CameraState,
  SurfaceConfig,
  SurfaceFocusLayer,
  SurfaceHotspot,
} from '../../../shared/types'
import {
  type EditMode,
  type PreviewMode,
  BORDER,
  PANEL_BG,
  DEFAULT_SOURCE_ASPECT,
  clampCameraToBounds,
  getDefaultLayer,
  getDefaultSurfaceConfig,
  getHotspotMarkerConfig,
  parseJsonSafe,
  resolveDefaultHotspotTarget,
  resolvePreviewCameraForLayer,
  resolveSharedLayerThreshold,
  stringify,
  updateHotspotMarkerStyle,
  updateSelectedCard,
  updateSelectedHotspot,
  updateSelectedLayer,
} from './surface-node-utils'
import { SurfacePreview } from './SurfacePreview'

interface SurfaceNodeDesignerProps {
  imageUrl?: string
  surfaceConfigText: string
  onSurfaceConfigTextChange: (value: string) => void
  surfaceLayersText: string
  onSurfaceLayersTextChange: (value: string) => void
  deviceAspectRatio?: number
  compact?: boolean
  editable?: boolean
  onOpenEditor?: () => void
}

export function SurfaceNodeDesigner({
  imageUrl,
  surfaceConfigText,
  onSurfaceConfigTextChange,
  surfaceLayersText,
  onSurfaceLayersTextChange,
  deviceAspectRatio,
  compact = false,
  editable = true,
  onOpenEditor,
}: SurfaceNodeDesignerProps) {
  const layers = useMemo(
    () => parseJsonSafe<SurfaceFocusLayer[]>(surfaceLayersText) ?? [],
    [surfaceLayersText],
  )
  const surfaceConfig = useMemo(
    () => parseJsonSafe<SurfaceConfig>(surfaceConfigText) ?? getDefaultSurfaceConfig(imageUrl),
    [imageUrl, surfaceConfigText],
  )

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(layers[0]?.id ?? null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(layers[0]?.cards[0]?.id ?? null)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(layers[0]?.hotspots[0]?.id ?? null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('browse')
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [previewCamera, setPreviewCamera] = useState<CameraState>(surfaceConfig.initialCamera)
  const [showDeviceFrame, setShowDeviceFrame] = useState(true)
  const [editorNotice, setEditorNotice] = useState<string | null>(null)
  const resolvedDeviceAspectRatio = deviceAspectRatio ?? DEFAULT_SOURCE_ASPECT

  useEffect(() => {
    const nextLayer = layers.find(layer => layer.id === selectedLayerId) ?? layers[0] ?? null
    if (nextLayer?.id !== selectedLayerId) {
      setSelectedLayerId(nextLayer?.id ?? null)
    }
    const nextCard = nextLayer?.cards.find(card => card.id === selectedCardId) ?? nextLayer?.cards[0] ?? null
    if (nextCard?.id !== selectedCardId) {
      setSelectedCardId(nextCard?.id ?? null)
    }
    const nextHotspot = nextLayer?.hotspots.find(hotspot => hotspot.id === selectedHotspotId) ?? nextLayer?.hotspots[0] ?? null
    if (nextHotspot?.id !== selectedHotspotId) {
      setSelectedHotspotId(nextHotspot?.id ?? null)
    }
  }, [layers, selectedCardId, selectedHotspotId, selectedLayerId])

  useEffect(() => {
    setPreviewCamera(surfaceConfig.initialCamera)
  }, [surfaceConfig.initialCamera.centerX, surfaceConfig.initialCamera.centerY, surfaceConfig.initialCamera.zoom])

  const selectedLayer = layers.find(layer => layer.id === selectedLayerId) ?? null
  const selectedCard = selectedLayer?.cards.find(card => card.id === selectedCardId) ?? null
  const selectedHotspot = selectedLayer?.hotspots.find(hotspot => hotspot.id === selectedHotspotId) ?? null
  const sharedMinZoom = resolveSharedLayerThreshold(layers, 'minZoom', 1)
  const detailThresholdZoom = (
    selectedLayer && selectedLayer.id !== 'overview'
      ? selectedLayer.visibility.minZoom
      : layers.find(layer => layer.id !== 'overview')?.visibility.minZoom
  ) ?? sharedMinZoom
  const alignPreviewZoomToThreshold = () => {
    setPreviewCamera(current => clampCameraToBounds({
      ...current,
      zoom: detailThresholdZoom,
    }, surfaceConfig.bounds))
  }

  const applyLayers = (nextLayers: SurfaceFocusLayer[]) => {
    onSurfaceLayersTextChange(stringify(nextLayers))
  }

  const applySurfaceConfig = (nextConfig: SurfaceConfig) => {
    onSurfaceConfigTextChange(stringify(nextConfig))
  }

  const applySharedThreshold = (value: number) => {
    applyLayers(layers.map(layer => ({
      ...layer,
      visibility: {
        ...layer.visibility,
        minZoom: value,
        hotspotsMinZoom: value,
        cardsMinZoom: value,
      },
      cameraPreset: layer.cameraPreset
        ? {
            ...layer.cameraPreset,
            zoom: value,
          }
        : layer.cameraPreset,
    })))
  }

  const focusLayer = (layer: SurfaceFocusLayer | null, _mode: PreviewMode) => {
    setPreviewCamera(resolvePreviewCameraForLayer(layer, surfaceConfig))
  }

  const ensureDefaults = () => {
    if (!surfaceConfigText.trim()) {
      applySurfaceConfig(getDefaultSurfaceConfig(imageUrl))
    }
    if (layers.length === 0) {
      const nextLayer = getDefaultLayer(1)
      applyLayers([nextLayer])
      setSelectedLayerId(nextLayer.id)
      setPreviewMode('browse')
      focusLayer(nextLayer, 'browse')
    }
  }

  const addLayer = () => {
    const nextLayer: SurfaceFocusLayer = {
      ...getDefaultLayer(layers.length + 1),
      visibility: {
        minZoom: sharedMinZoom,
        hotspotsMinZoom: sharedMinZoom,
        cardsMinZoom: sharedMinZoom,
      },
    }
    const nextLayers = [...layers, nextLayer]
    applyLayers(nextLayers)
    setSelectedLayerId(nextLayer.id)
    setSelectedCardId(null)
    setSelectedHotspotId(null)
    setPreviewMode('browse')
    setEditMode(null)
    focusLayer(nextLayer, 'browse')
  }

  const addCard = () => {
    const targetLayerId = selectedLayerId ?? layers[0]?.id
    if (!targetLayerId) return
    const nextLayers = layers.map(layer => (
      layer.id === targetLayerId
        ? {
            ...layer,
            cards: [
              ...layer.cards,
              {
                id: `card_${Date.now()}`,
                title: `三级按钮 ${layer.cards.length + 1}`,
                anchor: { x: 0.5, y: 0.5 },
                coordSpace: 'surface-normalized',
                tags: [],
                stocks: [],
              },
            ],
          }
        : layer
    ))
    applyLayers(nextLayers)
    const latestLayer = nextLayers.find(layer => layer.id === targetLayerId) ?? null
    const latestCard = latestLayer?.cards[latestLayer.cards.length - 1] ?? null
    setSelectedCardId(latestCard?.id ?? null)
    setPreviewMode('cards')
    setEditMode('card-anchor')
    focusLayer(latestLayer, 'cards')
  }

  const addHotspot = () => {
    const targetLayerId = selectedLayerId ?? layers[0]?.id
    if (!targetLayerId) return
    const defaultTarget = resolveDefaultHotspotTarget(layers, targetLayerId, previewCamera)
    const nextLayers = layers.map(layer => (
      layer.id === targetLayerId
        ? {
            ...layer,
            hotspots: [
              ...layer.hotspots,
              {
                id: `hotspot_${Date.now()}`,
                label: `热点 ${layer.hotspots.length + 1}`,
                anchor: { x: 0.5, y: 0.5 },
                coordSpace: 'surface-normalized',
                target: defaultTarget,
              },
            ],
          }
        : layer
    ))
    applyLayers(nextLayers)
    const latestLayer = nextLayers.find(layer => layer.id === targetLayerId) ?? null
    const latestHotspot = latestLayer?.hotspots[latestLayer.hotspots.length - 1] ?? null
    setSelectedHotspotId(latestHotspot?.id ?? null)
    setPreviewMode('hotspots')
    setEditMode('hotspot-anchor')
    focusLayer(latestLayer, 'hotspots')
  }

  const handleDragPoint = (x: number, y: number) => {
    if (!selectedLayerId || !editMode) return
    if (editMode === 'hotspot-anchor' && selectedHotspotId) {
      applyLayers(updateSelectedHotspot(layers, selectedLayerId, selectedHotspotId, hotspot => ({
        ...hotspot,
        anchor: { x, y },
      })))
      return
    }
    if (!selectedCardId) return
    applyLayers(updateSelectedCard(layers, selectedLayerId, selectedCardId, card => (
      editMode === 'card-anchor'
        ? { ...card, anchor: { x, y } }
        : {
            ...card,
            callout: {
              fromDock: card.callout?.fromDock ?? 'bottom',
              target: { x, y },
            },
          }
    )))
  }

  if (compact) {
    return (
      <Box mb="4" p="3" rounded="md" border={`1px solid ${BORDER}`} bg={PANEL_BG}>
        <Box h="260px">
          <SurfacePreview
            imageUrl={imageUrl}
            surfaceConfig={surfaceConfig}
            layers={layers}
            selectedLayerId={selectedLayerId}
            selectedCardId={selectedCardId}
            selectedHotspotId={selectedHotspotId}
            previewMode="browse"
            editMode={null}
            editable={false}
            previewCamera={surfaceConfig.initialCamera}
            onPreviewCameraChange={() => {}}
            deviceAspectRatio={resolvedDeviceAspectRatio}
            showDeviceFrame={false}
          />
        </Box>
        <Flex mt="3" gap="2" justify="space-between">
          <ActionButton onClick={ensureDefaults}>初始化 Surface</ActionButton>
          {onOpenEditor && (
            <ActionButton active onClick={onOpenEditor}>打开大画布编辑</ActionButton>
          )}
        </Flex>
      </Box>
    )
  }

  return (
    <Flex gap="4" h="100%" minH="0">
      <Box flex="1" minW="0" minH="0" display="flex" flexDir="column">
        <Box flex="1" minH="420px">
          <SurfacePreview
            imageUrl={imageUrl}
            surfaceConfig={surfaceConfig}
            layers={layers}
            selectedLayerId={selectedLayerId}
            selectedCardId={selectedCardId}
            selectedHotspotId={selectedHotspotId}
            previewMode={previewMode}
            editMode={editable ? editMode : null}
            editable={editable}
            previewCamera={previewCamera}
            onPreviewCameraChange={setPreviewCamera}
            onDragPoint={editable ? handleDragPoint : undefined}
            deviceAspectRatio={resolvedDeviceAspectRatio}
            showDeviceFrame={showDeviceFrame}
          />
        </Box>
        <Flex mt="3" gap="2" wrap="wrap">
          <ActionButton onClick={ensureDefaults}>初始化</ActionButton>
          <ActionButton active={previewMode === 'browse'} onClick={() => {
            setPreviewMode('browse')
            setEditMode(null)
            focusLayer(selectedLayer, 'browse')
          }}>
            浏览预览
          </ActionButton>
          <ActionButton active={previewMode === 'cards'} onClick={() => {
            setPreviewMode('cards')
            setEditMode(null)
            focusLayer(selectedLayer, 'cards')
          }} disabled={!selectedLayer}>
            只看三级按钮
          </ActionButton>
          <ActionButton active={previewMode === 'hotspots'} onClick={() => {
            setPreviewMode('hotspots')
            setEditMode(null)
            focusLayer(selectedLayer, 'hotspots')
          }} disabled={!selectedLayer}>
            只看二级热点
          </ActionButton>
          <ActionButton onClick={() => setPreviewCamera(surfaceConfig.initialCamera)}>
            重置视角
          </ActionButton>
          <ActionButton onClick={alignPreviewZoomToThreshold}>
            缩放到阈值
          </ActionButton>
          <ActionButton onClick={addLayer}>新增图层</ActionButton>
          <ActionButton onClick={addCard} disabled={!layers.length}>新增三级按钮</ActionButton>
          <ActionButton onClick={addHotspot} disabled={!layers.length}>新增二级热点</ActionButton>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dbe7ff', fontSize: 12, padding: '0 4px' }}>
            <input
              type="checkbox"
              checked={showDeviceFrame}
              onChange={event => setShowDeviceFrame(event.target.checked)}
            />
            显示设备取景框
          </label>
        </Flex>
      </Box>

      <Box w="360px" minW="360px" h="100%" overflow="auto" pr="1">
        <Heading size="xs" mb="2" color="#dbe7ff">二级图层</Heading>
        <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
          {layers.map(layer => (
            <Box key={layer.id} mb="2">
              <ActionButton
                active={selectedLayerId === layer.id}
                onClick={() => {
                  setSelectedLayerId(layer.id)
                  setSelectedCardId(layer.cards[0]?.id ?? null)
                  setSelectedHotspotId(layer.hotspots[0]?.id ?? null)
                  focusLayer(layer, previewMode)
                }}
              >
                {layer.primaryCategory ? `${layer.primaryCategory} / ${layer.title}` : layer.title}
              </ActionButton>
            </Box>
          ))}
          {layers.length === 0 && (
            <Text fontSize="xs" color="#8ea0c4">暂无图层，点击"初始化"或"新增图层"。</Text>
          )}
        </Box>

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">当前二级图层</Heading>
            <ControlField
              label="一级分类"
              value={selectedLayer.primaryCategory ?? ''}
              onChange={value => applyLayers(updateSelectedLayer(layers, selectedLayer.id, layer => ({ ...layer, primaryCategory: value || undefined })))}
            />
            <ControlField
              label="二级标题"
              value={selectedLayer.title}
              onChange={value => applyLayers(updateSelectedLayer(layers, selectedLayer.id, layer => ({ ...layer, title: value })))}
            />
            <ControlField
              label="统一显示阈值"
              type="number"
              step="0.1"
              min="0.1"
              value={String(sharedMinZoom)}
              onChange={value => {
                const next = Number(value || sharedMinZoom)
                applySharedThreshold(next)
              }}
            />
            <ActionButton onClick={() => {
              applyLayers(updateSelectedLayer(layers, selectedLayer.id, layer => ({
                ...layer,
                cameraPreset: {
                  ...previewCamera,
                  zoom: sharedMinZoom,
                },
              })))
              setEditorNotice(`已写入图层 "${selectedLayer.title}" 的 cameraPreset，点击保存后生效`)
            }}>
              用当前视角写入 cameraPreset
            </ActionButton>
            {editorNotice && (
              <Text mt="2" fontSize="xs" color="#8fd3ff">{editorNotice}</Text>
            )}
          </Box>
        )}

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">三级按钮</Heading>
            <Flex gap="2" wrap="wrap" mb="3">
              {selectedLayer.cards.map(card => (
                <ActionButton
                  key={card.id}
                  active={selectedCardId === card.id}
                  onClick={() => {
                    setSelectedCardId(card.id)
                    setPreviewMode('cards')
                    focusLayer(selectedLayer, 'cards')
                  }}
                >
                  {card.title}
                </ActionButton>
              ))}
              {!selectedLayer.cards.length && (
                <Text fontSize="xs" color="#8ea0c4">当前图层暂无卡片</Text>
              )}
            </Flex>

            {selectedCard && (
              <>
                <ControlField
                  label="三级按钮名称"
                  value={selectedCard.title}
                  onChange={value => {
                    applyLayers(updateSelectedCard(layers, selectedLayer.id, selectedCard.id, card => ({
                      ...card,
                      title: value,
                    })))
                  }}
                />
                <TextAreaField
                  label="浮层说明文案"
                  value={selectedCard.description ?? ''}
                  rows={4}
                  onChange={value => {
                    applyLayers(updateSelectedCard(layers, selectedLayer.id, selectedCard.id, card => ({
                      ...card,
                      description: value || undefined,
                    })))
                  }}
                />
                <Flex gap="2" wrap="wrap">
                  <ActionButton active={editMode === 'card-anchor'} onClick={() => {
                    setPreviewMode('cards')
                    setEditMode(editMode === 'card-anchor' ? null : 'card-anchor')
                    focusLayer(selectedLayer, 'cards')
                  }}>
                    拖拽三级按钮位置
                  </ActionButton>
                </Flex>
              </>
            )}
          </Box>
        )}

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">二级热点</Heading>
            <Flex gap="2" wrap="wrap" mb="3">
              {selectedLayer.hotspots.map(hotspot => (
                <ActionButton
                  key={hotspot.id}
                  active={selectedHotspotId === hotspot.id}
                  onClick={() => {
                    setSelectedHotspotId(hotspot.id)
                    setPreviewMode('hotspots')
                    focusLayer(selectedLayer, 'hotspots')
                  }}
                >
                  {hotspot.label}
                </ActionButton>
              ))}
              {!selectedLayer.hotspots.length && (
                <Text fontSize="xs" color="#8ea0c4">当前图层暂无二级热点</Text>
              )}
            </Flex>

            {selectedHotspot && (
              <>
                {(() => {
                  const markerConfig = getHotspotMarkerConfig(selectedHotspot.style)
                  return (
                    <>
                      <Text fontSize="xs" color="#8ea0c4" mb="1">图标显示</Text>
                      <select
                        value={markerConfig.visible ? 'show' : 'none'}
                        onChange={event => {
                          const visible = event.target.value !== 'none'
                          applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                            ...hotspot,
                            style: updateHotspotMarkerStyle(hotspot.style, { visible }),
                          })))
                        }}
                        style={{
                          width: '100%',
                          background: '#090b10',
                          border: `1px solid ${BORDER}`,
                          borderRadius: 6,
                          color: '#e4e4e7',
                          fontSize: 12,
                          padding: '8px 10px',
                          boxSizing: 'border-box',
                          outline: 'none',
                          marginBottom: 10,
                        }}
                      >
                        <option value="show">显示</option>
                        <option value="none">隐藏</option>
                      </select>
                      <Text fontSize="xs" color="#8ea0c4" mb="1">图标位置</Text>
                      <select
                        value={markerConfig.position}
                        disabled={!markerConfig.visible}
                        onChange={event => {
                          const position = event.target.value === 'bottom' ? 'bottom' : 'top'
                          applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                            ...hotspot,
                            style: updateHotspotMarkerStyle(hotspot.style, { position }),
                          })))
                        }}
                        style={{
                          width: '100%',
                          background: '#090b10',
                          border: `1px solid ${BORDER}`,
                          borderRadius: 6,
                          color: markerConfig.visible ? '#e4e4e7' : '#6b7280',
                          fontSize: 12,
                          padding: '8px 10px',
                          boxSizing: 'border-box',
                          outline: 'none',
                          marginBottom: 10,
                        }}
                      >
                        <option value="top">上方</option>
                        <option value="bottom">下方</option>
                      </select>
                      <ControlField
                        label="图标间距(px)"
                        value={String(markerConfig.gapPx)}
                        type="number"
                        min="0"
                        step="1"
                        onChange={value => {
                          const gapPx = Number.parseFloat(value)
                          applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                            ...hotspot,
                            style: updateHotspotMarkerStyle(hotspot.style, {
                              gapPx: Number.isFinite(gapPx) ? gapPx : 0,
                            }),
                          })))
                        }}
                      />
                    </>
                  )
                })()}
                <ControlField
                  label="二级热点标题"
                  value={selectedHotspot.label}
                  onChange={value => {
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                      ...hotspot,
                      label: value,
                    })))
                  }}
                />
                <Text fontSize="xs" color="#8ea0c4" mb="1">目标类型</Text>
                <select
                  value={selectedHotspot.target.type}
                  onChange={event => {
                    const nextType = event.target.value as SurfaceHotspot['target']['type']
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => {
                      if (nextType === 'focus-layer') {
                        const fallbackLayerId = layers.find(layer => layer.id !== selectedLayer.id)?.id ?? selectedLayer.id
                        return {
                          ...hotspot,
                          target: {
                            type: 'focus-layer',
                            layerId: fallbackLayerId,
                          },
                        }
                      }
                      if (nextType === 'edge') {
                        return {
                          ...hotspot,
                          target: {
                            type: 'edge',
                            edgeId: hotspot.target.type === 'edge' ? hotspot.target.edgeId : '',
                          },
                        }
                      }
                      return {
                        ...hotspot,
                        target: {
                          type: 'camera-preset',
                          camera: previewCamera,
                        },
                      }
                    }))
                  }}
                  style={{
                    width: '100%',
                    background: '#090b10',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    color: '#e4e4e7',
                    fontSize: 12,
                    padding: '8px 10px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    marginBottom: 10,
                  }}
                >
                  <option value="focus-layer">focus-layer</option>
                  <option value="camera-preset">camera-preset</option>
                  <option value="edge">edge</option>
                </select>
                {selectedHotspot.target.type === 'focus-layer' && (
                  <>
                    <Text fontSize="xs" color="#8ea0c4" mb="1">目标图层</Text>
                    <select
                      value={selectedHotspot.target.layerId}
                      onChange={event => {
                        applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                          ...hotspot,
                          target: {
                            type: 'focus-layer',
                            layerId: event.target.value,
                          },
                        })))
                      }}
                      style={{
                        width: '100%',
                        background: '#090b10',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        color: '#e4e4e7',
                        fontSize: 12,
                        padding: '8px 10px',
                        boxSizing: 'border-box',
                        outline: 'none',
                        marginBottom: 10,
                      }}
                    >
                      {layers.map(layer => (
                        <option key={layer.id} value={layer.id}>{layer.title}</option>
                      ))}
                    </select>
                  </>
                )}
                {selectedHotspot.target.type === 'camera-preset' && (
                  <ActionButton onClick={() => {
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                      ...hotspot,
                      target: {
                        type: 'camera-preset',
                        camera: previewCamera,
                      },
                    })))
                  }}>
                    用当前视角写入热点镜头
                  </ActionButton>
                )}
                {selectedHotspot.target.type === 'edge' && (
                  <ControlField
                    label="目标 Edge ID"
                    value={selectedHotspot.target.edgeId}
                    onChange={value => {
                      applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                        ...hotspot,
                        target: {
                          type: 'edge',
                          edgeId: value,
                        },
                      })))
                    }}
                  />
                )}
                <ActionButton active={editMode === 'hotspot-anchor'} onClick={() => {
                  setPreviewMode('hotspots')
                  setEditMode(editMode === 'hotspot-anchor' ? null : 'hotspot-anchor')
                  focusLayer(selectedLayer, 'hotspots')
                }}>
                  拖拽二级热点位置
                </ActionButton>
              </>
            )}
          </Box>
        )}

        <Text fontSize="xs" color="#8ea0c4" mb="1.5">surfaceConfig JSON</Text>
        <textarea
          value={surfaceConfigText}
          onChange={event => onSurfaceConfigTextChange(event.target.value)}
          rows={10}
          style={{
            width: '100%',
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 12,
            padding: 12,
            boxSizing: 'border-box',
          }}
        />
        <Text fontSize="xs" color="#8ea0c4" mt="3" mb="1.5">surfaceLayers JSON</Text>
        <textarea
          value={surfaceLayersText}
          onChange={event => onSurfaceLayersTextChange(event.target.value)}
          rows={16}
          style={{
            width: '100%',
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 12,
            padding: 12,
            boxSizing: 'border-box',
          }}
        />
      </Box>
    </Flex>
  )
}

export function SurfaceNodeEditorModal(props: SurfaceNodeDesignerProps & {
  isOpen: boolean
  onClose: () => void
  onSaveCurrent: () => Promise<boolean> | boolean
  saving: boolean
}) {
  const { isOpen, onClose, onSaveCurrent, saving, ...designerProps } = props
  if (!isOpen) return null

  return (
    <Flex position="fixed" inset="0" zIndex={300} align="center" justify="center">
      <Box position="fixed" inset="0" bg="rgba(2,3,5,0.78)" onClick={onClose} />
      <Box position="relative" zIndex={1} w="min(1440px, 96vw)" h="min(900px, 92vh)" bg="#111318" rounded="lg" border={`1px solid ${BORDER}`} p="5">
        <Flex align="center" justify="space-between" mb="4">
          <Heading size="sm" color="white">Surface 节点编辑器</Heading>
          <Flex gap="2">
            <ActionButton onClick={onClose}>关闭</ActionButton>
            <ActionButton
              active
              onClick={async () => {
                const saved = await onSaveCurrent()
                if (saved) {
                  onClose()
                }
              }}
              loading={saving}
            >
              保存并关闭
            </ActionButton>
          </Flex>
        </Flex>
        <Box h="calc(100% - 52px)">
          <SurfaceNodeDesigner {...designerProps} compact={false} editable />
        </Box>
      </Box>
    </Flex>
  )
}
