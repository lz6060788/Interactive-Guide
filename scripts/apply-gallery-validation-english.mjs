import { GALLERY_VALIDATION_ENGLISH, requireGalleryEnglish } from './gallery-validation-english.mjs'

const projectId = process.argv[2] ?? 'semiconductor-equipment-gallery'
const apiBase = (process.argv[3] ?? 'http://127.0.0.1:8788/api').replace(/\/$/, '')

let project = await request(`/projects/${projectId}`)
const knowledge = structuredClone(project.knowledge)
for (const stage of knowledge.stages) {
  stage.label['en-US'] = requireGalleryEnglish(
    GALLERY_VALIDATION_ENGLISH.stages,
    stage.key,
    'stage label',
  )
  for (const category of stage.categories) {
    const chineseTitle = category.title['zh-CN']
    category.title['en-US'] = requireGalleryEnglish(
      GALLERY_VALIDATION_ENGLISH.categories,
      chineseTitle,
      'category title',
    )
  }
}
for (const item of Object.values(knowledge.items)) {
  const chineseTitle = item.title['zh-CN']
  const english = requireGalleryEnglish(
    GALLERY_VALIDATION_ENGLISH.items,
    chineseTitle,
    'item content',
  )
  item.title['en-US'] = english.title
  item.description['en-US'] = english.description
}
assertExactCoverage(knowledge)

project = await request(`/projects/${projectId}/metadata`, {
  method: 'PATCH',
  expectedRevision: project.metadata.revision,
  body: {
    title: GALLERY_VALIDATION_ENGLISH.projectTitle,
    titleLocale: 'en-US',
    expectedRevision: project.metadata.revision,
  },
})

project = await request(`/projects/${projectId}/knowledge`, {
  method: 'PUT',
  expectedRevision: project.metadata.revision,
  body: knowledge,
})

for (const product of ['atlas', 'catalog', 'gallery']) {
  const config = structuredClone(project.products[product])
  config.hintText['en-US'] = GALLERY_VALIDATION_ENGLISH.hints[product]
  project = await request(`/projects/${projectId}/products/${product}`, {
    method: 'PUT',
    expectedRevision: project.metadata.revision,
    body: config,
  })
}

project = await request(`/projects/${projectId}/localization`, {
  method: 'PUT',
  expectedRevision: project.metadata.revision,
  body: {
    defaultLocale: project.localization.defaultLocale,
    supportedLocales: Array.from(new Set([...project.localization.supportedLocales, 'en-US'])),
    expectedRevision: project.metadata.revision,
  },
})

console.log(
  JSON.stringify({
    projectId,
    revision: project.metadata.revision,
    supportedLocales: project.localization.supportedLocales,
    categories: project.knowledge.stages.flatMap(stage => stage.categories).length,
    items: Object.keys(project.knowledge.items).length,
  }),
)

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (options.expectedRevision !== undefined) {
    headers['x-expected-revision'] = String(options.expectedRevision)
  }
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(payload)}`,
    )
  }
  return payload?.data ?? payload
}

function assertExactCoverage(knowledge) {
  const categoryNames = new Set(
    knowledge.stages.flatMap(stage => stage.categories.map(category => category.title['zh-CN'])),
  )
  const itemNames = new Set(Object.values(knowledge.items).map(item => item.title['zh-CN']))
  const extraCategories = Object.keys(GALLERY_VALIDATION_ENGLISH.categories).filter(
    name => !categoryNames.has(name),
  )
  const extraItems = Object.keys(GALLERY_VALIDATION_ENGLISH.items).filter(
    name => !itemNames.has(name),
  )
  if (extraCategories.length || extraItems.length) {
    throw new Error(
      `authored English contains unmatched content: categories=${extraCategories.join(',')} items=${extraItems.join(',')}`,
    )
  }
}
