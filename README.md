# mosAIco

![mosAIco app icon](src-tauri/icons/128x128.png)

mosAIco is a local desktop workspace for running coding agents and shells side by side. It is developed and branded by Schubert Araujo and distributed under AGPL-3.0-or-later. The source code authorship notices are in [NOTICE](NOTICE).

This repository contains the mosAIco source and branding. The workspace combines multiple agents and real terminals with persistent project layouts, session history, resource controls, and themes.

## What mosAIco does

- Run Claude Code, Codex, OpenCode, GitHub Copilot CLI, Cursor, Antigravity, Kiro, Mimo, and shells in parallel.
- Organize repositories in projects, groups, containers, panes, and sub-tabs. Each terminal has its own PTY and scrollback.
- Keep terminals running when a container is hidden and resume supported agent conversations after a restart.
- Save auto, spotlight, sidebar, and custom grid layouts.
- Inspect live agent activity, MCP servers, skills, Git worktrees, pull requests, and resource usage.
- Use bundled plugins for Todo, Git Control, and theme packs; install compatible plugins through the catalogue.
- Control an existing workspace from a paired device on the local network when remote control is enabled.

See [features](docs/FEATURES.md), [architecture](docs/OVERVIEW.md), and [privacy and data flows](docs/PRIVACY.md) for details.

## Supported agents and shells

mosAIco launches these built-in agent types through their installed CLIs. The agent CLIs are separate software and are not bundled with mosAIco.

| Agent or terminal | CLI | Features in mosAIco |
|---|---|---|
| Claude Code | `claude` | Session resume, usage card, local session history |
| Codex | `codex` | Session resume, usage card |
| GitHub Copilot CLI | `copilot` | Usage card |
| Cursor | `cursor-agent` | Session resume |
| Antigravity | `agy` | Session resume, usage card |
| OpenCode | `opencode` | Session resume |
| Kiro CLI | `kiro-cli` | — |
| Kimi Code | `kimi` | — |
| Gemini CLI | `gemini` | Local usage card |
| Mimo | `mimo` | — |
| Freebuff | `freebuff` | — |
| Shell | System default shell | Plain terminal with the same pane model |
| WSL | `wsl.exe` | Default WSL distribution as a plain terminal on Windows |

Usage cards depend on the corresponding CLI or local data being available. See [Features](docs/FEATURES.md) for details.

## Privacy and security

“Local-first” describes workspace persistence, not an internet-free guarantee. Provider usage polling is on by default; mosAIco update checks are off because there is no mosAIco release endpoint. Manual GitHub Gist Sync is already available. Handoff redaction is best effort, so review a context packet before sending it to another agent.

Remote control uses unencrypted HTTP/WebSocket transport and should only be enabled on a trusted LAN. Clean profiles are read-only by default on a paired remote device. Coding-agent CLIs and enabled integrations can contact their own providers. See the [privacy guide](docs/PRIVACY.md) for exact defaults and retention.

## Install

The first official distribution is for Windows x64. Open [Releases](https://github.com/sharaujo/mosaic-orchestrator/releases), choose a version, then download the NSIS `.exe` or MSI `.msi` installer under **Assets**. **Source code (zip)** and **Source code (tar.gz)** contain only the repository, not the ready-to-run app.

Linux remains in the source code and CI, but Linux binaries are temporarily unavailable while the GTK/WebKitGTK dependency chain is reviewed. There is no announced date for Linux binaries.

> [!WARNING]
> **Windows security notice:** The Windows installers produced by this project's current release workflow are not code-signed. Windows may display a Microsoft Defender SmartScreen warning or quarantine a download. A warning alone does not establish whether a file is safe or unsafe. Download installers from the official [Releases](https://github.com/sharaujo/mosaic-orchestrator/releases) page and review the warning and file details in Windows Security before deciding how to proceed. Do not bypass a warning for an installer obtained from another source.

## Run from source

Requirements: Node.js 24 LTS, Rust stable, Visual Studio Build Tools on Windows, and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform.

```powershell
npm ci
npm run app
```

`npm run app` runs the desktop app with hot reload. `npm run build` typechecks the interface and builds frontend assets. `npm test` runs the Vitest suite. A frontend-only preview is available with `npm run dev` at `http://localhost:1422`.

For a Windows installer, load the MSVC environment before running the Tauri build:

```powershell
cmd /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >NUL && npm run tauri build'
```

The generated installers are under `src-tauri/target/release/bundle/`. mosAIco uses the application identifier `com.mosaico.agents`. Automatic updates are not configured yet.

## Terminal command

Install the `mosaico` command from **Preferences → Integrations → Terminal command**. Then run `mosaico` to open the current folder or `mosaico <folder>` to open another folder as a project. On Windows the shim is installed under `%LOCALAPPDATA%\mosAIco\bin\mosaico.cmd`.

## Branding and attribution

mosAIco uses its own icon, wordmark, installer artwork, and built-in palette. Regenerate the raster assets with `./scripts/generate-mosaico-branding.ps1`; the source mark and design notes are in [docs/BRAND.md](docs/BRAND.md).

The [LICENSE](LICENSE) contains the AGPL-3.0-or-later terms. [NOTICE](NOTICE) records authorship of incorporated code and mosAIco contributions. [TRADEMARK.md](TRADEMARK.md) describes the mosAIco brand.

## Contributors

<!-- contributors:start -->
  <a href="https://github.com/sharaujo"><img src="https://github.com/sharaujo.png?size=100" width="80" height="80" alt="sharaujo" title="sharaujo" /></a>
  <!-- contributors:end -->
