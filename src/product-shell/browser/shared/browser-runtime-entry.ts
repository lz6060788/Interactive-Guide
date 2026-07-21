export async function loadManifest<T>(manifestUrl: string): Promise<T> {
  const response = await fetch(manifestUrl)
  if (!response.ok) {
    throw new Error(`failed to load manifest from ${manifestUrl}`)
  }
  return response.json() as Promise<T>
}

export function renderFatal(app: HTMLElement, error: unknown): void {
  app.innerHTML = ''
  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.padding = '24px'
  pre.style.color = '#F8FAFC'
  pre.textContent = 'Runtime failed to start:\n' + (error instanceof Error ? error.message : String(error))
  app.appendChild(pre)
}
