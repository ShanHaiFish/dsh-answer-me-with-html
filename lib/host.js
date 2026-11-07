/**
 * Host half of dsh-answer-me-with-html.
 *
 * Registers the `answer_me_with_html` tool. The tool renders a draft with the
 * bundled `am.mjs` renderer inside the session workspace and returns the page
 * path; the client half renders the card and opens the page in the Document
 * Preview. No browser is opened and no shell tool is involved.
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeConfig, renderDraft } from './renderer.js'

export const name = 'answer-me-with-html'

/** Services that must exist before this plugin mounts. */
export const inject = ['tools', 'workingDirectory']

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const ALWAYS_ON_TEXT = [
  'Whenever a reply gives the user a conclusion, summary, plan, comparison, review or explanation, even a short one,',
  'also create a page with the answer-me-with-html skill and end the reply with the page link.',
  'For everyday conclusions use a small page with 2-4 panels: one callout with the conclusion plus one table or one diagram.',
  'Skip casual chat, one- or two-sentence replies with no conclusion, pure command output, and requests for plain text.',
  'An internal report to another agent is not a user reply: return the findings it asked for and make no page unless the task explicitly asks for one.',
].join(' ')

/**
 * @typedef {ReturnType<typeof normalizeConfig>} PluginConfig
 */

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown> | undefined} rawConfig
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)

  ctx.tools.register(createToolDefinition(ctx, config))

  const systemPrompt = ctx.get('systemPrompt')
  if (config.alwaysOn && systemPrompt) {
    ctx.effect(() =>
      systemPrompt.section({
        name: 'answer-me-with-html:always-on',
        order: 9000,
        text: ALWAYS_ON_TEXT,
      }),
    )
  }
}

/**
 * Build the model-facing tool definition from a normalized config.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {PluginConfig} config
 */
export function createToolDefinition(ctx, config) {
  return {
    name: 'answer_me_with_html',
    description:
      'Render a one-page HTML answer from an extended-Markdown draft and write it inside the current session workspace. ' +
      'Use this instead of running the bundled am.mjs through a shell. Load the `answer-me-with-html` skill for the draft format, ' +
      'component syntax and writing rules. The page is never opened in a browser; the user opens it from the tool card or from the ' +
      'absolute path you link in your reply. Returns {ok, path, title, warnings, errors}; when ok is false, fix every error line and call again.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        draft: {
          type: 'string',
          description: 'The extended-Markdown draft. Write only content; do not write HTML, CSS or SVG by hand.',
        },
        file_name: {
          type: 'string',
          description:
            'Optional short ASCII file name such as "tcp-handshake". Reuse the same name to update that page in place. ' +
            'When omitted, the page name comes from the draft title or a timestamp.',
        },
        theme: {
          type: 'string',
          description: 'Optional one-page theme override: auto, blueprint, shadcn, paper, or an installed theme name.',
        },
        mode: {
          type: 'string',
          description: 'Optional one-page color mode: auto, light or dark.',
        },
        style: {
          type: 'string',
          description: 'Optional one-page writing check: 80 (warn), strict (refuse a failed draft) or off.',
        },
      },
      required: ['draft'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          path: { type: 'string' },
          title: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
          errors: { type: 'array', items: { type: 'string' } },
          hint: { type: 'string' },
          durationMs: { type: 'number' },
        },
        required: ['ok', 'warnings', 'errors'],
      },
      render(_args, value) {
        return [{ type: 'text', text: renderToolText(value) }]
      },
    },
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new Error('answer_me_with_html requires an agent session')
      }
      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      exec.signal.throwIfAborted()

      const result = await renderDraft({
        pluginRoot: PLUGIN_ROOT,
        cwd,
        config,
        draft: args.draft,
        fileName: args.file_name,
        theme: args.theme,
        mode: args.mode,
        style: args.style,
        signal: exec.signal,
      })

      return {
        ok: result.ok,
        ...(result.path === undefined ? {} : { path: result.path }),
        ...(result.title === undefined ? {} : { title: result.title }),
        warnings: result.warnings,
        errors: result.errors,
        ...(result.hint === undefined ? {} : { hint: result.hint }),
        durationMs: result.durationMs,
      }
    },
  }
}

/**
 * Human- and model-readable result text. The client card parses the first
 * lines of this text to render its title, path and status.
 *
 * @param {{ ok: boolean, path?: string, title?: string, warnings: string[], errors: string[], hint?: string, durationMs?: number }} value
 */
function renderToolText(value) {
  /** @type {string[]} */
  const lines = []
  if (value.ok) {
    lines.push(`Rendered page: ${value.path ?? ''}`)
    if (value.title) lines.push(`Title: ${value.title}`)
    lines.push(`Warnings: ${value.warnings.length}`)
    for (const warning of value.warnings.slice(0, 12)) lines.push(`- ${warning}`)
    if (value.hint) lines.push(`Hint: ${value.hint}`)
  } else {
    lines.push('Render failed.')
    if (value.errors.length === 0) lines.push('- The renderer failed without a diagnostic.')
    for (const error of value.errors) lines.push(error)
  }
  return lines.join('\n')
}
