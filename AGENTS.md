# mosAIco — working guide (AI)

> This is the primary agent guide for this repository.
> Contributing from outside? Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, project
> layout, house rules, and PR convention.

## 1. What it is

**mosAIco** is a **Windows-first** desktop app that organizes, operates, and resumes multiple coding
agents (including Claude Code, Codex, and OpenCode) and shells in parallel, inside a persistent workspace with
real terminals (PTYs), layouts, themes, history, and RAM control.

> Tagline: **Reveal the state of every agent, shell, and project.**
> Status: functional MVP in polish. Identifier: `com.mosaico.agents`.

## 2. Commands (from `package.json`)

```powershell
npm install
npm run app      # = tauri dev — runs the full app with hot reload (RECOMMENDED WAY)
npm run dev      # Vite frontend only, at http://localhost:1422 (strictPort)
npm run build    # tsc + vite build — tsc typechecks and VALIDATES i18n (see §3)
npm test         # vitest run over colocated src/**/*.{test,spec}.{ts,tsx} files
```

**Building the Windows installer (MSI/NSIS)** requires the MSVC environment (`vcvars64`):

```powershell
cmd /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >NUL && npm run tauri build'
```

When returning the path of a generated installer, always report the **full absolute path on the PC**
(for example, `D:\project\src-tauri\target\release\bundle\nsis\mosAIco_setup.exe`), never just the
path relative to the repository.
## 3. Non-negotiable rules

1. **DO NOT stop or restart the app or the dev server** (`tauri dev` / Vite). Do not kill the
   process, do not run `npm run app` "just to test" if it is already running. Apply changes through
   **HMR** and trust the reload.
2. **DO NOT commit / push / tag / release without explicit permission from the owner at that
   moment.** Make changes **in the working tree only** and stop — committing is his call. When he
   authorizes a commit, **DO NOT add a co-author** (`Co-Authored-By: Claude …`) or any tool
   signature to the message — he is the only author.
3. **Strict design system — no gradients, nothing "vibecoded".** No generic template UI. Dashboards
   and widgets show **real data**, never placeholder/mock. Style through CSS Modules + tokens from
   `src/styles/theme.css`; **never** hardcode a color — use the variables (`--bg`, `--fg`,
   `--accent`, `--agent-*`, `--status-*`, etc.).
4. **i18n is mandatory.** Every visible string goes through `t()`. When adding text, register the key
   in `src/lib/i18n/messages/en.ts` (**source of truth**, default EN) **and** in
   `src/lib/i18n/messages/pt-BR.ts`. `pt-BR.ts` is typed against the keys of `en.ts`, so
   `npm run build` **fails** if a translation is missing.
5. **Changelog is mandatory for features.** Every feature addition, change, or removal must update
   [`docs/CHANGELOG.md`](docs/CHANGELOG.md) in the same task, under the **`[Unreleased]`** section
   (top of the file), with a short, objective, user-facing description. Never skip this step — the
   changelog is the source for release notes.

## 4. Architecture at a glance

**Communication:** the frontend calls `invoke(...)` through `lib/tauri/`; the terminal receives
streaming through the Tauri events `pty://data/{id}` and `pty://exit/{id}`.

## 5. Conventions

- One `.module.css` file per component; color/spacing always through tokens, never literals.
- New domain types go in `src/lib/types.ts`; reuse the existing ones.
- Lean Zustand selectors to avoid rerender loops; `projects.json` is saved with debounce and atomic
  writes (tmp → rename) — preserve that pattern.
- The `projects.json` schema is versioned with migration/backfill — when changing its shape, keep the
  migration.

## 6. Gotchas / security

- `tauri.conf.json` ships a strict CSP with local plugin script origins and `worker-src 'none'`,
  asserted literally by `src/securityPolicy.test.ts`. Any change there is a deliberate, reviewed one. Treat any
  rendered input as untrusted; the webview still has full IPC access.
- `spawn_pty` runs a shell with the command/args coming from the frontend — **validate input on the
  frontend** before spawning.
- Spotify and GitHub Sync credentials are stored in **plaintext** in app data; Claude usage reads
  its credential from Claude Code or the OS keyring. Do not log or expose any of them.
- The Windows build requires `vcvars64`. The Rust toolchain on `C:` can be corrupted by Windows
  Defender — prefer building from `D:`.
- Local data: `%LOCALAPPDATA%/mosAIco/` (profiles, `projects.json`, scrollback `*.bin`, `spawn.log`).

## 7. Going deeper

Versioned in this repo:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup per OS, layout, house rules, commit/PR convention.
- [`docs/FEATURES.md`](docs/FEATURES.md) — features in detail.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — user-facing history.
- [`docs/OVERVIEW.md`](docs/OVERVIEW.md) — domain model (Group, Project, Container, Pane, Terminal,
  Sub-tab, PTY), stack, and persistence.
- [`docs/BRAND.md`](docs/BRAND.md).
- [`docs/PLUGINS.md`](docs/PLUGINS.md) — plugin system: manifest, capabilities, lifecycle, and how
  to add a bundled plugin.
- [`docs/THEMES.md`](docs/THEMES.md) — adding a theme, as a plugin or as a built-in.
- [`docs/DIAGNOSTICO_MATURIDADE_TECNICA.md`](docs/DIAGNOSTICO_MATURIDADE_TECNICA.md) — diagnostic of
  code organization, duplication, and performance, with prioritized recommendations.

The domain glossary (Group, Project, Container, Pane, Sub-tab, PTY) is summarized in `CONTRIBUTING.md`.

## Language and comment rules

- Maintain the repository's public documentation in English. Keep one canonical Markdown file per document instead of parallel language editions.
- Code, code comments, JSDoc, internal logs, commit messages, and pull requests remain in English. Keep comments concise and use them to explain non-obvious behavior, constraints, or decisions.
- Visible interface text still uses i18n: put default strings in `src/lib/i18n/messages/en.ts` and translations in `src/lib/i18n/messages/pt-BR.ts`. Locale files are the exception to the English documentation rule.
- When editing a document, keep links and factual claims current; do not add duplicate language editions.
