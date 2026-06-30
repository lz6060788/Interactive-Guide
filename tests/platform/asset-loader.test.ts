/**
 * AssetLoader URL resolution tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { AssetLoader } from '../../src/platform/asset-loader/asset-loader.js'

test('AssetLoader.resolveUrl is identity when no baseUrl', () => {
  const l = new AssetLoader()
  assert.equal(l.resolveUrl('assets/images/foo.jpg'), 'assets/images/foo.jpg')
})

test('AssetLoader.resolveUrl joins relative paths to baseUrl', () => {
  const l = new AssetLoader({ baseUrl: 'https://example.com/release/v1' })
  assert.equal(l.resolveUrl('assets/x.jpg'), 'https://example.com/release/v1/assets/x.jpg')
})

test('AssetLoader.resolveUrl does not double-slash', () => {
  const l = new AssetLoader({ baseUrl: 'https://example.com/release/v1/' })
  assert.equal(l.resolveUrl('/assets/x.jpg'), 'https://example.com/release/v1/assets/x.jpg')
})

test('AssetLoader.resolveUrl passes through absolute URLs', () => {
  const l = new AssetLoader({ baseUrl: 'https://example.com' })
  assert.equal(
    l.resolveUrl('https://cdn.example.com/x.jpg'),
    'https://cdn.example.com/x.jpg',
  )
})

test('AssetLoader.asCatalogLoader exposes loader contract', () => {
  const l = new AssetLoader({ baseUrl: 'https://example.com' })
  const c = l.asCatalogLoader()
  assert.equal(typeof c.resolveUrl, 'function')
  assert.equal(typeof c.loadImage, 'function')
  assert.equal(typeof c.openScene, 'function')
  assert.equal(c.resolveUrl('a.jpg'), 'https://example.com/a.jpg')
})

test('AssetLoader.asAtlasLoader exposes loader contract', () => {
  const l = new AssetLoader({ baseUrl: 'https://example.com' })
  const a = l.asAtlasLoader()
  assert.equal(a.resolveUrl('a.jpg'), 'https://example.com/a.jpg')
})