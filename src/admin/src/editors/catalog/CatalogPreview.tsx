/**
 * CatalogPreview — real-time preview of the CatalogRuntime. Mounts
 * the runtime against a div in the editor (no iframe), so changes to
 * categories/items are reflected immediately.
 */
import { useEffect, useRef } from 'react'
import type { GuideProject } from '../../../../domain/project-types'
import { CatalogRuntime } from '../../../../products/catalog/runtime/catalog-runtime'
import { compileCatalog } from '../../../../products/catalog/compiler/catalog-compiler'

export interface CatalogPreviewProps {
  project: GuideProject
}

export function CatalogPreview({ project }: CatalogPreviewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<CatalogRuntime | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const runtime = new CatalogRuntime({
      assets: {
        resolveUrl: (u: string) => u,
        loadImage: async (url: string) => {
          const img = new Image()
          img.src = url
          await img.decode().catch(() => undefined)
          return img
        },
        openScene: () => {
          /* preview does not open scenes */
        },
      },
      listeners: [
        (event) => {
          if (event.type.startsWith('analytics:')) {
            // eslint-disable-next-line no-console
            console.debug('[catalog-preview]', event)
          }
        },
      ],
    })
    const { manifest } = compileCatalog(project, (_id, sourcePath) => `./${sourcePath}`)
    runtime.loadManifest(manifest)
    runtimeRef.current = runtime
    void runtime.mount(containerRef.current).catch((err: Error) => {
      // eslint-disable-next-line no-console
      console.error('[catalog-preview] mount failed', err)
    })
    return () => {
      runtime.destroy()
      runtimeRef.current = null
    }
  }, [project])

  return (
    <div
      ref={containerRef}
      data-testid="catalog-preview"
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        overflow: 'hidden',
      }}
    />
  )
}