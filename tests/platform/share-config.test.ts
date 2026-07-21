/**
 * ShareConfig — derives og:* meta tags from a GuideProject.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveShareConfig, shareConfigToMetaTags } from '../../src/platform/sharing/share-config.js'
import { createDraftProject } from '../../src/domain/project-normalizer.js'

test('deriveShareConfig uses project.title by default', () => {
  const p = createDraftProject({ id: 'p1', title: '商业航天' })
  const cfg = deriveShareConfig(p, 'atlas/index.html')
  assert.equal(cfg.title, '商业航天')
  assert.equal(cfg.description, '商业航天')
  assert.equal(cfg.url, 'atlas/index.html')
})

test('deriveShareConfig resolves og:image from imageAssetId', () => {
  const p = createDraftProject({ id: 'p1', title: 'P' })
  p.integrations = {
    share: { enabled: true, imageAssetId: 'asset-cover' },
  }
  const cfg = deriveShareConfig(
    p,
    'atlas/index.html',
    'https://example.com/r1',
    p.integrations.share,
  )
  assert.equal(cfg.imageUrl, 'https://example.com/r1/assets/images/asset-cover/image.jpg')
  assert.equal(cfg.imageAssetId, 'asset-cover')
})

test('shareConfigToMetaTags renders og:url/og:title/og:description and image', () => {
  const tags = shareConfigToMetaTags({
    url: 'https://example.com/atlas/index.html',
    title: 'T',
    description: 'D',
    imageUrl: 'https://example.com/cover.jpg',
  })
  const properties = tags.map((t) => t.property)
  assert.ok(properties.includes('og:url'))
  assert.ok(properties.includes('og:title'))
  assert.ok(properties.includes('og:description'))
  assert.ok(properties.includes('og:image'))
})