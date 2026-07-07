export type ProductShellProduct = 'atlas' | 'catalog'

export interface ProductShellFiles {
  'index.html': string
  'app.js': string
}

export function buildProductShell(
  product: ProductShellProduct,
  entryModulePath: string,
): ProductShellFiles {
  return {
    'index.html': buildShellIndexHtml(product),
    'app.js': buildShellAppJs(product, entryModulePath),
  }
}

function buildShellIndexHtml(product: ProductShellProduct): string {
  const title = product === 'atlas' ? 'Atlas Runtime' : 'Catalog Runtime'
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        min-height: 100%;
        background: #020617;
        font-family: "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #app {
        width: 100%;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`
}

function buildShellAppJs(product: ProductShellProduct, entryModulePath: string): string {
  const bootstrapExport = product === 'atlas' ? 'bootstrapAtlasProduct' : 'bootstrapCatalogProduct'
  return `import { ${bootstrapExport} } from '${escapeJs(entryModulePath)}'
const manifestUrl = new URL('./manifest.json', window.location.href).href
const app = document.getElementById('app')

if (!app) {
  throw new Error('runtime shell missing #app root')
}

Promise.resolve(${bootstrapExport}(app, manifestUrl)).catch((error) => {
    app.innerHTML = ''
    const pre = document.createElement('pre')
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.padding = '24px'
    pre.style.color = '#F8FAFC'
    pre.textContent = 'Runtime shell failed to load manifest:\\n' + (error instanceof Error ? error.message : String(error))
    app.appendChild(pre)
  })
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeJs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
}
