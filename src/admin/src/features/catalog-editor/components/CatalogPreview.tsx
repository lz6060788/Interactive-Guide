/**
 * CatalogPreview — mounts the real CatalogRuntime so editor preview and
 * runtime share the same list / focus / scene-enter behavior.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass } from 'lucide-react'
import { compileCatalog } from '@products/catalog/compiler/catalog-compiler'
import { CatalogRuntime, type CatalogRuntimeAssetLoader } from '@products/catalog/runtime/catalog-runtime'
import type { GuideProject } from '@domain/project-types'
import { SceneHostController } from '../../../../../platform/scene-host/scene-host-controller'
import { SceneHostOverlay, type SceneHostOverlayState } from '../../../components/SceneHostOverlay'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'

export function CatalogPreview({ project }: { project: GuideProject }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const runtimeRef = useRef<CatalogRuntime | null>(null)
  const sceneHostRef = useRef<SceneHostController | null>(null)
  const sessionIdRef = useRef(`catalog-preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [activeScene, setActiveScene] = useState<SceneHostOverlayState | null>(null)
  const [sceneInfoOpen, setSceneInfoOpen] = useState(false)
  const panoramaMissing = !project.panorama.assetId
  const panoramaAssetMissing =
    !panoramaMissing && !project.assets.byId[project.panorama.assetId]
  const blocked = panoramaMissing || panoramaAssetMissing
  const viewport = project.products.catalog.viewport

  useEffect(() => {
    if (blocked) return
    const stage = stageRef.current
    if (!stage) return
    const update = () => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      })
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(() => update())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [blocked])

  const previewScale = useMemo(() => {
    if (!stageSize.width || !stageSize.height) return 1
    const horizontal = (stageSize.width - 8) / viewport.width
    const vertical = (stageSize.height - 8) / viewport.height
    return Math.min(1, horizontal, vertical)
  }, [stageSize.height, stageSize.width, viewport.height, viewport.width])

  useEffect(() => {
    if (blocked) return
    if (!hostRef.current) return
    const resolveSourcePath = createProjectAssetUrlResolver(project)
    const sceneHost = new SceneHostController({
      product: 'catalog',
      projectId: project.id,
      sessionId: sessionIdRef.current,
      baseHref: window.location.href,
      getIframeWindow: () => iframeRef.current?.contentWindow ?? null,
      onRequestBack: () => {
        setSceneInfoOpen(false)
        setActiveScene(null)
      },
      onRequestRoute: (routeId) => {
        runtimeRef.current?.openRoute(routeId)
      },
    })
    sceneHostRef.current = sceneHost
    const loader: CatalogRuntimeAssetLoader = {
      resolveUrl: (u: string) => u,
      loadImage: async (url: string) => {
        const img = new Image()
        img.src = url
        await img.decode().catch(() => {})
        return img
      },
      openScene: (scene, viewId) => {
        const nextScene = sceneHost.openScene(scene, viewId)
        setSceneInfoOpen(false)
        setActiveScene(nextScene)
      },
    }
    const rt = new CatalogRuntime({ assets: loader })
    runtimeRef.current = rt
    try {
      const { manifest } = compileCatalog(project, resolveSourcePath)
      rt.loadManifest(manifest)
      void rt.mount(hostRef.current)
    } catch (e) {
      if (hostRef.current) {
        hostRef.current.textContent = `Catalog preview unavailable: ${(e as Error).message}`
      }
    }
    return () => {
      sceneHost.closeScene()
      sceneHostRef.current = null
      rt.destroy()
      runtimeRef.current = null
    }
  }, [project, blocked])

  const closeActiveScene = () => {
    sceneHostRef.current?.closeScene()
    setSceneInfoOpen(false)
    setActiveScene(null)
  }

  const handleSceneShare = () => {
    const nav = globalThis.navigator
    if (!nav?.share) return
    void nav
      .share({
        title: project.title,
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!activeScene) return
    return sceneHostRef.current?.bindMessages(window)
  }, [activeScene])

  const handleSceneLoad = () => {
    sceneHostRef.current?.handleSceneLoad()
  }

  return (
    <div
      style={{
        background: '#0f172a',
        padding: 8,
        color: '#cbd5e1',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <h4 style={{ margin: '4px 0 8px', fontSize: 12, color: '#cbd5e1' }}>
        实时预览
      </h4>
      {blocked ? (
        <div
          data-testid="catalog-preview-placeholder"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#94a3b8',
            fontSize: 12,
            textAlign: 'center',
            padding: 24,
          }}
        >
          <Compass size={28} strokeWidth={1} style={{ opacity: 0.4 }} />
          <div style={{ color: '#cbd5e1', fontWeight: 500 }}>
            {panoramaMissing ? '尚未绑定全景底图' : '全景底图无效'}
          </div>
          <div style={{ maxWidth: 240, lineHeight: 1.5 }}>
            到「项目设置 → 资源」上传一张图片后点「设为底图」。
          </div>
        </div>
      ) : null}
      {!blocked ? (
        <div
          ref={stageRef}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: viewport.width * previewScale,
              height: viewport.height * previewScale,
              position: 'relative',
              flex: '0 0 auto',
            }}
          >
            <div
              ref={hostRef}
              data-testid="catalog-preview-host"
              style={{
                width: viewport.width,
                height: viewport.height,
                background: '#0f172a',
                position: 'absolute',
                left: 0,
                top: 0,
                overflow: 'hidden',
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
            />
            {activeScene ? (
              <SceneHostOverlay
                projectTitle={project.title}
                activeScene={activeScene}
                infoOpen={sceneInfoOpen}
                onClose={closeActiveScene}
                onShare={handleSceneShare}
                onOpenInfo={() => setSceneInfoOpen(true)}
                onCloseInfo={() => setSceneInfoOpen(false)}
              >
                <iframe
                  ref={iframeRef}
                  title={activeScene.sceneTitle}
                  src={activeScene.src}
                  onLoad={handleSceneLoad}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: '0',
                    background: '#020617',
                  }}
                />
              </SceneHostOverlay>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
