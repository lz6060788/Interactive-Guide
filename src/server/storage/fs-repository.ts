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
  PublishManifest,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  HotspotBuildRecord,
} from '../../shared/types.js'

export class FsRepository implements Repository {
  private dataDir: string
  private generatesDir: string
  private publishDir: string
  private workspaceDir: string
  private guides: Map<string, KnowledgePackage> = new Map()
  private generates: Map<string, PackageBuildRecord> = new Map()

  constructor(baseDir?: string) {
    this.dataDir = baseDir ?? path.resolve('data')
    this.generatesDir = path.join(this.dataDir, 'generates')
    this.publishDir = path.join(this.dataDir, 'publish')
    this.workspaceDir = path.join(this.dataDir, 'workspace')
    this.ensureDirs()
    this.loadAllFromDisk()
  }

  // ─── Initialization ──────────────────────────────────────

  private ensureDirs() {
    for (const dir of [this.generatesDir, this.publishDir, this.workspaceDir]) {
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
    if (fs.existsSync(this.workspaceDir)) {
      const entries = fs.readdirSync(this.workspaceDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const manifestPath = path.join(this.workspaceDir, entry.name, 'manifest.json')
        if (!fs.existsSync(manifestPath)) continue
        try {
          const manifest: PublishManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          const guide = this.manifestToGuide(manifest)
          this.guides.set(guide.id, guide)
        } catch {
          console.warn(`[FsRepo] Failed to load workspace manifest: ${manifestPath}`)
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
      const generatePath = path.join(dir, 'generate.json')
      if (fs.existsSync(generatePath)) {
        try {
          const record: PackageBuildRecord = JSON.parse(fs.readFileSync(generatePath, 'utf-8'))
          this.generates.set(record.buildId, record)
        } catch {
          console.warn(`[FsRepo] Failed to load generate record: ${generatePath}`)
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
    const dir = path.join(this.workspaceDir, guide.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify(this.guideToManifest(guide), null, 2),
    )
  }

  deleteGuide(guideId: string): void {
    this.guides.delete(guideId)
    const workspaceDir = path.join(this.workspaceDir, guideId)
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true })
    }
    const legacyGuideDir = path.join(this.dataDir, 'guides', guideId)
    if (fs.existsSync(legacyGuideDir)) {
      fs.rmSync(legacyGuideDir, { recursive: true, force: true })
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

  copyDir(src: string, dest: string): void {
    const absSrc = this.resolveDataPath(src)
    if (!fs.existsSync(absSrc)) return
    const absDest = this.resolveDataPath(dest)
    fs.mkdirSync(absDest, { recursive: true })
    for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
      const srcPath = path.join(absSrc, entry.name)
      const destPath = path.join(absDest, entry.name)
      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
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

  private manifestToGuide(manifest: PublishManifest): KnowledgePackage {
    return {
      id: manifest.packageId,
      title: manifest.title,
      version: manifest.version,
      locale: manifest.locale,
      description: manifest.description,
      resolution: manifest.resolution,
      visualStyle: manifest.visualStyle,
      transitionStyle: manifest.transitionStyle,
      style: manifest.style,
      nodes: manifest.nodes.map(node => ({
        id: node.id,
        title: node.title,
        keyContent: node.keyContent,
        sourceText: node.sourceText,
        summary: node.summary,
        keyPoints: node.keyPoints,
        topicType: node.topicType,
        visualIntent: node.visualIntent,
        hotspotHints: node.hotspotHints,
        presentationIntent: node.presentationIntent,
        imageUrl: node.imageUrl,
        imageStatus: node.imageStatus,
        hotspots: (node.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          x: hs.normalizedX,
          y: hs.normalizedY,
          style: hs.style,
        })),
        status: node.status,
        extensions: node.extensions,
        contentType: node.contentType,
        htmlSource: node.htmlSource,
        htmlUrl: node.htmlUrl,
        hotspotEdgeIds: node.hotspotEdgeIds,
        imageFitMode: node.imageFitMode,
      })),
      edges: manifest.edges.map(edge => ({
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        relationLabel: edge.relationLabel,
        transitionDescriptionMode: edge.transitionDescriptionMode,
        manualTransitionPrompt: edge.manualTransitionPrompt,
        promptStatus: edge.promptStatus,
        transitionStrategyMode: edge.transitionStrategyMode,
        transitionStrategyReason: edge.transitionStrategyReason,
        transitionPlan: edge.transitionPlan,
        transitionPrompt: edge.transitionPrompt,
        transitionPath: edge.transitionPath,
        videoUrl: edge.videoUrl,
        videoStatus: edge.videoStatus,
        status: edge.status,
        transitionType: edge.transitionType,
        builtinTransition: edge.builtinTransition,
        extensions: edge.extensions,
      })),
      metadata: {
        createdAt: undefined,
        updatedAt: manifest.metadata?.generatedAt,
      },
    }
  }

  private guideToManifest(guide: KnowledgePackage): PublishManifest {
    const nodes = guide.nodes.map(node => ({
      id: node.id,
      title: node.title,
      keyContent: node.keyContent,
      summary: node.summary,
      keyPoints: node.keyPoints,
      topicType: node.topicType,
      sourceText: node.sourceText,
      visualIntent: node.visualIntent,
      hotspotHints: node.hotspotHints,
      presentationIntent: node.presentationIntent,
      imageUrl: node.imageUrl,
      imageStatus: node.imageStatus,
      hotspots: (node.hotspots ?? []).map(hs => ({
        edgeId: hs.edgeId,
        targetNodeId: hs.targetNodeId,
        label: hs.label,
        normalizedX: hs.normalizedX,
        normalizedY: hs.normalizedY,
        radius: hs.radius,
        markerType: 'dot' as const,
        style: hs.style,
      })),
      status: node.status,
      extensions: node.extensions,
      contentType: node.contentType,
      htmlSource: node.htmlSource,
      htmlUrl: node.htmlUrl,
      hotspotEdgeIds: node.hotspotEdgeIds,
      imageFitMode: node.imageFitMode,
    }))
    const edges = guide.edges.map(edge => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      relationLabel: edge.relationLabel,
      transitionDescriptionMode: edge.transitionDescriptionMode,
      manualTransitionPrompt: edge.manualTransitionPrompt,
      promptStatus: edge.promptStatus,
      transitionStrategyMode: edge.transitionStrategyMode,
      transitionStrategyReason: edge.transitionStrategyReason,
      transitionPlan: edge.transitionPlan,
      transitionPrompt: edge.transitionPrompt,
      transitionPath: edge.transitionPath,
      transitionType: edge.transitionType,
      builtinTransition: edge.builtinTransition,
      videoUrl: edge.videoUrl,
      videoStatus: edge.videoStatus,
      status: edge.status,
      extensions: edge.extensions,
    }))
    const nodeMap: PublishManifest['nodeMap'] = {}
    for (const node of nodes) nodeMap[node.id] = node
    const edgeMap: PublishManifest['edgeMap'] = {}
    for (const edge of edges) edgeMap[edge.id] = edge

    return {
      packageId: guide.id,
      version: guide.version,
      title: guide.title,
      rootNodeId: 'root',
      locale: guide.locale,
      description: guide.description,
      resolution: guide.resolution,
      visualStyle: guide.visualStyle,
      transitionStyle: guide.transitionStyle,
      style: guide.style,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        generatedAt: guide.metadata?.updatedAt ?? new Date().toISOString(),
        manifestVersion: '1.0.0',
      },
    }
  }
}
