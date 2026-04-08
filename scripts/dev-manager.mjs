import { openSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmpDir = resolve(rootDir, 'tmp', 'dev')
const statePath = resolve(tmpDir, 'state.json')
const frontendLogPath = resolve(tmpDir, 'frontend.log')
const frontendErrorPath = resolve(tmpDir, 'frontend.err.log')
const backendLogPath = resolve(tmpDir, 'assistant.log')
const backendErrorPath = resolve(tmpDir, 'assistant.err.log')

const frontendPort = 5175
const backendPort = 8787
const frontendUrl = `http://localhost:${frontendPort}`
const backendUrl = `http://127.0.0.1:${backendPort}`
const backendHealthUrl = `${backendUrl}/health`
const nodeCmd = process.execPath
const viteCliPath = resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const tsxCliPath = resolve(rootDir, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs')

function ensureTmpDir() {
  mkdirSync(tmpDir, { recursive: true })
}

function resetLogs() {
  for (const filePath of [frontendLogPath, frontendErrorPath, backendLogPath, backendErrorPath]) {
    rmSync(filePath, { force: true })
  }
}

function normalizeEnv(sourceEnv, overrides = {}) {
  const merged = { ...sourceEnv, ...overrides }

  if (process.platform === 'win32') {
    const pathValue = sourceEnv.Path ?? sourceEnv.PATH ?? merged.Path ?? merged.PATH ?? ''

    for (const key of Object.keys(merged)) {
      if (key !== 'PATH' && key.toUpperCase() === 'PATH') {
        delete merged[key]
      }
    }

    merged.PATH = pathValue
  }

  return merged
}

function readState() {
  if (!existsSync(statePath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function writeState(state) {
  ensureTmpDir()
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function clearState() {
  rmSync(statePath, { force: true })
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
}

function unique(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}

function escapeForPowerShellLike(value) {
  return value.replace(/'/g, "''")
}

function findProjectProcessPids() {
  if (process.platform === 'win32') {
    const escapedRoot = escapeForPowerShellLike(rootDir)
    const command = [
      "$root = '" + escapedRoot + "'",
      "Get-CimInstance Win32_Process",
      "| Where-Object {",
      "  $_.Name -eq 'node.exe' -and $_.ProcessId -ne " + process.pid + " -and $_.CommandLine -and $_.CommandLine -like ('*' + $root + '*') -and $_.CommandLine -notlike '*dev-manager.mjs*'",
      "}",
      "| Select-Object -ExpandProperty ProcessId"
    ].join(' ')

    const result = runCommand('powershell.exe', ['-NoProfile', '-Command', command])
    return unique(
      `${result.stdout ?? ''}`
        .split(/\r?\n/)
        .map((value) => Number(value.trim()))
    )
  }

  const result = runCommand('ps', ['-ax', '-o', 'pid=,command='])
  return unique(
    `${result.stdout ?? ''}`
      .split(/\r?\n/)
      .filter((line) => line.includes(rootDir) && !line.includes('dev-manager.mjs'))
      .map((line) => Number(line.trim().split(/\s+/, 1)[0]))
  )
}

function findListeningPids(port) {
  if (process.platform === 'win32') {
    const result = runCommand('netstat', ['-ano', '-p', 'tcp'])
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const lines = output.split(/\r?\n/)
    const pids = []

    for (const line of lines) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
        continue
      }

      const parts = line.trim().split(/\s+/)
      const pid = Number(parts.at(-1))
      if (Number.isInteger(pid) && pid > 0) {
        pids.push(pid)
      }
    }

    return unique(pids)
  }

  const result = runCommand('lsof', ['-ti', `tcp:${port}`])
  return unique(
    `${result.stdout ?? ''}`
      .split(/\r?\n/)
      .map((value) => Number(value.trim()))
  )
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  if (process.platform === 'win32') {
    const result = runCommand('tasklist', ['/FI', `PID eq ${pid}`])
    return (result.stdout ?? '').includes(`${pid}`)
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return
  }

  if (process.platform === 'win32') {
    runCommand('taskkill', ['/PID', String(pid), '/F', '/T'])
    return
  }

  runCommand('kill', ['-TERM', String(pid)])
}

function stopKnownProcesses() {
  const state = readState()
  const trackedPids = state ? [state.frontendPid, state.backendPid] : []
  const portPids = [...findListeningPids(frontendPort), ...findListeningPids(backendPort)]
  const projectPids = findProjectProcessPids()

  for (const pid of unique([...trackedPids, ...portPids, ...projectPids])) {
    killPid(pid)
  }

  clearState()
}

function spawnDetachedProcess({ command, args, cwd, env, stdoutPath, stderrPath }) {
  ensureTmpDir()

  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: [
      'ignore',
      openSync(stdoutPath, 'a'),
      openSync(stderrPath, 'a')
    ],
    windowsHide: true
  })

  child.unref()
  return child
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function waitForPortToClear(port, timeoutMs = 10_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (findListeningPids(port).length === 0) {
      return
    }

    await sleep(250)
  }

  throw new Error(`Port ${port} is still occupied after ${timeoutMs / 1000}s.`)
}

async function waitForService({ name, url, pid, validate, timeoutMs = 30_000 }) {
  const startedAt = Date.now()
  let lastError = 'service did not respond'

  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidAlive(pid)) {
      throw new Error(`${name} exited before becoming ready.`)
    }

    try {
      const response = await fetch(url)
      const body = await response.text()

      if (validate(response, body)) {
        return
      }

      lastError = `${name} returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await sleep(500)
  }

  throw new Error(`${name} did not become ready within ${timeoutMs / 1000}s (${lastError}).`)
}

function tailFile(filePath, maxLines = 30) {
  if (!existsSync(filePath)) {
    return '(no log yet)'
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
  const tail = lines.slice(-maxLines)
  return tail.length ? tail.join('\n') : '(no log yet)'
}

function printLogs() {
  console.log(`[frontend] ${frontendLogPath}`)
  console.log(tailFile(frontendLogPath))
  console.log('')
  console.log(`[frontend:stderr] ${frontendErrorPath}`)
  console.log(tailFile(frontendErrorPath))
  console.log('')
  console.log(`[assistant] ${backendLogPath}`)
  console.log(tailFile(backendLogPath))
  console.log('')
  console.log(`[assistant:stderr] ${backendErrorPath}`)
  console.log(tailFile(backendErrorPath))
}

function getStatus() {
  const state = readState()
  const frontendPids = findListeningPids(frontendPort)
  const backendPids = findListeningPids(backendPort)
  const projectPids = findProjectProcessPids()

  return {
    state,
    frontendPids,
    backendPids,
    projectPids,
    frontendAlive: state ? isPidAlive(state.frontendPid) : false,
    backendAlive: state ? isPidAlive(state.backendPid) : false
  }
}

async function probeHttp(url, validator) {
  try {
    const response = await fetch(url)
    const body = await response.text()
    return validator(response, body) ? 'ready' : `unexpected:${response.status}`
  } catch {
    return 'down'
  }
}

async function printStatus() {
  const status = getStatus()
  const frontendHttp = await probeHttp(frontendUrl, (response, body) => response.ok && body.includes('/@vite/client'))
  const backendHttp = await probeHttp(backendHealthUrl, (response, body) => response.ok && body.includes('"status":"ok"'))

  console.log(`frontend_url=${frontendUrl}`)
  console.log(`backend_url=${backendUrl}`)
  console.log(`frontend_http=${frontendHttp}`)
  console.log(`backend_http=${backendHttp}`)
  console.log(`frontend_port=${frontendPort}`)
  console.log(`backend_port=${backendPort}`)
  console.log(`frontend_listening=${status.frontendPids.join(',') || 'none'}`)
  console.log(`backend_listening=${status.backendPids.join(',') || 'none'}`)
  console.log(`project_node_pids=${status.projectPids.join(',') || 'none'}`)
  console.log(`state_file=${existsSync(statePath) ? statePath : 'missing'}`)
  console.log(`frontend_managed=${status.state?.frontendManaged ?? 'unknown'}`)
  console.log(`frontend_pid=${status.state?.frontendPid ?? 'unknown'}`)
  console.log(`backend_pid=${status.state?.backendPid ?? 'unknown'}`)
  console.log(`logs_dir=${tmpDir}`)
}

function persistState(frontendPid, backendPid, frontendManaged = true) {
  writeState({
    startedAt: new Date().toISOString(),
    frontendPid: frontendPid ?? null,
    backendPid: backendPid ?? null,
    frontendManaged,
    frontendUrl,
    backendUrl,
    logDir: tmpDir
  })
}

async function isReusableFrontend() {
  try {
    const response = await fetch(frontendUrl)
    const body = await response.text()
    return response.ok && body.includes('/@vite/client')
  } catch {
    return false
  }
}

async function startFrontendWithRetries(frontendEnv, backendPid) {
  let lastError = null

  if (await isReusableFrontend()) {
    persistState(null, backendPid, false)
    return null
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    rmSync(frontendLogPath, { force: true })
    rmSync(frontendErrorPath, { force: true })
    await waitForPortToClear(frontendPort)

    const frontendProcess = spawnDetachedProcess({
      command: nodeCmd,
      args: [viteCliPath, '--port', String(frontendPort), '--strictPort'],
      cwd: rootDir,
      env: frontendEnv,
      stdoutPath: frontendLogPath,
      stderrPath: frontendErrorPath
    })

    persistState(frontendProcess.pid, backendPid)

    try {
      await waitForService({
        name: 'frontend',
        url: frontendUrl,
        pid: frontendProcess.pid,
        validate: (response) => response.ok
      })

      return frontendProcess
    } catch (error) {
      lastError = error
      killPid(frontendProcess.pid)

      const stderrTail = tailFile(frontendErrorPath, 10)
      if (await isReusableFrontend()) {
        persistState(null, backendPid, false)
        return null
      }

      const isPortConflict = stderrTail.includes(`Port ${frontendPort} is already in use`)
      if (!isPortConflict || attempt === 5) {
        throw error
      }

      await sleep(1000)
    }
  }

  throw lastError ?? new Error('Frontend failed to start.')
}

async function startServices() {
  stopKnownProcesses()
  resetLogs()
  await waitForPortToClear(backendPort)

  const frontendEnv = normalizeEnv(process.env, {
    BROWSER: 'none'
  })

  const backendEnv = normalizeEnv(process.env, {
    FRONTEND_ORIGIN: `${frontendUrl},http://127.0.0.1:${frontendPort}`,
    LLM_APP_URL: frontendUrl,
    PORT: String(backendPort)
  })

  const backendProcess = spawnDetachedProcess({
    command: nodeCmd,
    args: [tsxCliPath, 'watch', 'src/server.ts'],
    cwd: resolve(rootDir, 'server'),
    env: backendEnv,
    stdoutPath: backendLogPath,
    stderrPath: backendErrorPath
  })

  persistState(null, backendProcess.pid)

  try {
    await waitForService({
      name: 'assistant',
      url: backendHealthUrl,
      pid: backendProcess.pid,
      validate: (response, body) => response.ok && body.includes('"status":"ok"')
    })

    const frontendProcess = await startFrontendWithRetries(frontendEnv, backendProcess.pid)
    persistState(frontendProcess?.pid ?? null, backendProcess.pid, Boolean(frontendProcess))
  } catch (error) {
    stopKnownProcesses()
    console.error(error instanceof Error ? error.message : String(error))
    console.error('Startup logs:')
    printLogs()
    process.exitCode = 1
    return
  }

  console.log(`frontend=${frontendUrl}`)
  console.log(`assistant=${backendUrl}`)
  console.log(`logs=${tmpDir}`)
  console.log('status=ready')
}

function stopServices() {
  stopKnownProcesses()
  console.log('status=stopped')
}

function printHelp() {
  console.log('Usage: node scripts/dev-manager.mjs <up|down|status|logs>')
}

async function main() {
  const command = process.argv[2] ?? 'status'

  switch (command) {
    case 'up':
      await startServices()
      break
    case 'down':
      stopServices()
      break
    case 'status':
      await printStatus()
      break
    case 'logs':
      printLogs()
      break
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      printHelp()
      process.exitCode = 1
  }
}

await main()
