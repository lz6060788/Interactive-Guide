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
import { assetBlobUrl } from '../../projects/api'

export function AtlasPreview({ project }: { project: GuideProject }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<AtlasRuntime | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const panoramaMissing = !project.panorama.assetId
  const panoramaAssetMissing =
    !panoramaMissing && !project.assets.byId[project.panorama.assetId]
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
    const projectId = project.id
    // Asset closure: the compiler asks for a URL per sourcePath. The
    // release build packages them as `./assets/...`, but in the editor
    // we serve them via the backend's `/api/projects/:id/assets/blob/:aid`
    // endpoint (proxied by Vite). Build a sourcePath → assetId lookup
    // table once per project change.
    const bySourcePath = new Map<string, string>()
    for (const asset of Object.values(project.assets.byId)) {
      bySourcePath.set(asset.sourcePath, asset.id)
    }
    const resolveSourcePath = (_id: string, sourcePath: string): string => {
      const aid = bySourcePath.get(sourcePath)
      return aid ? assetBlobUrl(projectId, aid) : `./${sourcePath}`
    }
    const loader: AtlasRuntimeAssetLoader = {
      resolveUrl: (u: string) => u,
      loadImage: async (url: string) => {
        const img = new Image()
        img.src = url
        await img.decode().catch(() => {})
        return img
      },
      openScene: () => {},
    }
    const rt = new AtlasRuntime({ assets: loader })
    runtimeRef.current = rt
    try {
      const { manifest } = compileAtlas(project, resolveSourcePath)
      rt.loadManifest(manifest)
      void rt.mount(hostRef.current)
    } catch (e) {
      if (hostRef.current) {
        hostRef.current.textContent = `Atlas preview unavailable: ${(e as Error).message}`
      }
    }
    return () => {
      rt.destroy()
      runtimeRef.current = null
    }
  }, [project, blocked])

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
          </div>
        </div>
      ) : null}
    </div>
  )
}
