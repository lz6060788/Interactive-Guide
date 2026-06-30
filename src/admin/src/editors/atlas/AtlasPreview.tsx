/**
 * AtlasPreview — mounts the real AtlasRuntime so the editor WYSIWYG
 * matches what end users see. Not an iframe.
 */
import { useEffect, useRef } from 'react'
import { AtlasRuntime, type AtlasRuntimeAssetLoader } from '../../../../products/atlas/runtime/atlas-runtime'
import { compileAtlas } from '../../../../products/atlas/compiler/atlas-compiler'
import type { GuideProject } from '../../../../domain/project-types'

export function AtlasPreview({ project }: { project: GuideProject }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<AtlasRuntime | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
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
      const { manifest } = compileAtlas(project, (_id, sourcePath) => `./${sourcePath}`)
      rt.loadManifest(manifest)
      void rt.mount(hostRef.current)
    } catch (e) {
      hostRef.current.textContent = `Atlas preview unavailable: ${(e as Error).message}`
    }
    return () => {
      rt.destroy()
      runtimeRef.current = null
    }
  }, [project])

  return (
    <div style={{ background: '#1e293b', padding: 8, color: '#cbd5e1' }}>
      <h4 style={{ margin: '4px 0 8px' }}>实时预览</h4>
      <div
        ref={hostRef}
        data-testid="atlas-preview-host"
        style={{
          width: project.products.atlas.viewport.width,
          height: project.products.atlas.viewport.height,
          margin: '0 auto',
          background: '#0f172a',
          position: 'relative',
        }}
      />
    </div>
  )
}