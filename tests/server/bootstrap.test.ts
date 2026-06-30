/**
 * Integration test for `assembleProject` (the bootstrap Skill core).
 *
 * Exercises the full input contract end-to-end without any HTTP layer.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { assembleProject, type BootstrapInput } from '../../src/server/bootstrap.js'

function tmpWorkdir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-bs-'))
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('assembleProject wires knowledge, panorama, and a scene bundle into a valid draft', () => {
  const { dir, cleanup } = tmpWorkdir()
  // Arrange: write a fake panorama and a fake scene zip
  const pano = path.join(dir, 'pano.jpg')
  fs.writeFileSync(pano, Buffer.from('jpeg-bytes'))
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<!doctype html>'))
  const scenePath = path.join(dir, 'scene.zip')
  fs.writeFileSync(scenePath, zip.toBuffer())

  const input: BootstrapInput = {
    project: { id: 'rocket', title: '商业航天' },
    knowledge: {
      stages: [
        {
          key: 'upstream',
          categories: [
            {
              title: '运载火箭',
              items: [{ title: '长征八号甲' }, { title: '谷神星一号' }],
              htmlScene: { sceneId: 'scene-rocket', viewId: 'v1' },
            },
          ],
        },
        { key: 'midstream', categories: [] },
        { key: 'downstream', categories: [] },
      ],
    },
    panoramaImagePath: pano,
    htmlSceneBundles: [
      {
        id: 'scene-rocket',
        title: '火箭三维',
        path: scenePath,
        views: [{ id: 'v1', title: '火箭', activationMessageType: 'init', categoryBindings: ['upstream-运载火箭'] }],
      },
    ],
  }

  const r = assembleProject(input)

  assert.equal(r.project.id, 'rocket')
  assert.equal(r.project.scenes.length, 1)
  assert.equal(r.project.scenes[0].id, 'scene-rocket')
  assert.equal(r.project.scenes[0].assetId, 'asset-scene-rocket')
  assert.equal(r.project.panorama.assetId, 'asset-panorama')
  // 2 items registered
  assert.equal(Object.keys(r.project.knowledge.items).length, 2)
  // 1 calibration queue entry per category (no hotspot); items are auto-normalized.
  assert.equal(r.calibrationQueue.length, 1)
  // report sums
  assert.equal(r.report.stages, 3)
  assert.equal(r.report.categories, 1)
  assert.equal(r.report.items, 2)
  assert.equal(r.report.scenes, 1)
  cleanup()
})

test('assembleProject records duplicate IDs as unmapped', () => {
  const { dir, cleanup } = tmpWorkdir()
  const pano = path.join(dir, 'pano.jpg')
  fs.writeFileSync(pano, Buffer.from('jpeg-bytes'))
  const input: BootstrapInput = {
    project: { id: 'p', title: 'P' },
    knowledge: {
      stages: [
        {
          key: 'upstream',
          categories: [
            { id: 'shared', title: 'A', items: [] },
            { id: 'shared', title: 'B', items: [] },
          ],
        },
        { key: 'midstream', categories: [] },
        { key: 'downstream', categories: [] },
      ],
    },
    panoramaImagePath: pano,
  }
  const r = assembleProject(input)
  assert.ok(r.unmappedKnowledge.some((u) => u.reason === 'duplicate id'))
  cleanup()
})

test('assembleProject without panorama still produces a draft', () => {
  const input: BootstrapInput = {
    project: { id: 'p', title: 'P' },
    knowledge: {
      stages: [
        { key: 'upstream', categories: [] },
        { key: 'midstream', categories: [] },
        { key: 'downstream', categories: [] },
      ],
    },
  }
  // Panorama is required by normalizeProject, so we expect a thrown error.
  // The bootstrap Skill never silently swallows this — operators must supply
  // a real panorama image for the build to proceed.
  assert.throws(() => assembleProject(input), /panorama\.assetId is required/)
})