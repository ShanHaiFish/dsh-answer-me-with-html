# Contributing

Thanks for helping improve `dsh-answer-me-with-html`.

## Development

- Node.js 20+ (Node 24 is used in this checkout).
- DSH `0.2.1-rc.2` or `0.2.2-rc.1` for manual verification.

Run the checks before opening a pull request:

```powershell
node --check lib/host.js
node --check lib/renderer.js
node --check lib/node-runtime.js
node --check lib/client.js
node --test test/renderer.test.mjs test/client.test.mjs
```

Install the working copy into a profile for manual testing:

```powershell
dsh plugin --profile desktop add "F:\path\to\dsh-answer-me-with-html"
dsh plugin --profile web add "F:\path\to\dsh-answer-me-with-html"
```

## Updating the bundled renderer

`skill/scripts/am.mjs`, `skill/references/` and `skill/licenses/` come from
[Answer me with HTML](https://github.com/QingYunA/answer-me-with-html). Do not
edit `am.mjs` by hand. Update the pinned tag and review the diff:

```powershell
node scripts/sync-upstream.mjs v0.5.11
```

`skill/SKILL.md` is a DSH-specific adaptation and is never overwritten by the
script. When upstream changes it, merge the relevant changes manually and keep
the DSH workflow (native tool, no shell, Document Preview links).

## Rules

- Keep the plugin rendering inside the session workspace and never open a
  browser.
- Keep the package name consistent in `package.json`, `cordis.patch.yml`
  (`name`) and `lib/client.js` (`window.__ModuleLoader__.load({ id })`).
- Client code is plain JavaScript: no JSX, imports or bundler.
- Add a test for a behavior change; the suite runs on Node 20, 22 and 24.
- Keep upstream MIT notices and the third-party notices up to date.

## Pull requests

Describe what changed and how it was verified. Screenshots are welcome for UI
changes. By contributing you agree your changes are licensed under the MIT
License.
