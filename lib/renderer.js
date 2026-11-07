/**
 * Spawn the vendored `am.mjs` renderer and parse its output.
 *
 * The renderer is a CLI (a single bundled file). This module owns everything
 * around it: choosing the Node runtime, writing the draft to stdin, bounding
 * the run, sanitizing the output path, and turning the CLI's lines into a
 * structured result for the tool card.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nodeCandidates, rendererEnvironment } from './node-runtime.js'

export const DEFAULT_CONFIG = Object.freeze({
  outputDir: '',
  theme: 'auto',
  mode: 'auto',
  style: '80',
  alwaysOn: false,
  nodePath: '',
  maxDraftBytes: 200000,
  timeoutMs: 60000,
})

const ANSI = /\u001b\[[0-9;]*m/g
const MAX_FILENAME_LENGTH = 80

/**
 * Merge user configuration with defaults and validate the types we rely on.
 * Unknown keys are ignored so forward-compatible patches keep working.
 *
 * @param {Record<string, unknown> | undefined} raw
 */
export function normalizeConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  /** @type {Record<string, any>} */
  const config = { ...DEFAULT_CONFIG }

  if (typeof input.outputDir === 'string') config.outputDir = input.outputDir.trim()
  if (typeof input.nodePath === 'string') config.nodePath = input.nodePath.trim()
  if (typeof input.theme === 'string' && input.theme.trim() !== '') config.theme = input.theme.trim()
  if (typeof input.mode === 'string' && ['auto', 'light', 'dark'].includes(input.mode)) config.mode = input.mode
  if (typeof input.style === 'string' && ['off', '80', 'strict'].includes(input.style)) config.style = input.style
  else if (typeof input.style === 'number') config.style = String(input.style)
  if (typeof input.alwaysOn === 'boolean') config.alwaysOn = input.alwaysOn
  if (typeof input.maxDraftBytes === 'number' && Number.isFinite(input.maxDraftBytes) && input.maxDraftBytes > 1000) {
    config.maxDraftBytes = Math.floor(input.maxDraftBytes)
  }
  if (typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) && input.timeoutMs >= 5000) {
    config.timeoutMs = Math.floor(input.timeoutMs)
  }
  return config
}

/**
 * The directory that receives rendered pages.
 * An empty configured value means `<session cwd>/.dsh/answer-pages`.
 *
 * @param {string} cwd
 * @param {{ outputDir?: string }} config
 */
export function resolveOutputDir(cwd, config) {
  if (!config || typeof config.outputDir !== 'string' || config.outputDir.trim() === '') {
    return path.join(cwd, '.dsh', 'answer-pages')
  }
  return path.resolve(cwd, config.outputDir.trim())
}

/**
 * Turn the model-supplied file name into a safe single path segment.
 *
 * @param {string | undefined} input
 * @returns {string | undefined} `undefined` when no safe name is left.
 */
export function sanitizeFileName(input) {
  if (typeof input !== 'string') return undefined
  let name = input.trim()
  if (name.toLowerCase().endsWith('.html')) name = name.slice(0, -5)
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[-.]{2,}/g, '-')
    .replace(/[-.]+$/, '')
    .slice(0, MAX_FILENAME_LENGTH)
  return cleaned === '' ? undefined : cleaned
}

/**
 * @param {string} draft
 * @returns {string | undefined}
 */
