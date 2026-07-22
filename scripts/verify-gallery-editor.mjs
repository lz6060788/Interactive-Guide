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

  const radioRow = page
    .getByTestId('gallery-structure-panel')
    .locator('[data-testid^="gallery-item-"]')
    .filter({ hasText: '射频电源' })
  await radioRow.getByRole('button', { name: /射频电源/ }).click()
  await page.waitForTimeout(900)
  assert.equal(await radioRow.getAttribute('data-active'), 'true')
  assert.equal(await page.getByLabel('节点标题').inputValue(), '射频电源')
  await page.waitForTimeout(900)
  assert.equal(
    await radioRow.getAttribute('data-active'),
    'true',
    'selection jumped back after preview sync',
  )
  assert.equal(await page.getByLabel('节点标题').inputValue(), '射频电源')

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
      stableSelection: '射频电源',
      categoryCrud: true,
      itemCrud: true,
      screenshotPath,
    }),
  )
} finally {
  await browser.close()
}
