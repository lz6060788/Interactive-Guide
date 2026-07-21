import fs from 'node:fs'
import path from 'node:path'

interface WorkspaceLockRecord {
  instanceId: string
  pid: number
  startedAt: string
}

export interface WorkspaceLock {
  instanceId: string
  path: string
  release(): void
}

export class WorkspaceInUseError extends Error {
  constructor(
    public readonly workspace: string,
    public readonly instanceId: string,
    public readonly pid: number,
  ) {
    super(`Workspace is already open by instance "${instanceId}" (pid ${pid}): ${workspace}`)
    this.name = 'WorkspaceInUseError'
  }
}

export function acquireWorkspaceLock(
  workspaceInput: string,
  instanceId: string,
  options: { isProcessAlive?: (pid: number) => boolean } = {},
): WorkspaceLock {
  const workspace = path.resolve(workspaceInput)
  const lockPath = path.join(workspace, '.guide-workbench.lock')
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive
  fs.mkdirSync(workspace, { recursive: true })

  const record: WorkspaceLockRecord = {
    instanceId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }

  try {
    const descriptor = fs.openSync(lockPath, 'wx')
    try {
      fs.writeFileSync(descriptor, JSON.stringify(record, null, 2))
    } finally {
      fs.closeSync(descriptor)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const owner = readLockRecord(lockPath)
    if (!owner || isProcessAlive(owner.pid)) {
      throw new WorkspaceInUseError(workspace, owner?.instanceId ?? 'unknown', owner?.pid ?? -1)
    }
    fs.unlinkSync(lockPath)
    return acquireWorkspaceLock(workspace, instanceId, options)
  }

  let released = false
  return {
    instanceId,
    path: lockPath,
    release() {
      if (released) return
      released = true
      const owner = readLockRecord(lockPath)
      if (owner?.instanceId === instanceId) fs.rmSync(lockPath, { force: true })
    },
  }
}

function readLockRecord(lockPath: string): WorkspaceLockRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<WorkspaceLockRecord>
    if (
      typeof parsed.instanceId !== 'string' ||
      typeof parsed.pid !== 'number' ||
      !Number.isInteger(parsed.pid) ||
      typeof parsed.startedAt !== 'string'
    ) {
      return null
    }
    return parsed as WorkspaceLockRecord
  } catch {
    return null
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}