export function titleOfDraft(draft) {
  if (typeof draft !== 'string') return undefined
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(draft)
  if (!frontmatter) return undefined
  const match = /^title:\s*(.+?)\s*$/m.exec(frontmatter[1])
  if (!match) return undefined
  const value = match[1].replace(/^["']|["']$/g, '').trim()
  return value === '' ? undefined : value
}

/**
 * Pick a deterministic output path for a page.
 *
 * @param {string} outputDir
 * @param {string | undefined} fileName
 * @param {string} draft
 * @returns {string}
 */
export function buildOutputPath(outputDir, fileName, draft) {
  const safe = sanitizeFileName(fileName) ?? sanitizeFileName(titleOfDraft(draft))
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const suffix = safe ?? `page-${stamp}`
  const full = path.resolve(outputDir, `${suffix}.html`)
  const relative = path.relative(path.resolve(outputDir), full)
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
    throw new Error('Refusing to write a page outside the configured output directory')
  }
  return full
}

/**
 * @param {string} stdout
 * @param {string} stderr
 * @param {number | null} exitCode
 */
export function parseAmOutput(stdout, stderr, exitCode) {
  const clean = (value) => String(value ?? '').replace(ANSI, '').replace(/\r\n/g, '\n')
  const lines = clean(stdout).split('\n')
  const stderrText = clean(stderr).trim()

  /** @type {string[]} */
  const errors = []
  /** @type {string[]} */
  const warnings = []
  let pagePath
  let draftPath
  let hint

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue

    if (trimmed.startsWith('✓')) {
      const found = trimmed.replace(/^✓\s*/, '').trim()
      if (found !== '') pagePath = found
      continue
    }
    if (trimmed.startsWith('✗')) {
      errors.push(trimmed)
      continue
    }
    if (trimmed.startsWith('!')) {
      hint = trimmed
      warnings.push(trimmed)
      continue
    }
    if (/^draft:\s+/i.test(trimmed)) {
      draftPath = trimmed.replace(/^draft:\s+/i, '')
      continue
    }
    if (/^\s{2,}STE\s+(.+?)\s+warnings?\b/i.test(line)) {
      if (!/\b0\s+warnings?/i.test(line)) warnings.push(trimmed)
      continue
    }
    if (/^\s{2,}code\s+(.+?)\s+warnings?\b/i.test(line)) {
      warnings.push(trimmed)
      continue
    }
    if (/^\s{2,}L\d+\s/.test(line)) {
      warnings.push(trimmed)
      continue
    }
  }

  if (stderrText !== '') {
    for (const line of stderrText.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      if (trimmed.startsWith('✗')) errors.push(trimmed)
      else if (exitCode !== 0 && errors.length === 0) errors.push(trimmed)
    }
  }

  return {
    ok: exitCode === 0 && typeof pagePath === 'string',
    path: pagePath,
    draftPath,
    hint,
    warnings,
    errors,
    exitCode,
  }
}

/**
 * @param {number | undefined} pid
 */
function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      return
    } catch {
      // fall through to the generic kill
    }
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // the process may already be gone
  }
}

/**
 * Run one candidate runtime. Resolves (never rejects) with the process outcome.
 *
 * @param {{
 *   candidate: import('./node-runtime.js').NodeCandidate,
 *   amPath: string,
 *   args: string[],
 *   cwd: string,
 *   env: NodeJS.ProcessEnv,
 *   draft: string,
 *   timeoutMs: number,
 *   signal?: AbortSignal,
 * }} options
 */
function runCandidate(options) {
  return new Promise((resolve) => {
    const { candidate, amPath, args, cwd, env, draft, timeoutMs, signal } = options
    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | undefined} */
    let child

    try {
      child = spawn(candidate.command, [amPath, ...args], {
        cwd,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ startError: true, error, code: -1, stdout: '', stderr: '' })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    /** @type {NodeJS.Timeout | undefined} */
    let timer
    /** @type {(() => void) | undefined} */
    let onAbort

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }

    const abort = (reason) => {
      killTree(child?.pid)
      finish({ code: -1, stdout, stderr, [reason]: true })
    }

    if (child.pid === undefined) {
      child.once('error', (error) => finish({ startError: true, error, code: -1, stdout, stderr }))
      return
    }

    timer = setTimeout(() => abort('timedOut'), timeoutMs)
    if (signal) {
      if (signal.aborted) {
        abort('aborted')
        return
      }
      onAbort = () => abort('aborted')
      signal.addEventListener('abort', onAbort, { once: true })
    }

    child.once('error', (error) => finish({ startError: true, error, code: -1, stdout, stderr }))
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 1_000_000) stderr += chunk.toString()
    })
    child.once('close', (code) => finish({ code, stdout, stderr }))
    child.stdin.on('error', () => {
      // EPIPE when the renderer exits before reading all input; the close
      // handler reports the real outcome.
    })
    child.stdin.end(draft)
  })
}

