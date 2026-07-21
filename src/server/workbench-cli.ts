#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTOMATION_PROTOCOL_VERSION,
  WORKBENCH_VERSION,
  getWorkbenchCapabilities,
} from './routes/automation.js'
import { startWorkbenchServer, type RunningWorkbench } from './workbench-server.js'
import { acquireWorkspaceLock, WorkspaceInUseError } from './workspace-lock.js'

export type WorkbenchCliArgs =
  | { command: 'handshake'; client?: string; json: boolean }
  | { command: 'start'; workspace: string; port: number; adminDir: string; json: boolean }

export interface WorkbenchCliIo {
  stdout(value: string): void
  stderr(value: string): void
}

class CliUsageError extends Error {
  readonly code = 'INVALID_ARGUMENT'
}

export function parseWorkbenchCliArgs(args: string[]): WorkbenchCliArgs {
  const command = args[0]
  if (command === 'handshake') {
    let client: string | undefined
    let json = false
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '--json') json = true
      else if (arg === '--client') client = requiredValue(args, ++index, '--client')
      else throw new CliUsageError(`unknown handshake argument: ${arg}`)
    }
    return { command, ...(client ? { client } : {}), json }
  }

  if (command === 'start') {
    let workspace: string | undefined
    let adminDir = defaultAdminDir()
    let port = 0
    let json = false
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '--json') json = true
      else if (arg === '--workspace') {
        workspace = path.resolve(requiredValue(args, ++index, '--workspace'))
      } else if (arg === '--admin-dir') {
        adminDir = path.resolve(requiredValue(args, ++index, '--admin-dir'))
      } else if (arg === '--port') {
        port = parsePort(requiredValue(args, ++index, '--port'))
      } else {
        throw new CliUsageError(`unknown start argument: ${arg}`)
      }
    }
    if (!workspace) throw new CliUsageError('--workspace is required')
    return { command, workspace, port, adminDir, json }
  }

  throw new CliUsageError('command must be "handshake" or "start"')
}

export async function executeWorkbenchCli(
  args: string[],
  io: WorkbenchCliIo = processIo,
): Promise<number> {
  const parsed = parseWorkbenchCliArgs(args)
  if (parsed.command === 'handshake') {
    writeResult(io, parsed.json, {
      ok: true,
      protocolVersion: AUTOMATION_PROTOCOL_VERSION,
      data: getWorkbenchCapabilities(),
    })
    return 0
  }

  const instanceId = crypto.randomUUID()
  const lock = acquireWorkspaceLock(parsed.workspace, instanceId)
  let running: RunningWorkbench
  try {
    running = await startWorkbenchServer({
      instanceId,
      workspace: parsed.workspace,
      adminDir: parsed.adminDir,
      port: parsed.port,
    })
  } catch (error) {
    lock.release()
    throw error
  }

  writeResult(io, parsed.json, {
    ok: true,
    protocolVersion: AUTOMATION_PROTOCOL_VERSION,
    data: {
      instanceId: running.instanceId,
      pid: process.pid,
      host: running.host,
      port: running.port,
      workspace: running.workspace,
      uiUrl: running.uiUrl,
      apiUrl: running.apiUrl,
      capabilitiesUrl: `${running.apiUrl}/automation/v1/capabilities`,
      workbenchVersion: WORKBENCH_VERSION,
    },
  })

  try {
    await waitForShutdown(running, io)
  } finally {
    lock.release()
  }
  return 0
}

function parsePort(value: string): number {
  if (value === 'auto') return 0
  if (!/^\d+$/.test(value)) {
    throw new CliUsageError('port must be auto or an integer from 1 to 65535')
  }
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliUsageError('port must be auto or an integer from 1 to 65535')
  }
  return port
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new CliUsageError(`${option} requires a value`)
  return value
}

function defaultAdminDir(): string {
  return fileURLToPath(new URL('../admin', import.meta.url))
}

function writeResult(io: WorkbenchCliIo, json: boolean, value: unknown): void {
  io.stdout(JSON.stringify(value, null, json ? undefined : 2))
}

async function waitForShutdown(running: RunningWorkbench, io: WorkbenchCliIo): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stopping = false
    const stop = (signal: NodeJS.Signals) => {
      if (stopping) return
      stopping = true
      io.stderr(`[guide-workbench] ${signal} received; stopping ${running.instanceId}`)
      void running.close().then(resolve, reject)
    }
    const onSigint = () => stop('SIGINT')
    const onSigterm = () => stop('SIGTERM')
    const onClose = () => resolve()
    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
    running.server.once('close', onClose)
    const cleanup = () => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      running.server.off('close', onClose)
    }
    running.server.once('close', cleanup)
  })
}

function classifyError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof CliUsageError) return { code: error.code, message }
  if (error instanceof WorkspaceInUseError) return { code: 'WORKSPACE_IN_USE', message }
  if (/Admin build is missing/.test(message)) return { code: 'ADMIN_BUILD_MISSING', message }
  if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE')
    return { code: 'PORT_IN_USE', message }
  return { code: 'START_FAILED', message }
}

const processIo: WorkbenchCliIo = {
  stdout: value => process.stdout.write(`${value}\n`),
  stderr: value => process.stderr.write(`${value}\n`),
}

export async function runWorkbenchCli(
  args: string[] = process.argv.slice(2),
  io: WorkbenchCliIo = processIo,
): Promise<void> {
  try {
    process.exitCode = await executeWorkbenchCli(args, io)
  } catch (error) {
    const result = { ok: false, error: classifyError(error) }
    if (args.includes('--json')) io.stdout(JSON.stringify(result))
    else io.stderr(result.error.message)
    process.exitCode = 1
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMainModule()) void runWorkbenchCli()
