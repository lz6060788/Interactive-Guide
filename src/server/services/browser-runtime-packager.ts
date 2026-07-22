import fs from 'node:fs'
import path from 'node:path'
import { transformSync } from '@babel/core'
import presetEnv from '@babel/preset-env'
import { parse } from 'acorn'
import { buildSync } from 'esbuild'
import type { ProductShellProduct } from './product-shell.js'

export interface BrowserRuntimeBundleResult {
  appJs: string
}

/**
 * Bundle a product runtime into one browser IIFE and then lower every
 * JavaScript syntax feature to ECMAScript 5. Browser API polyfills are
 * intentionally outside this component's contract.
 */
export function buildBrowserRuntimeBundle(options: {
  product: ProductShellProduct
  entrySourcePath?: string
}): BrowserRuntimeBundleResult {
  const entrySourcePath = path.resolve(
    options.entrySourcePath ??
      path.join(
        path.resolve('src'),
        'product-shell',
        'browser',
        PRODUCT_RUNTIME[options.product].entry,
      ),
  )
  const bootstrapExport = PRODUCT_RUNTIME[options.product].bootstrap
  const bootstrapSource = buildBootstrapSource(
    entrySourcePath,
    bootstrapExport,
    loadKingFisherVendorScripts(),
  )

  const bundle = buildSync({
    stdin: {
      contents: bootstrapSource,
      loader: 'ts',
      resolveDir: path.dirname(entrySourcePath),
      sourcefile: `${options.product}-runtime-bootstrap.ts`,
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2017',
    charset: 'utf8',
    logLevel: 'silent',
  }).outputFiles[0]?.text

  if (!bundle) {
    throw new Error(`failed to bundle ${options.product} browser runtime`)
  }

  const transformed = transformSync(bundle, {
    babelrc: false,
    configFile: false,
    comments: false,
    compact: false,
    sourceType: 'script',
    presets: [
      [
        presetEnv,
        {
          // IE 11 is used only as a deterministic "ES5 syntax" transform
          // target. The supported runtime remains iOS 13 and no polyfills are
          // injected.
          targets: { ie: '11' },
          modules: false,
          useBuiltIns: false,
          bugfixes: false,
        },
      ],
    ],
  })
  const appJs = transformed?.code
  if (!appJs) {
    throw new Error(`failed to transpile ${options.product} browser runtime to ES5`)
  }

  assertEs5Syntax(appJs, options.product)
  return { appJs: `${appJs}\n` }
}

const PRODUCT_RUNTIME: Record<ProductShellProduct, { entry: string; bootstrap: string }> = {
  atlas: { entry: 'atlas-entry.ts', bootstrap: 'bootstrapAtlasProduct' },
  catalog: { entry: 'catalog-entry.ts', bootstrap: 'bootstrapCatalogProduct' },
  gallery: { entry: 'gallery-entry.ts', bootstrap: 'bootstrapGalleryProduct' },
}

export function assertEs5Syntax(source: string, label = 'browser runtime'): void {
  try {
    parse(source, {
      ecmaVersion: 5,
      sourceType: 'script',
      allowReserved: true,
    })
  } catch (error) {
    const detail = error as Error & { loc?: { line: number; column: number } }
    const location = detail.loc ? ` at ${detail.loc.line}:${detail.loc.column}` : ''
    throw new Error(`${label} contains non-ES5 JavaScript syntax${location}: ${detail.message}`)
  }
}

function buildBootstrapSource(
  entrySourcePath: string,
  bootstrapExport: string,
  kingFisherScripts: { bridge: string; falcon: string },
): string {
  const entrySpecifier = normalizePath(entrySourcePath)
  return `
import { ${bootstrapExport} } from ${JSON.stringify(entrySpecifier)}

window.__interactiveGuideKingFisherScripts = ${JSON.stringify(kingFisherScripts)}

var app = document.getElementById('app')
if (!app) {
  throw new Error('runtime shell missing #app root')
}

var manifestUrl = new URL('./manifest.json', window.location.href).href
Promise.resolve(${bootstrapExport}(app, manifestUrl)).catch(function (error) {
  app.innerHTML = ''
  var pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.padding = '24px'
  pre.style.color = '#F8FAFC'
  pre.textContent = 'Runtime shell failed to load manifest:\\n' +
    (error instanceof Error ? error.message : String(error))
  app.appendChild(pre)
})
`
}

function loadKingFisherVendorScripts(): { bridge: string; falcon: string } {
  const vendorRoot = path.resolve('vendor', 'king-fisher')
  return {
    bridge: fs.readFileSync(path.join(vendorRoot, 'bridge-0.6.0.umd.js'), 'utf8'),
    falcon: fs.readFileSync(path.join(vendorRoot, 'falcon-0.5.26-zcp-692-snapshot.umd.js'), 'utf8'),
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/')
}