/**
 * Render one draft to a page inside the output directory.
 *
 * @param {{
 *   pluginRoot: string,
 *   cwd: string,
 *   config: ReturnType<typeof normalizeConfig>,
 *   draft: string,
 *   fileName?: string,
 *   theme?: string,
 *   mode?: string,
 *   style?: string,
 *   signal?: AbortSignal,
 * }} options
 */
export async function renderDraft(options) {
  const started = Date.now()
  const { pluginRoot, cwd, config, draft, fileName } = options
  const signal = options.signal

  if (typeof draft !== 'string' || draft.trim() === '') {
    throw new Error('answer_me_with_html requires a non-empty draft')
  }
  const draftBytes = Buffer.byteLength(draft, 'utf8')
  if (draftBytes > config.maxDraftBytes) {
    throw new Error(`The draft is ${draftBytes} bytes, over the configured limit of ${config.maxDraftBytes} bytes`)
  }

  const amPath = path.join(pluginRoot, 'skill', 'scripts', 'am.mjs')
  if (!existsSync(amPath)) {
    throw new Error(`The bundled renderer is missing: ${amPath}`)
  }

  const outputDir = resolveOutputDir(cwd, config)
  await mkdir(outputDir, { recursive: true })
  const outputPath = buildOutputPath(outputDir, fileName, draft)

  const amHome = path.join(cwd, '.dsh', 'answer-me-with-html')
  await mkdir(amHome, { recursive: true })
  const configPath = path.join(amHome, 'config.json')
  if (!existsSync(configPath)) {
    const seeded = {
      open: 'off',
      update_check: 'off',
      theme: config.theme,
      mode: config.mode,
      style: config.style,
    }
    await writeFile(configPath, `${JSON.stringify(seeded, null, 2)}\n`, 'utf8')
  }

  const theme = options.theme ?? config.theme
  const mode = options.mode ?? config.mode
  const style = options.style ?? config.style

  const args = ['render', '-', '--no-open', '-o', outputPath, '--style', String(style)]
  if (typeof theme === 'string' && theme.trim() !== '' && theme !== 'auto') args.push('--theme', theme.trim())
  if (mode === 'light' || mode === 'dark') args.push('--mode', mode)

  const candidates = nodeCandidates(config)
  let last = null
  let usedCandidate = null

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    const env = rendererEnvironment({
      ...candidate.env,
      AM_HOME: amHome,
      AM_NO_UPDATE_CHECK: '1',
      NO_COLOR: '1',
    })
    const outcome = await runCandidate({
      candidate,
      amPath,
      args,
      cwd,
      env,
      draft,
      timeoutMs: config.timeoutMs,
      signal,
    })

    if (outcome.startError) {
      last = outcome
      if (index < candidates.length - 1) continue
      throw new Error(
        `Cannot start a Node runtime for the renderer (${candidate.label}): ${outcome.error?.message ?? 'unknown error'}. ` +
          'Install Node.js 20+ or set the plugin config nodePath.',
      )
    }
    last = outcome
    usedCandidate = candidate.label
    break
  }

  const outcome = last ?? { code: -1, stdout: '', stderr: '' }
  const parsed = parseAmOutput(outcome.stdout, outcome.stderr, outcome.code)

  if (parsed.ok && parsed.path) {
    try {
      const info = await stat(parsed.path)
      if (!info.isFile() || info.size === 0) {
        parsed.ok = false
        parsed.errors.push(`The renderer reported ${parsed.path} but it is not a readable page`)
      }
    } catch (error) {
      parsed.ok = false
      parsed.errors.push(`The renderer reported ${parsed.path} but the file is missing: ${error.message}`)
    }
  }

  if (outcome.timedOut) {
    parsed.ok = false
    parsed.errors.push(`The renderer did not finish within ${config.timeoutMs} ms`)
  }
  if (outcome.aborted) {
    parsed.ok = false
    parsed.errors.push('The render was cancelled')
  }

  return {
    ok: parsed.ok,
    path: parsed.ok ? parsed.path : undefined,
    title: titleOfDraft(draft),
    warnings: parsed.warnings,
    errors: parsed.errors,
    hint: parsed.hint,
    durationMs: Date.now() - started,
    candidate: usedCandidate ?? 'unknown',
  }
}
