/**
 * Client half of dsh-answer-me-with-html.
 *
 * Registers a card for the `answer_me_with_html` tool inside
 * `tool.call.toolview`. The card shows the page title, warnings and errors,
 * and opens the rendered page in the right Sidebar Document Preview through
 * the owner's `openFile` callback.
 *
 * This file is a browser bundle loaded through `window.__ModuleLoader__`; it
 * must stay plain JavaScript (no JSX, no imports, React from the module table).
 */

window.__ModuleLoader__.load({
  id: 'dsh-answer-me-with-html',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const TEXT = {
      en: {
        preparing: 'Preparing HTML answer…',
        rendering: 'Rendering HTML answer…',
        failed: 'Render failed',
        open: 'Open page',
        warnings: (n) => `${n} warning${n === 1 ? '' : 's'}`,
        titleFallback: 'HTML answer',
        unknown: 'The renderer returned no diagnostics.',
      },
      zh: {
        preparing: '正在准备 HTML 回答…',
        rendering: '正在渲染 HTML 回答…',
        failed: '渲染失败',
        open: '打开页面',
        warnings: (n) => `${n} 条警告`,
        titleFallback: 'HTML 回答',
        unknown: '渲染器没有返回诊断信息。',
      },
    }

    const locale = (() => {
      try {
        const language = typeof navigator !== 'undefined' && navigator.language ? navigator.language : ''
        return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'en'
      }
    })()

    const t = TEXT[locale]

    /** @param {unknown} block */
    function resultText(block) {
      const content =
        block && typeof block === 'object' && Array.isArray(block.content) ? block.content : []
      return content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
    }

    /**
     * Parse the tool's stable text format. Kept intentionally simple: the host
     * owns the format, and unknown lines are ignored.
     *
     * @param {string} text
     */
    function parseResult(text) {
      const lines = text.split(/\r?\n/)
      const result = {
        ok: false,
        path: undefined,
        title: undefined,
        warnings: [],
        errors: [],
      }

      const pathMatch = /^Rendered page:\s*(.+)$/m.exec(text)
      if (pathMatch) {
        result.path = pathMatch[1].trim()
        result.ok = true
      }
      const titleMatch = /^Title:\s*(.+)$/m.exec(text)
      if (titleMatch) result.title = titleMatch[1].trim()

      if (!result.ok) {
        result.errors = lines
          .map((line) => line.trim())
          .filter((line) => line.startsWith('- ') || line.startsWith('✗'))
          .map((line) => line.replace(/^-\s*/, ''))
        if (result.errors.length === 0 && text.trim() !== '') {
          result.errors = [text.trim()]
        }
        return result
      }

      let collectingWarnings = false
      for (const raw of lines) {
        const line = raw.trim()
        if (/^Warnings:\s*\d+/.test(line)) {
          collectingWarnings = true
          continue
        }
        if (line.startsWith('Hint:')) {
          collectingWarnings = false
          continue
        }
        if (collectingWarnings && line.startsWith('- ')) {
          result.warnings.push(line.slice(2).trim())
        }
      }
      return result
    }

    /** @param {any} props */
    function AnswerCard(props) {
      const { phase, block, openFile } = props
      const isZh = locale === 'zh'

      const baseStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        border: '1px solid rgba(127,127,127,0.35)',
        borderRadius: '10px',
        color: 'inherit',
        fontSize: '13px',
        lineHeight: '1.5',
        background: 'transparent',
      }

      if (phase === 'preparing' || phase === 'start') {
        const draft = block && block.args ? block.args.text('draft') : undefined
        const title = draft ? titleOfDraft(draft) : undefined
        return h(
          'div',
          { style: baseStyle, 'data-amh-phase': phase },
          h(Header, { title: title ?? t.titleFallback, subtitle: phase === 'preparing' ? t.preparing : t.rendering, isZh }),
        )
      }

      if (phase !== 'result') {
        return null
      }

      const text = resultText(block)
      const parsed = parseResult(text)
      const isError = Boolean(block && block.isError)

      if (!parsed.ok || isError) {
        const errorText =
          parsed.errors.length > 0
            ? parsed.errors.join('\n')
            : block && block.error && block.error.reason
              ? block.error.reason
              : t.unknown
        return h(
          'div',
          { style: baseStyle, 'data-amh-phase': 'result', 'data-amh-ok': 'false' },
          h(Header, { title: t.titleFallback, subtitle: t.failed, isZh, error: true }),
          h(
            'pre',
            {
              style: {
                margin: 0,
                padding: '6px 8px',
                borderRadius: '6px',
                background: 'rgba(127,127,127,0.10)',
                color: 'var(--dsw-alias-label-danger, #c0392b)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
                fontSize: '12px',
                maxHeight: '180px',
                overflow: 'auto',
              },
            },
            errorText,
          ),
        )
      }

      const styleLabel =
        parsed.warnings.length > 0
          ? t.warnings(parsed.warnings.length)
          : isZh
            ? '已生成'
            : 'Rendered'

      return h(
        'div',
        { style: baseStyle, 'data-amh-phase': 'result', 'data-amh-ok': 'true' },
        h(Header, { title: parsed.title ?? t.titleFallback, subtitle: styleLabel, isZh }),
        h(
          'div',
          {
            style: {
              fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
              fontSize: '11px',
              opacity: 0.7,
              wordBreak: 'break-all',
            },
            title: parsed.path,
          },
          parsed.path,
        ),
        parsed.warnings.length > 0
          ? h(
              'ul',
              { style: { margin: 0, paddingLeft: '18px', fontSize: '12px', opacity: 0.85 } },
              parsed.warnings.slice(0, 4).map((warning, index) => h('li', { key: index }, warning)),
            )
          : null,
        h(
          'div',
          { style: { display: 'flex', gap: '8px', marginTop: '2px' } },
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                if (typeof openFile === 'function') openFile(parsed.path)
              },
              style: {
                cursor: 'pointer',
                border: '1px solid rgba(127,127,127,0.45)',
                borderRadius: '6px',
                padding: '3px 10px',
                background: 'transparent',
                color: 'inherit',
                fontSize: '12px',
              },
            },
            t.open,
          ),
        ),
      )
    }

    /** @param {{ title: string, subtitle: string, isZh: boolean, error?: boolean }} props */
    function Header(props) {
      const { title, subtitle, error } = props
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
        h(Icon, { error: Boolean(error) }),
        h(
          'div',
          { style: { minWidth: 0, display: 'flex', flexDirection: 'column' } },
          h(
            'div',
            {
              style: {
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            },
            title,
          ),
          h('div', { style: { fontSize: '11px', opacity: 0.7 } }, subtitle),
        ),
      )
    }

    /** @param {{ error: boolean }} props */
    function Icon(props) {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          'aria-hidden': true,
          style: { flex: '0 0 auto', color: props.error ? 'var(--dsw-alias-label-danger, #c0392b)' : 'currentColor' },
        },
        h('rect', {
          x: 2.5,
          y: 1.5,
          width: 11,
          height: 13,
          rx: 1.5,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        h('path', { d: 'M5 5.2h6M5 8h6M5 10.8h4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      )
    }

    /** @param {string} draft */
    function titleOfDraft(draft) {
      if (typeof draft !== 'string') return undefined
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(draft)
      if (!frontmatter) return undefined
      const match = /^title:\s*(.+?)\s*$/m.exec(frontmatter[1])
      if (!match) return undefined
      const value = match[1].replace(/^["']|["']$/g, '').trim()
      return value === '' ? undefined : value
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register(
            {
              name: 'tool.call.toolview',
              key: 'answer_me_with_html',
            },
            AnswerCard,
          ),
        )
      },
    }
  },
})
