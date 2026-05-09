// ============================================================
// Interactive Guide - Repository Interface
// ============================================================
// Abstract storage interface — business layer depends ONLY on this.
// Concrete implementation (FsRepository) is injected at startup.
// Future migration: add db-repository.ts, business code unchanged.

import type {
  KnowledgePackage,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  HotspotBuildRecord,
} from '../../shared/types.js'

// ─── Guide Operations ──────────────────────────────────────

export interface GuideRepository {
  loadAllGuides(): Map<string, KnowledgePackage>
  saveGuide(guide: KnowledgePackage): void
  deleteGuide(guideId: string): void
  refresh(): void
}

// ─── Generate Operations ───────────────────────────────────

export interface GenerateRepository {
  saveGenerateRecord(record: PackageBuildRecord): void
  loadGenerateRecord(generateId: string): PackageBuildRecord | null
  loadAllGenerates(): Map<string, PackageBuildRecord>

  saveNodeRecord(generateId: string, nodeId: string, record: NodeBuildRecord): void
  saveEdgeRecord(generateId: string, edgeId: string, record: EdgeBuildRecord): void
  saveHotspotRecord(generateId: string, nodeId: string, record: HotspotBuildRecord): void
}

// ─── File Operations ───────────────────────────────────────

export interface FileRepository {
  writeJson(filePath: string, data: unknown): void
  readJson<T>(filePath: string): T | null
  writeFile(filePath: string, data: Buffer): void
  readFile(filePath: string): Buffer | null
  fileExists(filePath: string): boolean
  copyFile(src: string, dest: string): void
  ensureDir(dir: string): void
  deleteDir(dir: string): void
}

// ─── Unified Interface ─────────────────────────────────────

export interface Repository extends GuideRepository, GenerateRepository, FileRepository {}
