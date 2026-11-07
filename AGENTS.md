# Agent notes

This repository is a DeepSeek Harness (DSH) static bundle plugin. Keep changes small and verify them against a real DSH runtime.

## Layout

- `lib/host.js` — Host half: `answer_me_with_html` tool and optional always-on prompt section.
- `lib/renderer.js` — spawns `skill/scripts/am.mjs`, parses `✓` / `✗` / STE lines, owns output-path safety.
- `lib/node-runtime.js` — Node runtime candidates (Electron-as-node, host Node, PATH `node`).
- `lib/client.js` — browser bundle: tool card for `answer_me_with_html`.
- `skill/` — vendored Answer me with HTML resources. `SKILL.md` is a DSH-adapted copy; `scripts/`, `references/`, `licenses/` are upstream.
- `cordis.patch.yml` — inserts the Host row and the skill-provider row.
- `test/` — Node built-in tests (`node --test`).

## Rules

- Do not edit `skill/scripts/am.mjs` by hand. Run `node scripts/sync-upstream.mjs <tag>` to update it, then re-review `skill/SKILL.md` against upstream.
- Keep `skill/SKILL.md` DSH-specific: use the `answer_me_with_html` tool, not `am.mjs` shell commands.
- The plugin must render inside the session workspace and must never open a browser.
- Client code is plain JavaScript loaded through `window.__ModuleLoader__`; no JSX, imports or bundler.
- Every change needs `node --check` on the touched files and `node --test test/renderer.test.mjs test/client.test.mjs`.
- The package name must stay consistent across `package.json`, `cordis.patch.yml` `name`, and `client.js` `load({ id })`.

## Install for local testing

```powershell
dsh plugin --profile desktop add "F:\path\to\dsh-answer-me-with-html"
dsh plugin --profile web add "F:\path\to\dsh-answer-me-with-html"
```

Or use the Plugins page in the app and enter the absolute directory.
