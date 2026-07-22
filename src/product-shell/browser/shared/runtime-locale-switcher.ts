export interface RuntimeLocaleSwitcherOptions {
  root: HTMLElement
  locale: string
  supportedLocales: readonly string[]
  onChange: (locale: string) => void
}

export function mountRuntimeLocaleSwitcher(options: RuntimeLocaleSwitcherOptions): void {
  const locales = Array.from(new Set(options.supportedLocales))
  if (locales.length < 2) return

  const switcher = document.createElement('nav')
  switcher.dataset.testid = 'runtime-locale-switcher'
  switcher.setAttribute('aria-label', options.locale === 'zh-CN' ? '内容语言' : 'Content language')
  Object.assign(switcher.style, {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    zIndex: '12',
    display: 'flex',
    gap: '2px',
    padding: '3px',
    border: '1px solid rgba(255,255,255,.18)',
    borderRadius: '999px',
    background: 'rgba(5,7,10,.68)',
    boxShadow: '0 6px 18px rgba(0,0,0,.22)',
    backdropFilter: 'blur(10px)',
  })

  for (const locale of locales) {
    const button = document.createElement('button')
    const active = locale === options.locale
    button.type = 'button'
    button.dataset.locale = locale
    button.textContent = localeLabel(locale)
    button.setAttribute('aria-pressed', String(active))
    button.title = locale
    Object.assign(button.style, {
      minWidth: '30px',
      height: '24px',
      padding: '0 8px',
      border: '0',
      borderRadius: '999px',
      color: active ? '#090b0e' : 'rgba(255,255,255,.66)',
      background: active ? '#f4f4f5' : 'transparent',
      font: '600 11px/1 MiSans, PingFang SC, Microsoft YaHei, sans-serif',
      letterSpacing: '.02em',
      cursor: active ? 'default' : 'pointer',
    })
    if (!active) button.addEventListener('click', () => options.onChange(locale))
    switcher.appendChild(button)
  }

  options.root.appendChild(switcher)
}

function localeLabel(locale: string): string {
  if (locale === 'zh-CN') return '中'
  if (locale === 'en-US') return 'EN'
  return locale.split('-')[0]?.toUpperCase() ?? locale
}
