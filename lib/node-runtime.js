/**
 * Resolve the Node.js executable used to run the vendored `am.mjs` renderer.
 *
 * Order:
 *   1. an explicit `nodePath` from the plugin config;
 *   2. the current process when it is a Node runtime (dsh web / CLI);
 *   3. this executable with ELECTRON_RUN_AS_NODE=1 when dsh runs under Electron
 *      (DSH Desktop), so the renderer needs no user-installed Node;
 *   4. `node` from PATH as the last resort.
 *
 * Candidates are tried in order; a candidate that cannot start the process is
 * skipped. A candidate that starts but exits non-zero is reported to the caller,
 * because that is usually a draft error, not a missing runtime.
 */

/**
 * @typedef {{ command: string, env: Record<string, string>, label: string }} NodeCandidate
 */

/**
 * @param {{ nodePath?: string }} [config]
 * @returns {NodeCandidate[]}
 */
export function nodeCandidates(config = {}) {
  /** @type {NodeCandidate[]} */
  const candidates = []
  const seen = new Set()

  /** @param {NodeCandidate} candidate */
  const push = (candidate) => {
    const key = `${candidate.command}\u0000${candidate.env.ELECTRON_RUN_AS_NODE ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(candidate)
  }

  const configured = typeof config.nodePath === 'string' ? config.nodePath.trim() : ''
  if (configured) push({ command: configured, env: {}, label: 'config.nodePath' })

  if (process.versions && process.versions.electron) {
    // Electron can run its bundled Node.js when this flag is set. It is the
    // only runtime guaranteed to exist in DSH Desktop.
    push({ command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' }, label: 'electron-as-node' })
  } else {
    push({ command: process.execPath, env: {}, label: 'process.execPath' })
  }

  push({ command: 'node', env: {}, label: 'PATH node' })

  return candidates
}

/**
 * Build the environment for one renderer process: inherit the host environment
 * but never leak ELECTRON_RUN_AS_NODE into a plain `node` run.
 *
 * @param {Record<string, string>} extra
 * @returns {NodeJS.ProcessEnv}
 */
export function rendererEnvironment(extra = {}) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return { ...env, ...extra }
}
