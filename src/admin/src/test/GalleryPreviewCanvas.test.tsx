import './setup'

import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftProject } from '@domain/project-normalizer'
import { system } from '../theme/system'
import { GalleryPreviewCanvas } from '../features/gallery-editor/components/GalleryPreviewCanvas'

describe('GalleryPreviewCanvas', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    })
    HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo
  })

  it('keeps the mounted scene and synchronizes item selection without jumping to the first item', async () => {
    const project = createDraftProject({ id: 'gallery-preview', title: 'Gallery Preview' })
    project.products.gallery = {
      enabled: true,
      viewport: { width: 375, height: 808 },
      theme: { listDensity: 'comfortable' },
      chrome: {},
      interaction: {
        listActivation: 'center-nearest',
        itemTransitionMs: 220,
        categoryTransitionMs: 320,
      },
      stageOrder: ['upstream', 'midstream', 'downstream'],
      hintText: { 'zh-CN': '点击或滑动文字切换节点图片' },
      itemImageAssetIds: {},
    }
    project.knowledge.stages[0].categories.push({
      id: 'cat-components',
      title: { 'zh-CN': '核心零部件' },
      order: 1,
      itemIds: ['item-vacuum', 'item-rf'],
      experience: { kind: 'panorama' },
    })
    project.knowledge.items['item-vacuum'] = {
      id: 'item-vacuum',
      categoryId: 'cat-components',
      title: { 'zh-CN': '真空系统' },
      description: { 'zh-CN': '真空系统描述' },
      order: 1,
    }
    project.knowledge.items['item-rf'] = {
      id: 'item-rf',
      categoryId: 'cat-components',
      title: { 'zh-CN': '射频电源' },
      description: { 'zh-CN': '射频电源描述' },
      order: 2,
    }
    for (const [itemId, assetId] of [
      ['item-vacuum', 'image-vacuum'],
      ['item-rf', 'image-rf'],
    ] as const) {
      project.assets.byId[assetId] = {
        id: assetId,
        kind: 'image',
        sourcePath: `images/${assetId}.png`,
      }
      project.products.gallery.itemImageAssetIds[itemId] = assetId
    }

    const onSelectItem = vi.fn()
    const { rerender } = render(
      <ChakraProvider value={system}>
        <GalleryPreviewCanvas
          project={project}
          selectedItemId="item-vacuum"
          locale="zh-CN"
          onSelectItem={onSelectItem}
        />
      </ChakraProvider>,
    )

    const contentLayer = await screen.findByTestId('gallery-content-layer')
    expect(screen.getByTestId('gallery-preview-frame')).toHaveStyle({ aspectRatio: '1 / 1' })
    expect(screen.getByTestId('gallery-item-item-vacuum')).toHaveAttribute('data-active', 'true')

    rerender(
      <ChakraProvider value={system}>
        <GalleryPreviewCanvas
          project={project}
          selectedItemId="item-rf"
          locale="zh-CN"
          onSelectItem={onSelectItem}
        />
      </ChakraProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('gallery-item-item-rf')).toHaveAttribute('data-active', 'true'),
    )
    expect(screen.getByTestId('gallery-content-layer')).toBe(contentLayer)
    expect(screen.getByTestId('gallery-item-item-vacuum')).toHaveAttribute('data-active', 'false')
    expect(onSelectItem).not.toHaveBeenCalled()
  })
})
