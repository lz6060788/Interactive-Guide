export function createShellFrame(
  app: HTMLElement,
  viewport: { width: number; height: number },
): { shell: HTMLElement; runtimeMount: HTMLElement } {
  app.innerHTML = ''

  const shell = document.createElement('div')
  shell.dataset.testid = 'product-shell-frame'
  shell.style.position = 'relative'
  shell.style.width = `${viewport.width}px`
  shell.style.height = `${viewport.height}px`
  shell.style.margin = '24px auto'
  shell.style.overflow = 'hidden'
  shell.style.background = '#020617'
  shell.style.borderRadius = '12px'
  shell.style.boxShadow = '0 24px 80px rgba(0, 0, 0, 0.4)'

  const runtimeMount = document.createElement('div')
  runtimeMount.dataset.testid = 'product-runtime-mount'
  runtimeMount.style.position = 'absolute'
  runtimeMount.style.inset = '0'
  shell.appendChild(runtimeMount)

  app.appendChild(shell)

  return { shell, runtimeMount }
}

