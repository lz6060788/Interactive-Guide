import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export interface BrowserRuntimePackageResult {
  entryModulePath: string
}

export function writeBrowserRuntimePackage(options: {
  entrySourcePath: string
  outputDir: string
  sourceRoot?: string
}): BrowserRuntimePackageResult {
  const sourceRoot = options.sourceRoot ?? path.resolve('src')
  const visited = new Set<string>()
  const entrySourcePath = path.resolve(options.entrySourcePath)

  visit(entrySourcePath)

  const entryRelative = normalizePath(path.relative(sourceRoot, entrySourcePath))
    .replace(/\.tsx?$/, '.js')
  return {
    entryModulePath: `./runtime/${entryRelative}`,
  }

  function visit(sourceFilePath: string): void {
    const resolved = path.resolve(sourceFilePath)
    if (visited.has(resolved)) return
    visited.add(resolved)

    const sourceText = fs.readFileSync(resolved, 'utf8')
    const sourceFile = ts.createSourceFile(
      resolved,
      sourceText,
      ts.ScriptTarget.ES2022,
      true,
      resolved.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    for (const specifier of collectRelativeSpecifiers(sourceFile)) {
      const childPath = resolveRelativeSourceModule(resolved, specifier)
      if (childPath) visit(childPath)
    }

    const transpiled = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: resolved,
      reportDiagnostics: true,
    })

    if (transpiled.diagnostics?.length) {
      const messages = transpiled.diagnostics
        .map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, '\n'))
        .join('; ')
      throw new Error(`failed to transpile browser runtime module "${resolved}": ${messages}`)
    }

    const relativePath = normalizePath(path.relative(sourceRoot, resolved)).replace(/\.tsx?$/, '.js')
    const outPath = path.join(options.outputDir, 'runtime', relativePath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, transpiled.outputText)
  }
}

function collectRelativeSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = []
  for (const stmt of sourceFile.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text.startsWith('.')
    ) {
      specifiers.push(stmt.moduleSpecifier.text)
      continue
    }
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text.startsWith('.')
    ) {
      specifiers.push(stmt.moduleSpecifier.text)
    }
  }
  return specifiers
}

function resolveRelativeSourceModule(importerPath: string, specifier: string): string | null {
  const importerDir = path.dirname(importerPath)
  const rawPath = path.resolve(importerDir, specifier)
  const candidates = new Set<string>([
    rawPath,
    `${rawPath}.ts`,
    `${rawPath}.tsx`,
    rawPath.replace(/\.js$/i, '.ts'),
    rawPath.replace(/\.js$/i, '.tsx'),
    path.join(rawPath, 'index.ts'),
    path.join(rawPath, 'index.tsx'),
    path.join(rawPath.replace(/\.js$/i, ''), 'index.ts'),
    path.join(rawPath.replace(/\.js$/i, ''), 'index.tsx'),
  ])

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/')
}
