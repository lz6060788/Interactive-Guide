import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { packageWorkbench } from '../../scripts/package-workbench.mjs'
import { resolveWorkbenchResourceRoot } from '../../src/server/services/browser-runtime-packager.js'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

test('browser runtime resources resolve from the module location instead of cwd', () => {
  assert.equal(resolveWorkbenchResourceRoot(), REPO_ROOT)
})

test('offline packager rejects recursive outputs and forbidden stale build entries', () => {
  assert.throws(
    () =>
      packageWorkbench({
        repoRoot: REPO_ROOT,
        outputDir: path.join(REPO_ROOT, 'src', 'config', 'package-output'),
      }),
    /output directory cannot be inside an input tree/,
  )

  const staleRoot = path.join(REPO_ROOT, 'dist', 'server', 'ai')
  fs.mkdirSync(staleRoot, { recursive: true })
  fs.writeFileSync(path.join(staleRoot, 'stale.js'), 'throw new Error("stale AI output")')
  try {
    assert.throws(
      () =>
        packageWorkbench({
          repoRoot: REPO_ROOT,
          outputDir: path.join(REPO_ROOT, 'tmp', 'forbidden-package-output'),
        }),
      /forbidden stale Workbench build entry/,
    )
  } finally {
    fs.rmSync(staleRoot, { recursive: true, force: true })
  }
})

test(
  'offline Workbench package runs handshake, start, and both product runtime builds',
  {
    timeout: 300_000,
  },
  async t => {
    const testTempRoot = path.join(REPO_ROOT, 'tmp')
    fs.mkdirSync(testTempRoot, { recursive: true })
    const temporary = fs.mkdtempSync(path.join(testTempRoot, 'guide-workbench-package-'))
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))

    const outputDir = path.join(temporary, 'packages')
    const result = packageWorkbench({ repoRoot: REPO_ROOT, outputDir })
    assert.match(
      path.basename(result.archivePath),
      /^interactive-guide-workbench-v.+-[0-9a-f]{12}\.zip$/,
    )
    assert.equal(hashFile(result.archivePath), result.archiveSha256)
    assert.ok(
      path.basename(result.archivePath).endsWith(`-${result.archiveSha256.slice(0, 12)}.zip`),
    )
    assert.equal(
      fs.readFileSync(result.checksumPath, 'utf8'),
      `${result.archiveSha256}  ${path.basename(result.archivePath)}\n`,
    )

    const zip = new AdmZip(result.archivePath)
    const names = zip.getEntries().map(entry => entry.entryName)
    assert.ok(names.length > 0)
    assert.ok(names.every(name => name.startsWith(`${result.packageRoot}/`)))
    assert.ok(names.every(name => !name.includes('\\') && !name.split('/').includes('..')))
    assert.ok(names.every(name => !name.includes('/dist/server/ai/')))
    assert.ok(names.every(name => !name.includes('/dist/server/routes/generates.')))
    assert.ok(names.every(name => !name.includes('/dist/server/services/prompt-builder.')))
    assert.equal(new Set(names.map(name => name.toLocaleLowerCase('en-US'))).size, names.length)
    assert.ok(zip.getEntries().every(entry => entry.header.timeval === 0x28210000))

    const extracted = path.join(temporary, 'extracted')
    zip.extractAllTo(extracted, false)
    const packageRoot = path.join(extracted, result.packageRoot)
    const manifestPath = path.join(packageRoot, 'workbench-manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      version: string
      compatibility: { platform: string; architecture: string; node: string }
      bundledDependencies: Array<{ name: string }>
      payload: { files: Array<{ path: string; size: number; sha256: string }> }
    }
    assert.equal(manifest.version, result.version)
    assert.equal(manifest.compatibility.platform, process.platform)
    assert.equal(manifest.compatibility.architecture, process.arch)
    for (const dependency of ['@babel/core', '@babel/preset-env', 'acorn', 'esbuild']) {
      assert.ok(
        manifest.bundledDependencies.some(item => item.name === dependency),
        dependency,
      )
    }
    const essentialPaths = [
      'bin/guide-workbench.mjs',
      'dist/admin/index.html',
      'dist/server/workbench-cli.js',
      'src/product-shell/browser/atlas-entry.ts',
      'src/product-shell/browser/catalog-entry.ts',
      'vendor/king-fisher/bridge-0.6.0.umd.js',
    ]
    for (const relativePath of essentialPaths) {
      const file = manifest.payload.files.find(item => item.path === relativePath)
      assert.ok(file, relativePath)
      const absolute = path.resolve(packageRoot, ...file.path.split('/'))
      assert.ok(absolute.startsWith(`${path.resolve(packageRoot)}${path.sep}`))
      assert.equal(fs.statSync(absolute).size, file.size)
      assert.equal(hashFile(absolute), file.sha256)
    }
    assert.equal(
      fs.readFileSync(path.join(packageRoot, 'workbench-manifest.json.sha256'), 'utf8'),
      `${hashFile(manifestPath)}  workbench-manifest.json\n`,
    )

    const callerDirectory = path.join(temporary, 'caller')
    fs.mkdirSync(callerDirectory)
    const cli = path.join(packageRoot, 'bin', 'guide-workbench.mjs')
    const handshake = JSON.parse(
      execFileSync(process.execPath, [cli, 'handshake', '--json'], {
        cwd: callerDirectory,
        encoding: 'utf8',
      }),
    ) as { ok: boolean; data: { workbenchVersion: string } }
    assert.equal(handshake.ok, true)
    assert.equal(handshake.data.workbenchVersion, result.version)

    const startResult = await startPortableWorkbench(cli, callerDirectory)
    try {
      assert.equal(startResult.message.ok, true)
      assert.equal(startResult.message.data.workspace, path.join(callerDirectory, 'workspace'))
      const health = (await fetch(`${startResult.message.data.apiUrl}/health`).then(response =>
        response.json(),
      )) as { status: string }
      assert.equal(health.status, 'ok')
    } finally {
      await stopChild(startResult.child)
    }

    const runtimePackagerUrl = pathToFileURL(
      path.join(packageRoot, 'dist', 'server', 'services', 'browser-runtime-packager.js'),
    ).href
    const runtimeResult = await runPortableRuntimeBuild(runtimePackagerUrl, callerDirectory)
    assert.ok(runtimeResult.atlas > 1_000)
    assert.ok(runtimeResult.catalog > 1_000)
  },
)

