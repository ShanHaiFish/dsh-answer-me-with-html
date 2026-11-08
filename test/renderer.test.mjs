import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildOutputPath,
  normalizeConfig,
  parseAmOutput,
  renderDraft,
  sanitizeFileName,
} from '../lib/renderer.js'
import { nodeCandidates } from '../lib/node-runtime.js'
import { createToolDefinition } from '../lib/host.js'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

async function withTempDir(prefix, fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('renders a draft into the workspace output directory', async () => {
  await withTempDir('dsh-amh-render-', async (cwd) => {
    const config = normalizeConfig({})
    const result = await renderDraft({
      pluginRoot: projectRoot,
      cwd,
      config,
      draft: ['---', 'title: Test Page', '---', '## A One panel', 'Hello from the test.'].join('\n'),
      fileName: 'test-page',
    })

    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.title, 'Test Page')
    assert.ok(result.path && result.path.endsWith('test-page.html'))
    assert.ok(result.path.startsWith(path.join(cwd, '.dsh', 'answer-pages')))
    const html = await readFile(result.path, 'utf8')
    assert.match(html, /<html/i)
    assert.match(html, /Test Page/)
    assert.ok(existsSync(path.join(cwd, '.dsh', 'answer-pages-home', 'config.json')))
  })
})

test('reports draft errors with line numbers instead of writing a page', async () => {
  await withTempDir('dsh-amh-error-', async (cwd) => {
    const result = await renderDraft({
      pluginRoot: projectRoot,
      cwd,
      config: normalizeConfig({}),
      draft: ['---', 'title: Broken', '---', '## A Bad {span=2.5}', 'Text'].join('\n'),
      fileName: 'broken',
    })

    assert.equal(result.ok, false)
    assert.ok(result.errors.length > 0)
    assert.ok(result.errors.some((line) => line.includes('L4')), JSON.stringify(result.errors))
    assert.equal(existsSync(path.join(cwd, '.dsh', 'answer-pages', 'broken.html')), false)
  })
})

test('sanitizes file names and refuses to escape the output directory', () => {
  assert.equal(sanitizeFileName('../../evil'), 'evil')
  assert.equal(sanitizeFileName('TCP Handshake'), 'TCP-Handshake')
  assert.equal(sanitizeFileName('...'), undefined)
  assert.equal(sanitizeFileName('中文标题'), undefined)

  const outputDir = path.resolve(os.tmpdir(), 'amh-out')
  const full = buildOutputPath(outputDir, '../../evil', '')
  assert.equal(path.dirname(full), outputDir)
  assert.ok(path.basename(full).endsWith('.html'))
})

test('parses the renderer success, warning and error output', () => {
  const success = parseAmOutput(
    '✓ C:\\tmp\\page.html\n  sheet · blueprint · 1 panel\n  STE ✓ 0 warnings\n',
    '',
    0,
  )
  assert.equal(success.ok, true)
  assert.equal(success.path, 'C:\\tmp\\page.html')
  assert.deepEqual(success.warnings, [])

  const warned = parseAmOutput(
    '✓ /tmp/page.html\n  sheet · paper\n  STE 2 warnings (fix):\n  L5 [word] bad word\n',
    '',
    0,
  )
  assert.equal(warned.ok, true)
  assert.equal(warned.warnings.length, 2)

  const failed = parseAmOutput('✗ L4 Cannot parse the draft\n  draft: /tmp/draft.md\n', '', 1)
  assert.equal(failed.ok, false)
  assert.equal(failed.errors[0].startsWith('✗ L4'), true)
  assert.equal(failed.draftPath, '/tmp/draft.md')
})

test('rejects drafts over the configured byte limit', async () => {
  await withTempDir('dsh-amh-limit-', async (cwd) => {
    await assert.rejects(
      () =>
        renderDraft({
          pluginRoot: projectRoot,
          cwd,
          config: normalizeConfig({ maxDraftBytes: 1500 }),
          draft: 'x'.repeat(2000),
        }),
      /over the configured limit/,
    )
  })
})

test('resolves Node candidates and the tool definition', () => {
  const candidates = nodeCandidates({})
  assert.ok(candidates.length >= 1)
  assert.equal(typeof candidates[0].command, 'string')
  assert.ok(candidates.some((candidate) => candidate.command === 'node'))

  const config = normalizeConfig({})
  const tool = createToolDefinition({}, config)
  assert.equal(tool.name, 'answer_me_with_html')
  assert.equal(tool.parameters.required[0], 'draft')
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.execute, 'function')
})

test('ignores unknown config keys and validates known ones', () => {
  const config = normalizeConfig({ theme: 'paper', mode: 'dark', style: 'strict', alwaysOn: true, unknown: 1 })
  assert.equal(config.theme, 'paper')
  assert.equal(config.mode, 'dark')
  assert.equal(config.style, 'strict')
  assert.equal(config.alwaysOn, true)
  assert.equal('unknown' in config, false)
})

// Keep `writeFile` imported for future fixtures without failing lint-style checks.
void writeFile

