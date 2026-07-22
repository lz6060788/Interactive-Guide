import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Gallery editor uses the shared workbench component surface', () => {
  for (const file of [
    'GalleryEditor',
    'GalleryToolbar',
    'GalleryStructurePanel',
    'GalleryPreviewCanvas',
    'GalleryInspector',
  ]) {
    assert.equal(
      fs.existsSync(path.resolve(`src/admin/src/features/gallery-editor/components/${file}.tsx`)),
      true,
      `${file}.tsx must exist`,
    )
  }
})

test('Gallery structure panel exposes category and item CRUD controls', () => {
  const source = fs.readFileSync(
    path.resolve('src/admin/src/features/gallery-editor/components/GalleryStructurePanel.tsx'),
    'utf8',
  )
  for (const testId of [
    'gallery-add-category',
    'gallery-add-item-',
    '删除二级节点',
    '删除三级节点',
  ]) {
    assert.equal(source.includes(testId), true, `${testId} control must remain available`)
  }
})
