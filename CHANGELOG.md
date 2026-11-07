# Changelog

All notable changes to this project are documented in this file.

## 0.1.0 — 2026-11-08

First working version.

- Host plugin `dsh-answer-me-with-html` with the native `answer_me_with_html` tool.
- Bundled renderer (`skill/scripts/am.mjs`, upstream Answer me with HTML 0.5.11) and a DSH-adapted skill.
- Renders into `<session workspace>/.dsh/answer-pages/`; never opens a browser.
- Runtime resolution: Electron-as-node on DSH Desktop, the host Node on `dsh web`, `node` on PATH as fallback.
- Client tool card for `answer_me_with_html` with title, status, warnings, errors and an “Open page” action that targets the Document Preview.
- Optional always-on prompt section (`alwaysOn` config).
- Offline install from a local directory; no `github:` fetch or build step required.
