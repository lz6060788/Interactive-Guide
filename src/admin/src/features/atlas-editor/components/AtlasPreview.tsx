/**
 * AtlasPreview — mounts the real AtlasRuntime so the editor WYSIWYG
 * matches what end users see. Not an iframe.
 *
 * Falls back to a placeholder when the project can't be compiled yet
 * (typically: panorama.assetId is empty or references a missing asset).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass } from 'lucide-react'
import { AtlasRuntime, type AtlasRuntimeAssetLoader } from '@products/atlas/runtime/atlas-runtime'
import { compileAtlas } from '@products/atlas/compiler/atlas-compiler'
import type { GuideProject } from '@domain/project-types'
import { SceneHostController } from '../../../../../platform/scene-host/scene-host-controller'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'
import { SceneHostOverlay, type SceneHostOverlayState } from '../../../components/SceneHostOverlay'
import { resolveAtlasManifest } from '@products/contracts/manifest-localization'
import { localized } from '../../projects/localization'

export function AtlasPreview({
  project,
  locale,
}: {
  project: GuideProject
  locale: string
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const runtimeRef = useRef<AtlasRuntime | null>(null)
  const sceneHostRef = useRef<SceneHostController | null>(null)
  const sessionIdRef = useRef(
    `atlas-preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  )
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [activeScene, setActiveScene] = useState<SceneHostOverlayState | null>(null)
  const [sceneInfoOpen, setSceneInfoOpen] = useState(false)
  const panoramaMissing = !project.panorama.assetId
  const panoramaAssetMissing = !panoramaMissing && !project.assets.byId[project.panorama.assetId]
  const blocked = panoramaMissing || panoramaAssetMissing
  const viewport = project.products.atlas.viewport

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
      product: 'atlas',
      projectId: project.id,
      sessionId: sessionIdRef.current,
      locale,
      supportedLocales: project.localization.supportedLocales,
      baseHref: window.location.href,
      getIframeWindow: () => iframeRef.current?.contentWindow ?? null,
      onRequestBack: () => {
        runtimeRef.current?.dismissTransientExperience()
        setSceneInfoOpen(false)
        setActiveScene(null)
      },
      onRequestRoute: routeId => {
        runtimeRef.current?.openRoute(routeId)
      },
    })
    sceneHostRef.current = sceneHost
    const loader: AtlasRuntimeAssetLoader = {
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
        setActiveScene({ ...nextScene })
      },
    }
    const rt = new AtlasRuntime({ assets: loader })
    runtimeRef.current = rt
    try {
      const { manifest } = compileAtlas(project, resolveSourcePath)
      rt.loadManifest(resolveAtlasManifest(manifest, locale))
      void rt.mount(hostRef.current)
    } catch (e) {
      if (hostRef.current) {
        hostRef.current.textContent = `Atlas preview unavailable: ${(e as Error).message}`
      }
    }
    return () => {
      sceneHost.closeScene()
      sceneHostRef.current = null
      rt.destroy()
      runtimeRef.current = null
    }
  }, [project, blocked, locale])

  const closeActiveScene = () => {
    sceneHostRef.current?.closeScene()
    runtimeRef.current?.dismissTransientExperience()
    setSceneInfoOpen(false)
    setActiveScene(null)
  }

  const handleSceneShare = () => {
    const nav = globalThis.navigator
    if (!nav?.share) return
    void nav
      .share({
        title: localized(project.title, locale),
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
      <h4 style={{ margin: '4px 0 8px', fontSize: 12, color: '#cbd5e1' }}>实时预览</h4>
      {blocked ? (
        <div
          data-testid="atlas-preview-placeholder"
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
              data-testid="atlas-preview-host"
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
              <div
                style={{
                  width: viewport.width,
                  height: viewport.height,
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  overflow: 'hidden',
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <SceneHostOverlay
                  projectTitle={localized(project.title, locale)}
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
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
