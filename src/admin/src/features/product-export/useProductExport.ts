import { useCallback, useEffect, useState } from 'react'
import type { GuideProject } from '@domain/project-types'
import { ApiError } from '../../lib/api-client'
import {
  buildProductPreview,
  type ExportProduct,
  type ProductBuild,
} from './api'

export type ProductExportOperation = 'preview' | 'download' | null

export function useProductExport(options: {
  projectId: string
  product: ExportProduct
  currentRevision: number
  isDirty: boolean
  save: () => Promise<GuideProject>
}): {
  operation: ProductExportOperation
  error: string | null
  latestBuild: ProductBuild | null
  generatePreview: () => Promise<void>
  downloadZip: () => Promise<void>
} {
  const [operation, setOperation] = useState<ProductExportOperation>(null)
  const [error, setError] = useState<string | null>(null)
  const [latestBuild, setLatestBuild] = useState<ProductBuild | null>(null)

  useEffect(() => {
    setOperation(null)
    setError(null)
    setLatestBuild(null)
  }, [options.projectId, options.product])

  const buildAfterSave = useCallback(async (): Promise<ProductBuild> => {
    await options.save()
    const build = await buildProductPreview(options.projectId, options.product)
    setLatestBuild(build)
    return build
  }, [options])

  const generatePreview = useCallback(async () => {
    if (operation) return
    const previewWindow = window.open('about:blank', '_blank')
    setOperation('preview')
    setError(null)
    try {
      const build = await buildAfterSave()
      if (previewWindow) {
        previewWindow.location.replace(build.entryUrl)
      } else {
        setError(`预览已生成，但浏览器阻止了新窗口。请打开：${build.entryUrl}`)
      }
    } catch (cause) {
      previewWindow?.close()
      setError(formatExportError('生成预览失败', cause))
    } finally {
      setOperation(null)
    }
  }, [buildAfterSave, operation])

  const downloadZip = useCallback(async () => {
    if (operation) return
    setOperation('download')
    setError(null)
    try {
      const canReuse =
        !options.isDirty &&
        latestBuild !== null &&
        latestBuild.sourceRevision === options.currentRevision
      const build = canReuse ? latestBuild : await buildAfterSave()
      triggerDownload(build.downloadUrl)
    } catch (cause) {
      setError(formatExportError('下载 ZIP 失败', cause))
    } finally {
      setOperation(null)
    }
  }, [buildAfterSave, latestBuild, operation, options.currentRevision, options.isDirty])

  return { operation, error, latestBuild, generatePreview, downloadZip }
}

function triggerDownload(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function formatExportError(prefix: string, cause: unknown): string {
  if (cause instanceof ApiError) return `${prefix}：${cause.status} ${cause.code}`
  return `${prefix}：${cause instanceof Error ? cause.message : String(cause)}`
}
