export type ProductShellProduct = 'atlas' | 'catalog'

export interface ProductShellFiles {
  'index.html': string
  'app.js': string
}

export function buildProductShell(
  projectTitle: string,
  appJs: string,
): ProductShellFiles {
  return {
    'index.html': buildShellIndexHtml(projectTitle),
    'app.js': appJs,
  }
}

function buildShellIndexHtml(projectTitle: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(projectTitle)}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #020617;
        font-family: "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body {
        position: relative;
      }
      #app {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="./app.js"></script>
  </body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
