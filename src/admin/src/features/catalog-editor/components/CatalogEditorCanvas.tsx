import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass } from 'lucide-react'
import type { GuideProject, PanoramaModel } from '@domain/project-types'
import { compileCatalog } from '@products/catalog/compiler/catalog-compiler'
import { CatalogScene, type CatalogSceneSelection } from '@products/catalog/runtime/catalog-scene'
import type { CatalogSelection } from '../store'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'
import { resolveCatalogManifest } from '@products/contracts/manifest-localization'

interface Props {
  project: GuideProject
  selectedStage: 'upstream' | 'midstream' | 'downstream'
  selection: CatalogSelection
  onSelectStage: (stage: 'upstream' | 'midstream' | 'downstream') => void
  onSelect: (selection: CatalogSelection) => void
  onPatchPanorama: (mutator: (panorama: PanoramaModel) => PanoramaModel) => void
  mode: 'editor' | 'preview'
  locale: string
}

export function CatalogEditorCanvas({
  project,
  selectedStage,
  selection,
  onSelectStage,
  onSelect,
  onPatchPanorama,
  mode,
  locale,
}: Props): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<CatalogScene | null>(null)
  const callbacksRef = useRef({ onSelectStage, onSelect, onPatchPanorama })
  callbacksRef.current = { onSelectStage, onSelect, onPatchPanorama }
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const blocked = !project.panorama.assetId || !project.assets.byId[project.panorama.assetId]
  const logicalSize = 1000
  const scale = useMemo(() => {
    if (!stageSize.width || !stageSize.height) return 1
    return Math.min((stageSize.width - 32) / logicalSize, (stageSize.height - 32) / logicalSize)
  }, [stageSize.height, stageSize.width])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || blocked) return
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [blocked])

  useEffect(() => {
    if (blocked) return
    const resolver = createProjectAssetUrlResolver(project)
    const source = resolver(project.id, project.assets.byId[project.panorama.assetId].sourcePath)
    const image = new Image()
    image.onload = () =>
      setImageSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.src = source
  }, [blocked, project])

  useEffect(() => {
    const host = hostRef.current
    if (blocked || !host) return
    const resolver = createProjectAssetUrlResolver(project)
    const { manifest: localizedManifest } = compileCatalog(project, resolver)
    const manifest = resolveCatalogManifest(localizedManifest, locale)
    const initialSelection: Partial<CatalogSceneSelection> = {
      stageKey: selectedStage,
      ...(selection?.kind === 'item' ? { itemId: selection.id } : {}),
      ...(selection?.kind === 'category' ? { categoryId: selection.id } : {}),
    }
    const scene = new CatalogScene({
      root: host,
      manifest,
      panoramaUrl: resolver(project.id, project.assets.byId[project.panorama.assetId].sourcePath),
      imageSize,
      initialSelection,
      onSelectionChange: next => {
        callbacksRef.current.onSelectStage(next.stageKey)
        callbacksRef.current.onSelect(
          next.itemId
            ? { kind: 'item', id: next.itemId }
            : next.categoryId
              ? { kind: 'category', id: next.categoryId }
              : null,
        )
      },
      onAtlasLaunch: url => window.open(url, '_blank', 'noopener,noreferrer'),
      ...(mode === 'editor'
        ? {
            editor: {
              onMarkerChange: (itemId, marker) =>
                callbacksRef.current.onPatchPanorama(panorama => ({
                  ...panorama,
                  items: {
                    ...panorama.items,
                    [itemId]: { ...panorama.items[itemId], marker },
                  },
                })),
              onFocusRectChange: (itemId, focusRect) =>
                callbacksRef.current.onPatchPanorama(panorama => ({
                  ...panorama,
                  items: {
                    ...panorama.items,
                    [itemId]: { ...panorama.items[itemId], focusRect },
                  },
                })),
              onViewportChange: (target, viewport) =>
                callbacksRef.current.onPatchPanorama(panorama => {
                  if (target.kind === 'category') {
                    return {
                      ...panorama,
                      categories: {
                        ...panorama.categories,
                        [target.categoryId]: {
                          ...panorama.categories[target.categoryId],
                          viewport,
                        },
                      },
                    }
                  }
                  return {
                    ...panorama,
                    items: {
                      ...panorama.items,
                      [target.itemId]: {
                        ...panorama.items[target.itemId],
                        viewportOverride: viewport,
                      },
                    },
                  }
                }),
            },
          }
        : {}),
    })
    sceneRef.current = scene
    scene.mount()
    return () => {
      if (sceneRef.current === scene) sceneRef.current = null
      scene.destroy()
    }
  }, [project, blocked, imageSize, mode, locale])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const current = scene.getSelection()
    if (selection?.kind === 'item') {
      if (current.itemId !== selection.id) scene.selectItem(selection.id)
      return
    }
    if (selection?.kind === 'category') {
      if (current.categoryId !== selection.id) scene.selectCategory(selection.id)
      return
    }
    if (current.stageKey !== selectedStage) scene.selectStage(selectedStage)
  }, [selectedStage, selection])

  if (blocked) {
    return (
      <div data-testid="catalog-editor-canvas-empty" style={emptyStyle()}>
        <Compass size={32} strokeWidth={1.2} />
        <strong>请先配置全景底图</strong>
        <span>在项目设置的资源面板上传并设为全景图后，才能编辑三级节点的位置与聚焦区域。</span>
      </div>
    )
  }

  return (
    <div
      ref={stageRef}
      data-testid="catalog-editor-canvas"
      style={{
        height: '100%',
        minHeight: 0,
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: logicalSize * scale,
          height: logicalSize * scale,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        <div
          ref={hostRef}
          style={{
            width: logicalSize,
            height: logicalSize,
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  )
}

function emptyStyle(): React.CSSProperties {
  return {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
    background: '#0f172a',
    color: '#cbd5e1',
    textAlign: 'center',
    fontSize: 13,
  }
}
