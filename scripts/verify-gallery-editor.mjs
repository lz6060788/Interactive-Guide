import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:\\Users\\91252\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright')

const url =
  process.argv[2] ?? 'http://127.0.0.1:5174/projects/semiconductor-equipment-gallery/gallery-editor'
const screenshotPath =
  process.argv[3] ??
  'D:\\workspace\\git\\Interactive-Guide\\.runtime-logs\\gallery-editor-after.png'

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const browserErrors = []
const captureImageScroll = image =>
  image.evaluate(
    element =>
      new Promise(resolve => {
        if (element.dataset.motion === 'scrolling') {
          resolve('scrolling')
          return
        }
        const observer = new MutationObserver(() => {
          if (element.dataset.motion !== 'scrolling') return
          observer.disconnect()
          resolve('scrolling')
        })
        observer.observe(element, { attributes: true, attributeFilter: ['data-motion'] })
        setTimeout(() => {
          observer.disconnect()
          resolve(element.dataset.motion ?? 'missing')
        }, 1500)
      }),
  )
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text())
})
page.on('pageerror', error => browserErrors.push(error.message))

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByTestId('gallery-toolbar').waitFor()

  const toolbarBackground = await page
    .getByTestId('gallery-toolbar')
    .evaluate(element => getComputedStyle(element).backgroundColor)
  assert.notEqual(
    toolbarBackground,
    'rgb(13, 17, 21)',
    'Gallery toolbar still uses the old dark UI',
  )

  const previewRect = await page.getByTestId('gallery-preview-frame').boundingBox()
  assert.ok(previewRect, 'Gallery preview frame is missing')
  assert.ok(
    Math.abs(previewRect.width - previewRect.height) <= 1,
    `Gallery preview is not square: ${previewRect.width} × ${previewRect.height}`,
  )

  const [hintRect, previewRootRect] = await Promise.all([
    page.getByTestId('gallery-hint').boundingBox(),
    page.getByTestId('gallery-live-preview').boundingBox(),
  ])
  assert.ok(hintRect && previewRootRect, 'Gallery hint or runtime root is missing')
  assert.ok(
    Math.abs(hintRect.x + hintRect.width / 2 - (previewRootRect.x + previewRootRect.width / 2)) <=
      1,
    'Gallery hint is not centered in the runtime',
  )

  const categoryTabs = page.getByTestId('gallery-category-tabs')
  const previousCategoryWidth = await categoryTabs.evaluate(element => {
    const previous = element.style.width
    element.style.width = '120px'
    element.scrollLeft = 0
    return previous
  })
  await categoryTabs.hover()
  await page.mouse.wheel(0, 48)
  await page.waitForTimeout(100)
  const horizontalTabResult = await categoryTabs.evaluate(element => {
    return {
      overflowX: getComputedStyle(element).overflowX,
      scrollbarWidth: getComputedStyle(element).scrollbarWidth,
      overflowed: element.scrollWidth > element.clientWidth,
      moved: element.scrollLeft > 0,
    }
  })
  await categoryTabs.evaluate(
    (element, width) => (element.style.width = width),
    previousCategoryWidth,
  )
  assert.deepEqual(horizontalTabResult, {
    overflowX: 'auto',
    scrollbarWidth: 'none',
    overflowed: true,
    moved: true,
  })

  const radioRow = page
    .getByTestId('gallery-structure-panel')
    .locator('[data-testid^="gallery-item-"]')
    .filter({ hasText: '射频电源' })
  const activeImage = page.getByTestId('gallery-active-image')
  const imageScrollMotion = captureImageScroll(activeImage)
  await radioRow.getByRole('button', { name: /射频电源/ }).click()
  assert.equal(await imageScrollMotion, 'scrolling', 'left image did not use scroll motion')
  await page.waitForTimeout(900)
  assert.equal(await radioRow.getAttribute('data-active'), 'true')
  assert.equal(await page.getByLabel('节点标题').inputValue(), '射频电源')
  assert.equal(await activeImage.getAttribute('data-motion'), 'idle')
  assert.equal(
    await activeImage.getAttribute('data-direction'),
    'forward',
  )
  await page.waitForTimeout(900)
  assert.equal(
    await radioRow.getAttribute('data-active'),
    'true',
    'selection jumped back after preview sync',
  )
  assert.equal(await page.getByLabel('节点标题').inputValue(), '射频电源')

  const listScrollMotion = captureImageScroll(activeImage)
  await page.getByTestId('gallery-detail-list').evaluate(list => {
    const target = list.querySelector('[data-item-id="item-003"]')
    if (!(target instanceof HTMLElement)) throw new Error('item-003 is missing from detail list')
    const listRect = list.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    list.scrollTo({
      top:
        list.scrollTop +
        targetRect.top +
        targetRect.height / 2 -
        (listRect.top + listRect.height / 2),
      behavior: 'auto',
    })
  })
  assert.equal(await listScrollMotion, 'scrolling', 'right list did not drive image scroll')
  await page.waitForTimeout(500)
  assert.equal(
    await page
      .getByTestId('gallery-detail-list')
      .getByTestId('gallery-item-item-003')
      .getAttribute('data-active'),
    'true',
  )
  assert.equal(await activeImage.getAttribute('alt'), '运动控制系统')
  assert.equal(await activeImage.getAttribute('data-direction'), 'forward')
  assert.equal(
    await page.getByTestId('gallery-image-panel').locator('img').count(),
    1,
    'image scroll introduced multiple visible image elements',
  )

  const temporaryCategoryTitle = `自动验收二级节点-${Date.now()}`
  await page.getByTestId('gallery-add-category').click()
  await page.getByLabel('节点标题').fill(temporaryCategoryTitle)
  const temporaryCategory = page
    .getByTestId('gallery-structure-panel')
    .locator('[data-testid^="gallery-category-"]')
    .filter({ hasText: temporaryCategoryTitle })
  await temporaryCategory.getByRole('button', { name: '新增三级节点' }).click()
  assert.equal(await page.getByLabel('节点标题').inputValue(), '新三级节点')
  await page.getByLabel('节点标题').fill('自动验收三级节点')
  await page.getByTestId('btn-save').click()
  await page.getByTestId('gallery-dirty').filter({ hasText: 'all synced' }).waitFor()

  await temporaryCategory.getByRole('button', { name: '删除二级节点' }).click()
  await page.getByTestId('btn-save').click()
  await page.getByTestId('gallery-dirty').filter({ hasText: 'all synced' }).waitFor()
  assert.equal(await temporaryCategory.count(), 0, 'temporary category was not deleted')

  await page.screenshot({ path: screenshotPath, fullPage: true })
  assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join('\n')}`)
  console.log(
    JSON.stringify({
      ok: true,
      toolbarBackground,
      squarePreview: true,
      centeredHint: true,
      horizontalCategoryTabs: true,
      imageMotion: 'vertical-scroll',
      stableSelection: '射频电源',
      categoryCrud: true,
      itemCrud: true,
      screenshotPath,
    }),
  )
} finally {
  await browser.close()
}
