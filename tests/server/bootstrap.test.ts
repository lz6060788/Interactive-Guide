import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { assembleProject, type BootstrapInput } from '../../src/server/bootstrap.js'

test('assembleProject applies authored spatial layouts and exposes all categories to Atlas', () => {
  const input: BootstrapInput = {
    project: { id: 'spatial-bootstrap', title: 'Spatial Bootstrap' },
    knowledge: {
      stages: [
        {
          key: 'upstream',
          categories: [
            {
              id: 'category-a',
              title: 'Category A',
              items: [{ id: 'item-a', title: 'Item A', description: 'Description A' }],
            },
          ],
        },
        { key: 'midstream', categories: [] },
        { key: 'downstream', categories: [] },
      ],
    },
    panoramaImagePath: path.resolve('package.json'),
    spatial: {
      categories: {
        'category-a': { hotspot: { x: 0.2, y: 0.3 } },
      },
      items: {
        'item-a': {
          marker: { x: 0.25, y: 0.35 },
          focusRect: { x: 0.14, y: 0.26, width: 0.22, height: 0.18 },
          viewportOverride: { centerX: 0.25, centerY: 0.35, zoom: 3.6 },
          callout: { markerPosition: 'top', markerGapPx: 6 },
        },
      },
    },
  }

  const result = assembleProject(input)

  assert.deepEqual(result.project.products.atlas.categoryIds, ['category-a'])
  assert.deepEqual(result.project.panorama.categories['category-a'].hotspot, { x: 0.2, y: 0.3 })
  assert.deepEqual(result.project.panorama.categories['category-a'].viewport, {
    centerX: 0.2,
    centerY: 0.3,
    zoom: 3.6,
  })
  assert.deepEqual(result.project.panorama.items['item-a'].marker, { x: 0.25, y: 0.35 })
  assert.equal(result.project.panorama.items['item-a'].focusRect?.width, 0.22)
  assert.equal(result.calibrationQueue.length, 0)
  assert.equal(result.unmappedKnowledge.length, 0)
})
