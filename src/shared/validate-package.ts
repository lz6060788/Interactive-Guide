// ============================================================
// Interactive Guide - CLI: Validate Knowledge Package
// ============================================================
// Usage: npx tsx src/shared/validate-package.ts <path-to-package.json>

import fs from 'node:fs'
import { validateKnowledgePackage } from './validators.js'

const filePath = process.argv[2]

if (!filePath) {
  console.error('Usage: npx tsx src/shared/validate-package.ts <path-to-package.json>')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const result = validateKnowledgePackage(data)

  if (result.valid) {
    console.log('✅ Package is valid!')
    if (result.warnings.length > 0) {
      console.log('\nWarnings:')
      for (const w of result.warnings) console.log(`  ⚠️  ${w}`)
    }
  } else {
    console.log('❌ Package validation failed:')
    for (const e of result.errors) console.log(`  • ${e}`)
    if (result.warnings.length > 0) {
      console.log('\nWarnings:')
      for (const w of result.warnings) console.log(`  ⚠️  ${w}`)
    }
    process.exit(1)
  }
} catch (e: any) {
  console.error(`Failed to parse JSON: ${e.message}`)
  process.exit(1)
}
