import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

function readLocalEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(root, ".env"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match && !env[match[1]]) {
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "")
      }
    }
  } catch {
    // Ignore missing .env
  }
  return env
}

function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const done = (up) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(up)
    }
    socket.setTimeout(600)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
  })
}

const env = readLocalEnv()
const llmUrl = env.LLM_BASE_URL || env.LLM_VISION_BASE_URL || env.LLM_TEXT_BASE_URL || "http://127.0.0.1:8000/v1"
const usesLocalAiPort = /^https?:\/\/(127\.0\.0\.1|localhost):8000(\/|$)/i.test(llmUrl)
const venvPython = process.platform === "win32"
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python")

const viteBin = join(root, "node_modules", "vite", "bin", "vite.js")
const serverAlreadyUp = await isPortListening(Number(env.PORT || 8787))

const coreProcesses = [
  existsSync(viteBin)
    ? spawn(process.execPath, [viteBin], {
        cwd: root,
        stdio: "inherit",
      })
    : spawn(pnpm, ["exec", "vite"], {
        cwd: root,
        stdio: "inherit",
        shell: process.platform === "win32",
      }),
]

if (serverAlreadyUp) {
  console.log(`Node API server (server/server.mjs) is already listening on http://127.0.0.1:${env.PORT || 8787}.`)
} else {
  coreProcesses.unshift(
    spawn(process.execPath, ["server/server.mjs"], {
      cwd: root,
      stdio: "inherit",
    }),
  )
}

const allProcesses = [...coreProcesses]

if (usesLocalAiPort && !env.TAILOR_EXTERNAL_AI_SERVER && existsSync(venvPython) && existsSync(join(root, "colab_server.py"))) {
  const alreadyUp = await isPortListening(8000)
  if (alreadyUp) {
    console.log("Local AI server (colab_server.py) is already listening on http://127.0.0.1:8000.")
  } else {
    console.log("Starting local AI GPU server (colab_server.py) on http://127.0.0.1:8000...")
    const aiChild = spawn(venvPython, ["-u", "colab_server.py"], {
      cwd: root,
      stdio: "inherit",
      env: { ...env, HF_HUB_DISABLE_XET: env.HF_HUB_DISABLE_XET || "1" },
    })
    allProcesses.push(aiChild)
    aiChild.on("error", (err) => {
      if (!shuttingDown) {
        console.error("Failed to start local AI server (colab_server.py):", err?.message || err)
      }
    })
    aiChild.on("exit", (code, signal) => {
      if (!shuttingDown && (code !== 0 || signal)) {
        console.error(
          `Local AI server (colab_server.py) exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "none"}). Web UI and Node proxy remain running.`
        )
      }
    })
  }
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of allProcesses) {
    if (!child.killed && child.exitCode === null && child.signalCode === null) {
      child.kill()
    }
  }
  process.exitCode = code
}

for (const child of coreProcesses) {
  child.on("error", () => shutdown(1))
  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code !== 0 || signal)) shutdown(code || 1)
  })
}

process.on("SIGINT", () => shutdown())
process.on("SIGTERM", () => shutdown())
