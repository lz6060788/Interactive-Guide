import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { GALLERY_VALIDATION_ENGLISH, requireGalleryEnglish } from './gallery-validation-english.mjs'

const [workbookPath, imageDirectory, projectId = 'semiconductor-equipment-gallery'] =
  process.argv.slice(2)
if (!workbookPath || !imageDirectory) {
  throw new Error(
    'usage: node scripts/import-gallery-validation.mjs <workbook.xlsx> <image-directory> [project-id]',
  )
}
if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error('project-id must be kebab-case')

const targetRoot = path.resolve('data', 'projects', projectId)
const projectsRoot = path.resolve('data', 'projects')
if (!targetRoot.startsWith(`${projectsRoot}${path.sep}`))
  throw new Error('target project escapes data/projects')
if (fs.existsSync(targetRoot)) throw new Error(`target project already exists: ${targetRoot}`)

const rows = readFirstWorksheet(path.resolve(workbookPath))
const expectedHeaders = [
  '一级',
  '二级',
  '三级节点',
  '第三级节点描述',
  '三级节点简要介绍',
  '公司标的',
  '分类路径',
]
if (JSON.stringify(rows[0]) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`unexpected workbook headers: ${JSON.stringify(rows[0])}`)
}
const records = rows.slice(1).map((row, index) => ({
  sourceRow: index + 2,
  stage: required(row[0], `A${index + 2}`),
  category: required(row[1], `B${index + 2}`),
  item: required(row[2], `C${index + 2}`),
  description: required(row[3], `D${index + 2}`),
  summary: required(row[4], `E${index + 2}`),
  companies: required(row[5], `F${index + 2}`),
  classificationPath: required(row[6], `G${index + 2}`),
}))

