import { useEffect, useRef } from 'react'
import type { PanoramaHtmlProduct } from '../../../shared/panorama-types'
import { PanoramaPlayerHost } from '../../../panorama-runtime/player-core/panorama-player-host'

interface PanoramaRuntimeHostViewProps {
  product: PanoramaHtmlProduct
}

export function PanoramaRuntimeHostView({ product }: PanoramaRuntimeHostViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<PanoramaPlayerHost | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const host = new PanoramaPlayerHost({ container })
    host.loadProduct(product)
    hostRef.current = host

    return () => {
      host.destroy()
      hostRef.current = null
    }
  }, [product])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />
}
