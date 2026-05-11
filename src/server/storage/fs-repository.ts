// ============================================================
// Interactive Guide - File System Repository
// ============================================================
// Concrete implementation of Repository interface.
// File-system persisted in-memory Maps (flip-book pattern).
// Future: add db-repository.ts for DB + OSS, business code unchanged.

import fs from 'node:fs'
import path from 'node:path'
import type { Repository } from './repository.js'
import type {
  KnowledgePackage,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  HotspotBuildRecord,
} from '../../shared/types.js'

export class FsRepository implements Repository {
  private dataDir: string
  private guidesDir: string
  private generatesDir: string
  private publishDir: string
  private guides: Map<string, KnowledgePackage> = new Map()
  private generates: Map<string, PackageBuildRecord> = new Map()

  constructor(baseDir?: string) {
    this.dataDir = baseDir ?? path.resolve('data')
    this.guidesDir = path.join(this.dataDir, 'guides')
    this.generatesDir = path.join(this.dataDir, 'generates')
    this.publishDir = path.join(this.dataDir, 'publish')
    this.ensureDirs()
    this.loadAllFromDisk()
  }

  // ─── Initialization ──────────────────────────────────────

  private ensureDirs() {
    for (const dir of [this.guidesDir, this.generatesDir, this.publishDir]) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private loadAllFromDisk() {
    this.loadGuidesFromDisk()
    this.loadGeneratesFromDisk()
  }

  refresh(): void {
    this.guides.clear()
    this.generates.clear()
    this.loadAllFromDisk()
  }

  private loadGuidesFromDisk() {
    if (!fs.existsSync(this.guidesDir)) return
    const entries = fs.readdirSync(this.guidesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(this.guidesDir, entry.name, 'current')
      // Try new name first, fall back to old name
      const guidePath = path.join(dir, 'guide.json')
      const legacyPath = path.join(dir, 'package.json')
      const filePath = fs.existsSync(guidePath) ? guidePath : legacyPath
      if (fs.existsSync(filePath)) {
        try {
          const guide: KnowledgePackage = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          this.guides.set(guide.id, guide)
        } catch {
          console.warn(`[FsRepo] Failed to load guide: ${filePath}`)
        }
      }
    }
  }

  private loadGeneratesFromDisk() {
    if (!fs.existsSync(this.generatesDir)) return
    const entries = fs.readdirSync(this.generatesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(this.generatesDir, entry.name)
      // Try new name first, fall back to old name
      const generatePath = path.join(dir, 'generate.json')
      const legacyPath = path.join(dir, 'build.json')
      const filePath = fs.existsSync(generatePath) ? generatePath : legacyPath
      if (fs.existsSync(filePath)) {
        try {
          const record: PackageBuildRecord = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
          this.generates.set(record.buildId, record)
        } catch {
          console.warn(`[FsRepo] Failed to load generate record: ${filePath}`)
        }
      }
    }
  }

  // ─── Guide Operations ────────────────────────────────────

  loadAllGuides(): Map<string, KnowledgePackage> {
    return this.guides
  }

  saveGuide(guide: KnowledgePackage): void {
    this.guides.set(guide.id, guide)
    const dir = path.join(this.guidesDir, guide.id, 'current')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'guide.json'), JSON.stringify(guide, null, 2))
  }

  deleteGuide(guideId: string): void {
    this.guides.delete(guideId)
    const dir = path.join(this.guidesDir, guideId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  // ─── Generate Operations ─────────────────────────────────

  loadAllGenerates(): Map<string, PackageBuildRecord> {
    return this.generates
  }

  saveGenerateRecord(record: PackageBuildRecord): void {
    this.generates.set(record.buildId, record)
    const dir = path.join(this.generatesDir, record.buildId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'generate.json'), JSON.stringify(record, null, 2))
  }

  loadGenerateRecord(generateId: string): PackageBuildRecord | null {
    return this.generates.get(generateId) ?? null
  }

  saveNodeRecord(generateId: string, nodeId: string, record: NodeBuildRecord): void {
    const dir = path.join(this.generatesDir, generateId, 'nodes', nodeId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'node-record.json'), JSON.stringify(record, null, 2))
  }

  saveEdgeRecord(generateId: string, edgeId: string, record: EdgeBuildRecord): void {
    const dir = path.join(this.generatesDir, generateId, 'edges', edgeId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'edge-record.json'), JSON.stringify(record, null, 2))
  }

  saveHotspotRecord(generateId: string, nodeId: string, record: HotspotBuildRecord): void {
    const dir = path.join(this.generatesDir, generateId, 'hotspots', nodeId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'final.json'), JSON.stringify(record, null, 2))
  }

  // ─── File Operations ─────────────────────────────────────

  writeJson(filePath: string, data: unknown): void {
    const absPath = this.resolveDataPath(filePath)
    fs.mkdirSync(path.dirname(absPath), { recursive: true })
    fs.writeFileSync(absPath, JSON.stringify(data, null, 2))
  }

  readJson<T>(filePath: string): T | null {
    const absPath = this.resolveDataPath(filePath)
    if (!fs.existsSync(absPath)) return null
    try {
      const raw = fs.readFileSync(absPath, 'utf-8').replace(/^\uFEFF/, '')
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  writeFile(filePath: string, data: Buffer): void {
    const absPath = this.resolveDataPath(filePath)
    fs.mkdirSync(path.dirname(absPath), { recursive: true })
    fs.writeFileSync(absPath, data)
  }

  readFile(filePath: string): Buffer | null {
    const absPath = this.resolveDataPath(filePath)
    if (!fs.existsSync(absPath)) return null
    return fs.readFileSync(absPath)
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(this.resolveDataPath(filePath))
  }

  copyFile(src: string, dest: string): void {
    const absSrc = this.resolveDataPath(src)
    const absDest = this.resolveDataPath(dest)
    fs.mkdirSync(path.dirname(absDest), { recursive: true })
    fs.copyFileSync(absSrc, absDest)
  }

  ensureDir(dir: string): void {
    fs.mkdirSync(this.resolveDataPath(dir), { recursive: true })
  }

  deleteDir(dir: string): void {
    const absPath = this.resolveDataPath(dir)
    if (fs.existsSync(absPath)) {
      fs.rmSync(absPath, { recursive: true, force: true })
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  private resolveDataPath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath
    return path.join(this.dataDir, filePath)
  }
}