async function startPortableWorkbench(
  cli: string,
  cwd: string,
): Promise<{
  child: ReturnType<typeof spawn>
  message: { ok: boolean; data: { workspace: string; apiUrl: string } }
}> {
  const child = spawn(
    process.execPath,
    [cli, 'start', '--workspace', './workspace', '--port', 'auto', '--json'],
    { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  try {
    const line = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`start timed out: ${stderr}`)), 30_000)
      const inspect = () => {
        const newline = stdout.indexOf('\n')
        if (newline < 0) return
        clearTimeout(timeout)
        resolve(stdout.slice(0, newline))
      }
      child.stdout.on('data', inspect)
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', code => {
        clearTimeout(timeout)
        reject(new Error(`start exited early (${String(code)}): ${stderr || stdout}`))
      })
    })
    return {
      child,
      message: JSON.parse(line) as { ok: boolean; data: { workspace: string; apiUrl: string } },
    }
  } catch (error) {
    await stopChild(child)
    throw error
  }
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`failed to stop portable Workbench process ${String(child.pid)}`))
    }, 5_000)
    child.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  } else if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
  await closed
}

async function runPortableRuntimeBuild(
  runtimePackagerUrl: string,
  cwd: string,
): Promise<{ atlas: number; catalog: number }> {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const m = await import(${JSON.stringify(runtimePackagerUrl)}); const atlas = m.buildBrowserRuntimeBundle({ product: 'atlas' }); const catalog = m.buildBrowserRuntimeBundle({ product: 'catalog' }); process.stdout.write(JSON.stringify({ atlas: atlas.appJs.length, catalog: catalog.appJs.length }));`,
    ],
    {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`portable runtime build timed out: ${stderr}`)),
        60_000,
      )
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('exit', exitCode => {
        clearTimeout(timeout)
        resolve(exitCode)
      })
    })
    if (code !== 0) {
      throw new Error(`portable runtime build exited with ${String(code)}: ${stderr || stdout}`)
    }
    return JSON.parse(stdout) as { atlas: number; catalog: number }
  } finally {
    await stopChild(child)
  }
}

function hashFile(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
