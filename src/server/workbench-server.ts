import crypto from 'node:crypto'
import http, { type Server } from 'node:http'
import path from 'node:path'
import { createWorkbenchApp } from './app.js'

export interface StartWorkbenchServerOptions {
  instanceId?: string
  workspace: string
  adminDir?: string
  corsOrigin?: string
  port?: number
}

export interface RunningWorkbench {
  instanceId: string
  host: '127.0.0.1'
  port: number
  workspace: string
  uiUrl: string
  apiUrl: string
  server: Server
  close(): Promise<void>
}

/** Listen only on loopback; port 0 delegates collision-free selection to the OS. */
export async function startWorkbenchServer(
  options: StartWorkbenchServerOptions,
): Promise<RunningWorkbench> {
  const host = '127.0.0.1' as const
  const workspace = path.resolve(options.workspace)
  const app = createWorkbenchApp({
    dataDir: workspace,
    adminDir: options.adminDir,
    corsOrigin: options.corsOrigin,
  })
  const server = http.createServer(app)

  await listen(server, host, options.port ?? 0)
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Workbench server did not expose a TCP address')
  }

  const port = address.port
  const uiUrl = `http://${host}:${port}`
  let closed = false
  return {
    instanceId: options.instanceId ?? crypto.randomUUID(),
    host,
    port,
    workspace,
    uiUrl,
    apiUrl: `${uiUrl}/api`,
    server,
    async close() {
      if (closed) return
      closed = true
      await closeServer(server)
    },
  }
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen({ host, port })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
