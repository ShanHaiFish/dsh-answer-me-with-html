#!/usr/bin/env node
/**
 * Sync the vendored renderer resources from Answer me with HTML.
 *
 * The local `skill/SKILL.md` is a DSH-adapted copy and is never overwritten by
 * this script. Everything the skill needs at runtime besides its instructions
 * (the CLI bundle, references and licenses) comes from the pinned upstream tag.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs [tag]
 *
 * Default tag: v0.5.11
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/QingYunA/answer-me-with-html.git'
const DEFAULT_TAG = 'v0.5.11'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(scriptsDir)
const skillDir = path.join(projectRoot, 'skill')
const versionFile = path.join(skillDir, 'UPSTREAM_VERSION')

const tag = process.argv[2] ?? DEFAULT_TAG
const previousVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : '(none)'
const tempDir = mkdtempSync(path.join(tmpdir(), 'answer-me-with-html-sync-'))

try {
  console.log(`[sync] cloning ${REPO} at ${tag} ...`)
  execFileSync('git', ['clone', '--depth', '1', '--branch', tag, REPO, tempDir], { stdio: 'inherit' })

  const upstreamSkill = path.join(tempDir, 'skills', 'answer-me-with-html')
  if (!existsSync(upstreamSkill)) {
    throw new Error(`Upstream tag ${tag} does not contain skills/answer-me-with-html`)
  }

  mkdirSync(skillDir, { recursive: true })
  // Keep the DSH-adapted SKILL.md; replace the runtime resources.
  for (const entry of ['scripts', 'references', 'licenses']) {
    const source = path.join(upstreamSkill, entry)
    if (!existsSync(source)) continue
    const target = path.join(skillDir, entry)
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
    console.log(`[sync] updated skill/${entry}`)
  }

  cpSync(path.join(tempDir, 'LICENSE'), path.join(projectRoot, 'LICENSE-answer-me-with-html'))
  writeFileSync(versionFile, `${tag}\n`, 'utf8')

  console.log(`[sync] ${previousVersion} -> ${tag}`)
  console.log('[sync] skill/SKILL.md was not changed. Review upstream SKILL.md manually when it changes.')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
