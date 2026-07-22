import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:\\Users\\91252\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\playwright@1.61.1\\node_modules\\playwright')

const runtimeUrl = process.argv[2]
const editorUrl = process.argv[3]
const screenshotPath =
  process.argv[4] ??
  'D:\\workspace\\git\\Interactive-Guide\\.runtime-logs\\gallery-focus-acceptance.png'

assert.ok(runtimeUrl, 'runtime URL is required')
assert.ok(editorUrl, 'editor URL is required')

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    errors.push(message.text())
  }
})

try {
  const focusedRuntimeUrl = new URL(runtimeUrl)
  focusedRuntimeUrl.searchParams.set('focus', '射频电源')
  await page.goto(focusedRuntimeUrl.toString(), { waitUntil: 'networkidle' })
  const activeEntry = page.getByTestId('gallery-item-item-002')
  await activeEntry.waitFor()
  assert.equal(await activeEntry.getAttribute('data-active'), 'true')
  const activeImage = page.getByTestId('gallery-active-image')
  assert.equal(await activeImage.getAttribute('alt'), '射频电源')
  assert.ok(
    await activeImage.evaluate(image => image.naturalWidth > 0),
    'focused image did not load',
  )
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const focusedEditorUrl = new URL(editorUrl)
  focusedEditorUrl.searchParams.set('focus', '射频电源')
  await page.goto(focusedEditorUrl.toString(), { waitUntil: 'networkidle' })
  await page.getByTestId('gallery-toolbar').waitFor()
  await page.getByRole('button', { name: '启用 English' }).click()
  const titleField = page.getByLabel('节点标题')
  await titleField.waitFor()
  assert.equal(await titleField.inputValue(), '', 'English item title should start empty')
  await titleField.fill('RF Power Supply')
  assert.equal(await titleField.inputValue(), 'RF Power Supply')
  assert.equal(await page.getByTestId('gallery-dirty').count(), 1)

  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      runtimeFocus: 'item-002',
      editorFocus: 'item-002',
      englishEditing: true,
      persisted: false,
      screenshotPath,
    }),
  )
} finally {
  await browser.close()
}
