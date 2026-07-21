import { apiFetch } from '../../lib/api-client'

export type ExportProduct = 'atlas' | 'catalog'

export interface ProductBuild {
  product: ExportProduct
  buildId: string
  sourceRevision: number
  entryUrl: string
  downloadUrl: string
}

export function buildProductPreview(
  projectId: string,
  product: ExportProduct,
): Promise<ProductBuild> {
  return apiFetch<ProductBuild>(`/projects/${encodeURIComponent(projectId)}/previews/${product}`, {
    method: 'POST',
  })
}
