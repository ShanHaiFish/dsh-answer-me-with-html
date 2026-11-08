import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Load the browser bundle with a fake module loader and a fake React. This
 * verifies the card logic and the slot registration without a browser.
 */
async function loadClientBundle() {
  /** @type {{ id: string, factory: Function } | undefined} */
  let loaded
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        loaded = entry
      },
    },
  }

  const url = new URL('../lib/client.js', import.meta.url)
  url.searchParams.set('test', String(Date.now()))
  await import(url.href)

  assert.ok(loaded, 'client bundle did not call window.__ModuleLoader__.load')
  assert.equal(loaded.id, 'dsh-answer-pages')

  /** @type {any} */
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity) }
    },
  }

  return loaded.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected module request: ${specifier}`)
  })
}

function textOf(node) {
  if (node === undefined || node === null || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node.type === 'function') return textOf(node.type({ ...node.props, children: node.children }))
  return textOf(node.children)
}

function findByType(node, type) {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type)
      if (found) return found
    }
    return undefined
  }
  if (node.type === type) return node
  return findByType(node.children, type)
}

function mount(plugin) {
  /** @type {any} */
  let registration
  const ctx = {
    slots: {
      inject(_name, callback) {
        callback()
      },
      register(options, component) {
        registration = { options, component }
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  assert.ok(registration, 'the client plugin did not register a tool view')
  return registration
}

test('client registers a tool view for answer_me_with_html', async () => {
  const plugin = await loadClientBundle()
  const registration = mount(plugin)
  assert.equal(registration.options.name, 'tool.call.toolview')
  assert.equal(registration.options.key, 'answer_me_with_html')
  assert.equal(typeof registration.component, 'function')
})

test('result card shows the title and opens the page', async () => {
  const plugin = await loadClientBundle()
  const { component } = mount(plugin)
  const opened = []
  const card = component({
    phase: 'result',
    block: {
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Rendered page: C:\\work\\.dsh\\answer-pages\\tcp.html\nTitle: TCP handshake\nWarnings: 1\n- STE 1 warning (fix the draft)\n',
        },
      ],
    },
    openFile: (path) => opened.push(path),
  })

  const text = textOf(card)
  assert.match(text, /TCP handshake/)
  assert.match(text, /tcp\.html/)

  const button = findByType(card, 'button')
  assert.ok(button, 'the card has no open button')
  button.props.onClick()
  assert.deepEqual(opened, ['C:\\work\\.dsh\\answer-pages\\tcp.html'])
})

test('failure card shows the renderer errors', async () => {
  const plugin = await loadClientBundle()
  const { component } = mount(plugin)
  const card = component({
    phase: 'result',
    block: {
      isError: true,
      content: [{ type: 'text', text: 'Render failed.\n✗ L4 Cannot parse the draft: span must be a whole number\n' }],
    },
    openFile: () => {},
  })

  const text = textOf(card)
  assert.match(text, /L4 Cannot parse the draft/)
  assert.equal(findByType(card, 'button'), undefined)
})

test('preparing card reads the draft title while arguments stream', async () => {
  const plugin = await loadClientBundle()
  const { component } = mount(plugin)
  const card = component({
    phase: 'start',
    block: {
      args: {
        text: (key) => (key === 'draft' ? '---\ntitle: Streaming title\n---\n## A One\nBody' : undefined),
      },
    },
    openFile: () => {},
  })

  assert.match(textOf(card), /Streaming title/)
})

