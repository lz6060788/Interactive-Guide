export interface PackageWorkbenchOptions {
  repoRoot?: string
  outputDir?: string
}

export interface PackageWorkbenchResult {
  archivePath: string
  checksumPath: string
  archiveSha256: string
  manifestSha256: string
  packageRoot: string
  version: string
  platform: NodeJS.Platform
  architecture: string
  fileCount: number
  dependencyCount: number
}

export function packageWorkbench(options?: PackageWorkbenchOptions): PackageWorkbenchResult
