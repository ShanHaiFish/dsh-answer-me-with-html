# Changelog

All notable changes to this project are documented in this file.

## 0.2.0 — 2026-11-08

Renamed the project to avoid a name collision with an existing DSH/GitHub project.

- Package, repository and plugin name: `dsh-answer-me-with-html` → **`dsh-answer-pages`**.
  npm already has a `dsh-answer-me-with-html` (0.5.0) and GitHub has
  `wjvalue/dsh-answer-me-with-html`, so the old name was ambiguous.
- Skill renamed to `answer-pages`; the skill-provider row is now `answer-pages-skill`.
- Host plugin id and module name: `answer-pages`; always-on section name
  `answer-pages:always-on`.
- The renderer's private config directory moved to `<workspace>/.dsh/answer-pages-home`.
- The tool name stays `answer_me_with_html`, so existing prompts keep working.
- Display name in the Plugin Manager: **Answer pages** / **HTML 回答页面**.

Upgrading: remove the old bundle, then install the new one:

```powershell
dsh plugin --profile desktop remove dsh-answer-me-with-html
dsh plugin --profile desktop add github:ShanHaiFish/dsh-answer-pages
```

Already-rendered pages and the `.dsh/answer-pages/` output directory are kept.

## 0.1.1 — 2026-11-08

- Skill: add a division-of-labor rule for coexisting with `dsh-genui` — use its inline
  `dsh-ui` fence for compact interactive UI, keep `answer_me_with_html` for long-form or
  offline pages, and never use both for one answer.
- Docs: add the dsh-genui comparison and coexistence evaluation.

## 0.1.0 — 2026-11-08

First working version.

- Host plugin `dsh-answer-me-with-html` with the native `answer_me_with_html` tool.
- Bundled renderer (`skill/scripts/am.mjs`, upstream Answer me with HTML 0.5.11) and a DSH-adapted skill.
- Renders into `<session workspace>/.dsh/answer-pages/`; never opens a browser.
- Runtime resolution: Electron-as-node on DSH Desktop, the host Node on `dsh web`, `node` on PATH as fallback.
- Client tool card for `answer_me_with_html` with title, status, warnings, errors and an “Open page” action that targets the Document Preview.
- Optional always-on prompt section (`alwaysOn` config).
- Offline install from a local directory; no `github:` fetch or build step required.
