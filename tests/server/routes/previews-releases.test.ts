import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { parse } from 'acorn'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ReleaseRepository } from '../../../src/server/storage/release-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'
import { createAssetsRouter } from '../../../src/server/routes/assets.js'
import { createPreviewsRouter } from '../../../src/server/routes/previews.js'
import { createReleasesRouter } from '../../../src/server/routes/releases.js'

function bootApp(): { app: express.Express; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-preview-release-routes-'))
  const projectRepo = new ProjectRepository({ dataDir: dir })
  const assetRepo = new AssetRepository(projectRepo, { dataDir: dir })
  const releaseRepo = new ReleaseRepository({ dataDir: dir })
  const projectService = new ProjectService(projectRepo)
  const assetService = new AssetService(projectRepo, assetRepo)
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use('/api', createProjectsRouter(projectService))
  app.use('/api', createAssetsRouter(projectService, assetService))
  app.use('/api', createPreviewsRouter(projectRepo, { dataDir: dir }))
  app.use('/api', createReleasesRouter(projectRepo, releaseRepo))
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message, code: 'INTERNAL' })
    },
  )
  return { app, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

async function createMinimalProject(
  app: express.Express,
  options: { includeEnglishTitle?: boolean } = {},
): Promise<void> {
  const create = await request(app).post('/api/projects').send({ id: 'p1', title: 'T' })
  const rev1 = create.body.data.metadata.revision
  await request(app)
    .post(`/api/projects/p1/assets/image?id=asset-pano&expectedRevision=${rev1}`)
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))

  const get1 = await request(app).get('/api/projects/p1')
  const rev2 = get1.body.data.metadata.revision
  const panorama = await request(app)
    .put('/api/projects/p1/panorama')
    .set('x-expected-revision', String(rev2))
    .send({
      assetId: 'asset-pano',
      coordinateSpace: 'normalized',
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      cameraBounds: { minZoom: 1, maxZoom: 4 },
      categories: {},
      items: {},
    })
  assert.equal(panorama.status, 200, JSON.stringify(panorama.body))

  if (options.includeEnglishTitle !== false) {
    const english = await request(app).patch('/api/projects/p1/metadata').send({
      title: 'T',
      titleLocale: 'en-US',
      expectedRevision: panorama.body.data.metadata.revision,
    })
    assert.equal(english.status, 200, JSON.stringify(english.body))
  }
}

test('POST /projects/:id/previews/:product returns a static preview entry that can be fetched', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const preview = await request(app).post('/api/projects/p1/previews/atlas')
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.equal(preview.body.data.product, 'atlas')
  assert.equal(typeof preview.body.data.sourceRevision, 'number')
  assert.match(
    preview.body.data.entryUrl,
    /\/api\/projects\/p1\/previews\/atlas\/builds\/.+\/index\.html$/,
  )
  assert.match(preview.body.data.downloadUrl, /\/download\.zip$/)

  const html = await request(app).get(preview.body.data.entryUrl)
  assert.equal(html.status, 200)
  assert.match(String(html.text), /<script src="\.\/app\.js"><\/script>/)
  assert.doesNotMatch(String(html.text), /type="module"/)

  const appJsUrl = preview.body.data.entryUrl.replace(/index\.html$/, 'app.js')
  const appJs = await request(app).get(appJsUrl)
  assert.equal(appJs.status, 200)
  assert.match(String(appJs.text), /manifest\.json/)
  assert.doesNotThrow(() => parse(String(appJs.text), { ecmaVersion: 5, sourceType: 'script' }))
  assert.doesNotMatch(String(appJs.text), /\b(?:import|export)\s/)

  const runtimeModule = await request(app).get(
    preview.body.data.entryUrl.replace(/index\.html$/, 'runtime/atlas-entry.js'),
  )
  assert.equal(runtimeModule.status, 404)

  const download = await request(app)
    .get(preview.body.data.downloadUrl)
    .buffer(true)
    .parse(bufferParser)
  assert.equal(download.status, 200)
  assert.match(String(download.headers['content-disposition']), /p1-atlas-0\.1\.0\.zip/)
  const zip = new AdmZip(download.body as Buffer)
  const entries = zip
    .getEntries()
    .filter(entry => !entry.isDirectory)
    .map(entry => entry.entryName)
  assert.ok(entries.includes('index.html'))
  assert.ok(entries.includes('app.js'))
  assert.ok(entries.includes('manifest.json'))
  assert.ok(entries.some(entry => entry.startsWith('assets/images/')))
  cleanup()
})

test('POST /projects/:id/releases creates a release whose files can be fetched statically', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const release = await request(app).post('/api/projects/p1/releases')
  assert.equal(release.status, 200)

  for (const product of ['atlas', 'catalog'] as const) {
    const html = await request(app).get(
      `/api/projects/p1/releases/0.1.0/files/${product}/index.html`,
    )
    assert.equal(html.status, 200)
    assert.match(String(html.text), /<script src="\.\/app\.js"><\/script>/)
    assert.doesNotMatch(String(html.text), /type="module"/)

    const appJs = await request(app).get(`/api/projects/p1/releases/0.1.0/files/${product}/app.js`)
    assert.equal(appJs.status, 200)
    assert.match(String(appJs.text), /manifest\.json/)
    assert.doesNotThrow(() => parse(String(appJs.text), { ecmaVersion: 5, sourceType: 'script' }))
    assert.doesNotMatch(String(appJs.text), /\b(?:import|export)\s/)

    const runtimeModule = await request(app).get(
      `/api/projects/p1/releases/0.1.0/files/${product}/runtime/${product}-entry.js`,
    )
    assert.equal(runtimeModule.status, 404)
  }
  cleanup()
})

test('POST /projects/:id/releases rejects a release-incomplete draft before writing files', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app, { includeEnglishTitle: false })

  const release = await request(app).post('/api/projects/p1/releases')

  assert.equal(release.status, 400)
  assert.equal(release.body.code, 'VALIDATION_FAILED')
  assert.ok(
    release.body.issues.some((issue: { code: string }) => issue.code === 'TRANSLATION_MISSING'),
  )
  assert.equal(fs.existsSync(path.join(dir, 'releases', 'p1', '0.1.0')), false)
  cleanup()
})

test('POST /projects/:id/releases keeps versions immutable', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app)
  const first = await request(app).post('/api/projects/p1/releases')
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const manifestPath = path.join(dir, 'releases', 'p1', '0.1.0', 'release.json')
  const before = fs.readFileSync(manifestPath)

  const duplicate = await request(app).post('/api/projects/p1/releases')

  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.code, 'RELEASE_EXISTS')
  assert.deepEqual(fs.readFileSync(manifestPath), before)
  cleanup()
})

function bufferParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = []
  response.on('data', chunk => chunks.push(Buffer.from(chunk)))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
  response.on('error', callback)
}

test('preview and release file routes reject path traversal', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  await request(app).post('/api/projects/p1/releases')

  const preview = await request(app).get(
    '/api/projects/p1/previews/atlas/builds/build-x/../../secret.txt',
  )
  assert.equal(preview.status, 404)

  const release = await request(app).get('/api/projects/p1/releases/0.1.0/files/../../secret.txt')
  assert.equal(release.status, 404)
  cleanup()
})
