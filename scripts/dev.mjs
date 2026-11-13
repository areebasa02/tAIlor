import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const processes = [
  spawn(process.execPath, ["server/server.mjs"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(pnpm, ["exec", "vite"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
]

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of processes) {
    if (!child.killed) child.kill()
  }
  process.exitCode = code
}

for (const child of processes) {
  child.on("error", () => shutdown(1))
  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code !== 0 || signal)) shutdown(code || 1)
  })
}

process.on("SIGINT", () => shutdown())
process.on("SIGTERM", () => shutdown())
