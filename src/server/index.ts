// ============================================================
// Interactive Guide - Server Entry Point
// ============================================================
// Wires up: config → repository → services → routes → middleware
// Graceful shutdown on SIGTERM/SIGINT.

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { startWorkbenchServer } from './workbench-server.js'

const config = loadConfig()

const builtAdminDir = path.resolve('dist/admin')
const adminDir = fs.existsSync(path.join(builtAdminDir, 'index.html')) ? builtAdminDir : undefined
const running = await startWorkbenchServer({
  workspace: config.DATA_DIR,
  adminDir,
  corsOrigin: config.CORS_ORIGIN,
  port: config.PORT,
})
console.log(`[Interactive-Guide] Workbench running on ${running.uiUrl}`)

// ─── Graceful Shutdown ────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n[Interactive-Guide] ${signal} received, shutting down...`)
  void running.close().then(() => {
    console.log('[Interactive-Guide] Server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Interactive-Guide] Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
