/**
 * AssetClosure tests — verify URL rewriting and asset filtering.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAssetClosure,
  computeProjectReleaseAssetIds,
  computeReferencedAssetIds,
} from '../../../src/server/services/asset-closure.js'
import type { AssetDefinition } from '../../../src/domain/project-types.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'

const assets: Record<string, AssetDefinition> = {
  pano: {
    id: 'pano',
    kind: 'image',
    sourcePath: 'images/pano/image.jpg',
  },
  scene: {
    id: 'scene',
    kind: 'html-bundle',
    sourcePath: 'scenes/s1/index.html',
  },
  video: {
    id: 'video',
    kind: 'video',
    sourcePath: 'videos/transition.mp4',
  },
  unused: {
    id: 'unused',
    kind: 'image',
    sourcePath: 'images/unused.jpg',
  },
}

test('computeReferencedAssetIds includes panorama + scenes + transitions', () => {
  const ids = computeReferencedAssetIds('pano', new Set(['scene']), ['video'])
  assert.ok(ids.has('pano'))
  assert.ok(ids.has('scene'))
  assert.ok(ids.has('video'))
})

test('buildAssetClosure rewrites URLs to package-relative', () => {
  const { closure } = buildAssetClosure({
    projectId: 'p1',
    assets,
    referencedAssetIds: new Set(['pano']),
    urlPrefix: './assets',
  })
  assert.equal(closure('p1', 'images/pano/image.jpg'), './assets/images/pano/image.jpg')
})

test('buildAssetClosure returns only referenced assets sorted by id', () => {
  const { assets: result } = buildAssetClosure({
    projectId: 'p1',
    assets,
    referencedAssetIds: new Set(['video', 'pano']),
  })
  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'pano')
  assert.equal(result[1].id, 'video')
})

test('buildAssetClosure strips leading slashes from sourcePath', () => {
  const { closure } = buildAssetClosure({
    projectId: 'p1',
    assets,
    referencedAssetIds: new Set(['pano']),
    urlPrefix: './assets',
  })
  assert.equal(closure('p1', '/images/pano/image.jpg'), './assets/images/pano/image.jpg')
})

test('computeProjectReleaseAssetIds includes scene transitions and poster assets by scene id', () => {
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'pano'
  project.scenes = [
    {
      id: 'scene-logical-id',
      title: { 'zh-CN': 'Scene' },
      assetId: 'scene-bundle-asset',
      protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
      views: [
        {
          id: 'view-1',
          title: { 'zh-CN': 'View' },
          activationMessage: { type: 'init' },
          categoryIds: [],
        },
      ],
    },
  ]
  project.navigation.routes = [
    {
      id: 'route-from-scene',
      from: { kind: 'scene', sceneId: 'scene-logical-id' },
      to: { kind: 'panorama' },
      transition: {
        kind: 'video',
        assetId: 'transition-video',
        posterAssetId: 'transition-poster',
        onFailure: 'cut',
      },
    },
  ]

  assert.deepEqual([...computeProjectReleaseAssetIds(project)].sort(), [
    'pano',
    'scene-bundle-asset',
    'transition-poster',
    'transition-video',
  ])
})
