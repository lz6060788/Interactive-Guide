// API client for Interactive Guide backend

const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  // Backend wraps responses in { data: ... }
  return json.data !== undefined ? json.data : json
}

// Guides
export const fetchGuides = () => request<any[]>('/guides')
export const fetchGuide = (id: string) => request<any>(`/guides/${id}`)
export const importGuide = (data: any) =>
  request('/guides/import', { method: 'POST', body: JSON.stringify(data) })
export const updateGuide = (id: string, data: any) =>
  request(`/guides/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteGuide = (id: string) =>
  request(`/guides/${id}`, { method: 'DELETE' })
export const copyGuide = (id: string) =>
  request<any>(`/guides/${id}/copy`, { method: 'POST' })
export const createGuide = (data: any) =>
  request('/guides/import', { method: 'POST', body: JSON.stringify(data) })

// Nodes
export const createNode = (guideId: string, data: { parentId: string; nodeData: any }) =>
  request(`/guides/${guideId}/nodes`, { method: 'POST', body: JSON.stringify(data) })
export const updateNode = (guideId: string, nodeId: string, data: any) =>
  request(`/guides/${guideId}/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteNode = (guideId: string, nodeId: string) =>
  request(`/guides/${guideId}/nodes/${nodeId}`, { method: 'DELETE' })
export const updateHotspots = (guideId: string, nodeId: string, data: any) =>
  request(`/guides/${guideId}/nodes/${nodeId}/hotspots`, { method: 'PUT', body: JSON.stringify(data) })
export const regenerateNode = (guideId: string, nodeId: string) =>
  request(`/guides/${guideId}/nodes/${nodeId}/regenerate`, { method: 'POST' })
export const regenerateHotspots = (guideId: string, nodeId: string) =>
  request<any[]>(`/guides/${guideId}/nodes/${nodeId}/hotspots/regenerate`, { method: 'POST' })

// Edges
export const updateEdge = (guideId: string, edgeId: string, data: any) =>
  request(`/guides/${guideId}/edges/${edgeId}`, { method: 'PUT', body: JSON.stringify(data) })
export const regenerateEdge = (guideId: string, edgeId: string) =>
  request<{ ok: boolean; buildId?: string; edgeId: string }>(
    `/guides/${guideId}/edges/${edgeId}/regenerate`,
    { method: 'POST' },
  )

// Generate (includes publish as final stage)
export const startGenerate = (guideId: string) =>
  request(`/guides/${guideId}/generate`, { method: 'POST' })
export const fetchGenerate = (generateId: string) => request<any>(`/generates/${generateId}`)
export const fetchGenerates = () => request<any[]>('/generates')
export const cancelGenerate = (generateId: string) =>
  request(`/generates/${generateId}/cancel`, { method: 'POST' })
export const fetchGenerateLogs = (generateId: string) =>
  request<string[]>(`/generates/${generateId}/logs`)

// Upload
export const uploadNodeImage = async (guideId: string, nodeId: string, file: File): Promise<{ imageUrl: string }> => {
  const res = await fetch(`${BASE_URL}/guides/${guideId}/nodes/${nodeId}/upload-image`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: await file.arrayBuffer(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

export const uploadNodeHtml = async (guideId: string, nodeId: string, file: File): Promise<{ htmlUrl: string }> => {
  const res = await fetch(`${BASE_URL}/guides/${guideId}/nodes/${nodeId}/upload-html`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'text/html' },
    body: await file.arrayBuffer(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

export const uploadEdgeVideo = async (guideId: string, edgeId: string, file: File): Promise<{ videoUrl: string }> => {
  const res = await fetch(`${BASE_URL}/guides/${guideId}/edges/${edgeId}/upload-video`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'video/mp4' },
    body: await file.arrayBuffer(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

// Manifest
export const fetchManifest = (guideId: string) => {
  // If ?t= is passed in guideId, pass it correctly to backend via query string
  if (guideId.includes('?')) {
    const [id, query] = guideId.split('?')
    return request<any>(`/guides/${id}/manifest?${query}`)
  }
  return request<any>(`/guides/${guideId}/manifest`)
}
export const packageGuide = (guideId: string) =>
  request<any>(`/guides/${guideId}/package`, { method: 'POST' })

// Legacy aliases (for backward compatibility during migration)
export const fetchPackages = fetchGuides
export const fetchPackage = fetchGuide
export const importPackage = importGuide
export const updatePackage = updateGuide
export const deletePackage = deleteGuide
export const startBuild = startGenerate
export const fetchBuild = fetchGenerate
export const publishPackage = startGenerate
