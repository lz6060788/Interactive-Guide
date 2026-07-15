export function createShellFrame(
  app: HTMLElement,
): { shell: HTMLElement; runtimeMount: HTMLElement } {
  app.innerHTML = ''
  app.style.width = '100%'
  app.style.height = '100%'
  app.style.overflow = 'hidden'

  const shell = document.createElement('div')
  shell.dataset.testid = 'product-shell-frame'
  shell.style.position = 'relative'
  shell.style.width = '100%'
  shell.style.height = '100%'
  shell.style.overflow = 'hidden'
  shell.style.background = '#020617'

  const runtimeMount = document.createElement('div')
  runtimeMount.dataset.testid = 'product-runtime-mount'
  runtimeMount.style.position = 'absolute'
  runtimeMount.style.inset = '0'
  runtimeMount.style.width = '100%'
  runtimeMount.style.height = '100%'
  shell.appendChild(runtimeMount)

  app.appendChild(shell)

  return { shell, runtimeMount }
}