const stageMap = { 上游: 'upstream', 中游: 'midstream', 下游: 'downstream' }
const stageOrder = ['upstream', 'midstream', 'downstream']
const aliases = { 掩模版: '掩模板.png' }
const sourceImages = fs
  .readdirSync(path.resolve(imageDirectory), { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
  .map(entry => entry.name)
  .sort((left, right) => left.localeCompare(right, 'zh-CN'))
const sourceImageSet = new Set(sourceImages)
const mappings = records.map(record => {
  const exact = `${record.item}.png`
  const imageFile = sourceImageSet.has(exact) ? exact : aliases[record.item]
  if (!imageFile || !sourceImageSet.has(imageFile)) {
    throw new Error(`no unique image for row ${record.sourceRow} item "${record.item}"`)
  }
  return { ...record, imageFile, match: exact === imageFile ? 'exact' : 'explicit-alias' }
})
const usedImages = new Set(mappings.map(mapping => mapping.imageFile))
const unclaimed = sourceImages.filter(name => !usedImages.has(name))
if (usedImages.size !== mappings.length || unclaimed.length > 0) {
  throw new Error(
    `image mapping is not one-to-one: records=${mappings.length}, used=${usedImages.size}, unclaimed=${unclaimed.join(',')}`,
  )
}

const now = new Date().toISOString()
const stages = stageOrder.map((stageKey, stageIndex) => {
  const stageRecords = mappings.filter(mapping => stageMap[mapping.stage] === stageKey)
  const categoryNames = [...new Set(stageRecords.map(mapping => mapping.category))]
  return {
    key: stageKey,
    label: {
      'zh-CN': stageRecords[0]?.stage ?? ['上游', '中游', '下游'][stageIndex],
      'en-US': requireGalleryEnglish(GALLERY_VALIDATION_ENGLISH.stages, stageKey, 'stage label'),
    },
    order: stageIndex + 1,
    categories: categoryNames.map((categoryName, categoryIndex) => {
      const categoryId = `category-${stageKey}-${String(categoryIndex + 1).padStart(2, '0')}`
      return {
        id: categoryId,
        title: {
          'zh-CN': categoryName,
          'en-US': requireGalleryEnglish(
            GALLERY_VALIDATION_ENGLISH.categories,
            categoryName,
            'category title',
          ),
        },
        order: categoryIndex,
        itemIds: stageRecords
          .filter(mapping => mapping.category === categoryName)
          .map(mapping => itemId(mapping.sourceRow)),
        experience: { kind: 'panorama' },
      }
    }),
  }
})

const categoryIdByPath = new Map()
for (const stage of stages) {
  for (const category of stage.categories) {
    categoryIdByPath.set(`${stage.key}/${category.title['zh-CN']}`, category.id)
  }
}

const items = {}
const assets = {}
const itemImageAssetIds = {}
const panoramaCategories = {}
const panoramaItems = {}
for (const stage of stages) {
  for (const category of stage.categories) {
    panoramaCategories[category.id] = { viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 } }
  }
}

for (const mapping of mappings) {
  const stageKey = stageMap[mapping.stage]
  if (!stageKey) throw new Error(`unsupported stage at row ${mapping.sourceRow}: ${mapping.stage}`)
  if (mapping.classificationPath !== `${mapping.stage}>${mapping.category}>${mapping.item}`) {
    throw new Error(`classification path mismatch at G${mapping.sourceRow}`)
  }
  const id = itemId(mapping.sourceRow)
  const categoryId = categoryIdByPath.get(`${stageKey}/${mapping.category}`)
  const categoryItems =
    stages.flatMap(stage => stage.categories).find(category => category.id === categoryId)
      ?.itemIds ?? []
  const english = requireGalleryEnglish(
    GALLERY_VALIDATION_ENGLISH.items,
    mapping.item,
    'item content',
  )
  items[id] = {
    id,
    categoryId,
    title: { 'zh-CN': mapping.item, 'en-US': english.title },
    description: { 'zh-CN': mapping.description, 'en-US': english.description },
    order: categoryItems.indexOf(id),
  }
  panoramaItems[id] = { marker: { x: 0.5, y: 0.5 } }

  const assetId = `gallery-image-${String(mapping.sourceRow - 1).padStart(3, '0')}`
  const sourceFile = path.resolve(imageDirectory, mapping.imageFile)
  const buffer = fs.readFileSync(sourceFile)
  const dimensions = readPngDimensions(buffer, mapping.imageFile)
  const sourcePath = `images/${assetId}/${mapping.imageFile}`
  assets[assetId] = {
    id: assetId,
    kind: 'image',
    sourcePath,
    mimeType: 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    size: buffer.length,
  }
  itemImageAssetIds[id] = assetId
}

const project = {
  schemaVersion: '4.0.0',
  id: projectId,
  title: {
    'zh-CN': '半导体设备产业链 Gallery 验收',
    'en-US': GALLERY_VALIDATION_ENGLISH.projectTitle,
  },
  version: '0.1.0',
  localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN', 'en-US'] },
  knowledge: { stages, items },
  assets: { byId: assets },
  panorama: {
    assetId: '',
    coordinateSpace: 'normalized',
    cameraBounds: { minZoom: 1, maxZoom: 4 },
    initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    categories: panoramaCategories,
    items: panoramaItems,
  },
  scenes: [],
  navigation: { routes: [] },
  products: {
    atlas: {
      enabled: true,
      viewport: { width: 375, height: 808 },
      theme: { hotspotVariant: 'default', calloutVariant: 'classic' },
      chrome: {},
      interaction: { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
      categoryIds: stages.flatMap(stage => stage.categories.map(category => category.id)),
      hintText: {
        'zh-CN': '拖动或缩放探索全景图',
        'en-US': GALLERY_VALIDATION_ENGLISH.hints.atlas,
      },
    },
    catalog: {
      enabled: true,
      viewport: { width: 375, height: 808 },
      theme: { listDensity: 'comfortable', focusVariant: 'rect' },
      chrome: {},
      interaction: {
        listActivation: 'center-nearest',
        markerActivation: true,
        viewportAnimationMs: 360,
      },
      stageOrder,
      hintText: {
        'zh-CN': '点击或滑动文字查看简介',
        'en-US': GALLERY_VALIDATION_ENGLISH.hints.catalog,
      },
    },
    gallery: {
      enabled: true,
      viewport: { width: 375, height: 808 },
      theme: {
        listDensity: 'comfortable',
        backgroundColor: '#030507',
        textColor: '#ffffff',
        accentColor: '#60a5fa',
      },
      chrome: {},
      interaction: {
        listActivation: 'center-nearest',
        itemTransitionMs: 220,
        categoryTransitionMs: 320,
      },
      stageOrder,
      hintText: {
        'zh-CN': '点击或滑动文字切换节点图片',
        'en-US': GALLERY_VALIDATION_ENGLISH.hints.gallery,
      },
      itemImageAssetIds,
    },
  },
  integrations: {},
  metadata: { createdAt: now, updatedAt: now, revision: 1, schemaVersion: '4.0.0' },
}

fs.mkdirSync(targetRoot, { recursive: true })
for (const mapping of mappings) {
  const id = itemId(mapping.sourceRow)
  const assetId = itemImageAssetIds[id]
  const asset = assets[assetId]
  const destination = path.join(targetRoot, 'assets', ...asset.sourcePath.split('/'))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.resolve(imageDirectory, mapping.imageFile), destination)
}
fs.writeFileSync(path.join(targetRoot, 'project.json'), `${JSON.stringify(project, null, 2)}\n`)
fs.writeFileSync(
  path.join(targetRoot, 'gallery-import-report.json'),
  `${JSON.stringify(
    {
      workbook: path.basename(workbookPath),
      worksheet: '半导体设备',
      sourceRows: mappings.length,
      sourceImages: sourceImages.length,
      exactMatches: mappings.filter(mapping => mapping.match === 'exact').length,
      aliases: mappings
        .filter(mapping => mapping.match === 'explicit-alias')
        .map(mapping => ({
          sourceRow: mapping.sourceRow,
          item: mapping.item,
          imageFile: mapping.imageFile,
        })),
      missing: [],
      unclaimed: [],
      mappings: mappings.map(mapping => ({
        sourceRow: mapping.sourceRow,
        itemId: itemId(mapping.sourceRow),
        item: mapping.item,
        imageFile: mapping.imageFile,
        match: mapping.match,
      })),
    },
    null,
    2,
  )}\n`,
)

console.log(
  JSON.stringify({ projectId, targetRoot, rows: mappings.length, images: sourceImages.length }),
)

function itemId(sourceRow) {
  return `item-${String(sourceRow - 1).padStart(3, '0')}`
}

function required(value, cell) {
  if (!value?.trim()) throw new Error(`required value missing at ${cell}`)
  return value.trim()
}

function readPngDimensions(buffer, filename) {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a' || buffer.length < 24)
    throw new Error(`invalid PNG: ${filename}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function readFirstWorksheet(filename) {
  const zip = new AdmZip(filename)
  const sharedXml = zip.readAsText('xl/sharedStrings.xml')
  const sheetXml = zip.readAsText('xl/worksheets/sheet1.xml')
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map(part => decodeXml(part[1]))
      .join(''),
  )
  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(rowMatch => {
    const row = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const address = /\br="([A-Z]+)\d+"/.exec(cellMatch[1])?.[1]
      const value = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[2])?.[1] ?? ''
      if (!address) continue
      const column = columnIndex(address)
      row[column] = /\bt="s"/.test(cellMatch[1]) ? (shared[Number(value)] ?? '') : decodeXml(value)
    }
    return Array.from({ length: 7 }, (_, index) => row[index] ?? '')
  })
}

function columnIndex(letters) {
  let result = 0
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64
  return result - 1
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}
