# Technical Maturity Assessment — mosAIco

> Historical diagnostic, not an execution plan. This report records six read-only source-code
> passes made on 2026-08-06. File locations, counts, and conclusions describe that snapshot and
> may have changed since then. Each finding has evidence and a recommendation; the assessment
> itself made no code changes. The project owner decides priorities and sequencing. The review
> drew on senior/Staff/Principal engineering practices for module boundaries, domain separation,
> behavioral tests, ADRs, DORA, and known antipatterns.

## 1. Executive summary

| # | Finding | Area | Impact |
|---|---|---|---|
| 1 | `projectsStore.ts` was a 3,080-line god object spanning at least eight domains plus embedded persistence. | Frontend | High |
| 2 | Frontend test coverage by file was about 9% (12/134 files), with no component, store, or hook tests. | Frontend | High |
| 3 | Approximately 600-700 frontend lines were duplicated across provider polling, usage cards, caches, and modal setup. | Frontend | Medium-high |
| 4 | Approximately 150-200 backend lines were duplicated across path resolution, JSONL parsing, and eight `now_ms()` implementations. | Backend | Medium |
| 5 | 24 of 50 Rust modules had no tests, including `cli_resolver.rs`, `profiles.rs`, and `diagnostics.rs`. | Backend | Medium-high |
| 6 | `AGENTS.md` referenced five nonexistent files and an obsolete repository layout. | Governance | High |
| 7 | There were no formal ADR/RFC documents even though comments named RFC-003/004/006/007. | Governance | Medium |
| 8 | Broad Zustand selectors in `WorkspaceView`, `ProjectSidebar`, and `HomeView` caused renders after unrelated mutations. | Performance | Medium |
| 9 | Every `projectsStore` mutation serialized the entire application tree rather than a delta. | Performance | Medium |
| 10 | `GhosttySurface` polled IPC every 700 ms for each open native pane, the most aggressive app poller. | Performance | Low-medium |

---

## 2. Structure and organization

### 2.1 Frontend (`src/`)

**`projectsStore.ts`: confirmed god object (`src/stores/projectsStore.ts`, 3,080 lines).**
It was about five times larger than the next store, `stores/mergeStore.ts` (`mergeStore.ts`, 561 lines). One
`create<ProjectsState>` exposed `projects` state and actions for at least eight domains:

- Profiles: `activeProfileId`, `profiles`, `hydrate`.
- Group CRUD: `createGroup`, `moveGroupToParent`, `suspendGroup`, `deleteGroup`.
- Project CRUD: `createProject`, `setWorktreeMode`, `setValidationCommands`.
- Workspace and tab navigation: `openProjectWorkspace`, `navigateWorkspaceHistory`.
- Layout and grid: `setLayoutMode`, `setProjectGridLayout`, `setWorkspaceGridLayout`.
- Todo CRUD: `createTodo`, `toggleTodo`, `reorderTodo`.
- Terminal, pane, and sub-tab lifecycle: `createTerminal`, `openPane`, `createSubTab`.
- App preferences: `setLanguage`, `setUiTheme`, `setCliPath`.

The store also mixed `persist` behavior with UI state. It called `saveProjectsFile` through a module-level
debounce timer (`src/stores/projectsStore.ts:283-316`) alongside actions such as `setFullscreenPane`.
By contrast, `uiStore.ts` (187 lines) explicitly said that persistent state belongs in
`projectsStore` (`src/stores/uiStore.ts:6-9`). A single persistent-state owner was therefore a deliberate
architecture decision, but the domains were not split into slices.

**Recommendation:** separate domain stores (`useProfilesStore`, `useGroupsStore`,
`useWorkspaceNavStore`, `useLayoutStore`, `useTodosStore`, `useTerminalsStore`,
`usePreferencesStore`) behind coordinated persistence, or retain one Zustand store assembled
from domain-specific slices (for example, `create<State>()((...a) => ({ ...profilesSlice(...a), ...groupsSlice(...a) }))`). Extract `saveProjectsFile` and its debounce into a dedicated
`persistence.ts` module.

**`src/lib/`: a flat utility drawer.** Its 49 files, apart from `i18n/`, mixed the IPC
wrapper (`tauri.ts`, 1,135 lines), domain types (`types.ts`, 482 lines), agent/session
lifecycle (`sessionDiscovery.ts`, `sessionResume.ts`, `agentRuntimeAdapter.ts`,
`spawnQueue.ts`), infrastructure (`closeCoordinator.ts`, `webglPool.ts`,
`storageNamespace.ts`), formatting (`costFormat.ts`, `gridLayout.ts`), third-party
integration (`spotify.ts`, which also bypassed the IPC wrapper), four near-identical caches,
and business rules better suited to stores (`todos.ts`, `workspaceNavigation.ts`).

**Recommendation:** group files under `lib/session/`, `lib/provider-usage/`, `lib/infra/`,
and `lib/format/`. This was less urgent because most individual files were focused, but missing
boundaries made existing helpers harder to discover and encouraged the cache duplication in §3.2.

**Large components with several reasons to change:**

| Component | Lines | Responsibilities |
|---|---:|---|
| `AgentCanvasPOC/index.tsx` | 1,765 | Canvas, `@dnd-kit` drag and drop, direct `invoke()`, costs and usage |
| `XTermView/index.tsx` | 1,719 | Terminal rendering, PTY lifecycle, session resume/discovery, WebGL budget |
| `ProjectSidebar/index.tsx` | 1,540 | Tree, drag and drop, context menus, direct Git/file-explorer calls |
| `PreferencesModal.tsx` | 1,215 | One large settings modal |
| `EditProjectModal.tsx` | 822 | Project editing |

**Recommendation:** extract single-purpose hooks such as `useAgentCanvasDragDrop` and
`useTerminalSessionLifecycle`, plus smaller components, especially in the first three files.
The issue was not line count alone: UI, backend coordination, and local domain logic changed
inside the same unit.

**Smaller structural inconsistencies:**

- `src/components/EmptyState/EmptyState.tsx` (`EmptyState`) broke the project's `index.tsx` convention.
- `src/components/GhosttySurface/index.tsx` lacked a companion `.module.css`.
- `src/components/ui/` (`ui/`) mixed kebab-case `.tsx` names such as `ascii-effect.tsx` with
  PascalCase CSS modules such as `AsciiEffect.module.css`.
- `src/components/modals/` was flat (33 files); about six modals had no dedicated CSS module,
  while others shared `Modal.module.css` or `controls.module.css` inconsistently.

### 2.2 Rust backend (`src-tauri/src/`)

**A strength: `lib.rs` stayed lean.** Its 387 lines registered 155 commands through
`invoke_handler!`, almost all as `module::function`. Only four trivial commands were local,
including `set_window_opacity`, `quit_app`, and `ping`. Git, merge, and PTY business logic
lived elsewhere. This command-registry pattern should be preserved.

| Module | Lines | Assessment |
|---|---:|---|
| `pty.rs` | 1,518 | Spawn/lifecycle, scrollback I/O, memory gate, and process priority in one file |
| `ghostty_bridge.rs` | 1,125 | Mostly macOS-specific FFI/stubs and a large test block; less concerning than its size |
| `git_control.rs` | 985 | Large but cohesive leaf module with no internal `use crate::` imports |
| `graphify.rs` | 939 | RFC-004 integration: MCP config, `graph.json` parsing, and versioning |

Modules in the 500-800-line range were `conflict_resolution.rs` (771),
`worktrees.rs` (753), `resources.rs` (687), `cli_resolver.rs` (641),
`agent_cost.rs` (609), `diagnostics.rs` (546), `scheduler.rs` (545), and
`claude_sessions.rs` (542). Their size alone did not justify an urgent split.

**Recommendation:** `pty.rs` was the strongest split candidate: separate spawn/lifecycle,
scrollback I/O and compaction, and the memory gate into `pty/spawn.rs`,
`pty/scrollback.rs`, and `pty/memory_gate.rs`. The other large modules were largely cohesive.

**Module coupling:** sampling `use crate::` imports in the larger modules found no cycles.
`git_control.rs` had no internal dependencies and served `worktrees.rs`,
`conflict_resolution.rs`, `graphify.rs`, and `pty.rs`: healthy fan-in on a stable leaf.
`paths.rs`, `stats.rs`, and `event_bus.rs` played similar roles. No intervention was
recommended for this coupling.

**Error handling:** `Result<T, String>` appeared 307 times across 45 of 50 files. There was
no `thiserror` or `anyhow` dependency in `Cargo.toml` and only one custom error enum (`FetchError` in
`antigravity_usage.rs:90`). The 467 `.unwrap()` and 102 `.expect(` calls looked alarming
in aggregate, but sampling `git_control.rs`, `worktrees.rs`, `conflict_resolution.rs`,
and `planning_gate.rs` found nearly all inside `#[cfg(test)]`. Production code used `?`
and `.map_err` consistently. `pty.rs` had only two production `.unwrap()` calls, both on
`Mutex`/`Condvar` locks. This was a strength to preserve, not a risk finding. Moving to
`thiserror` would be optional only if error variants multiplied.

**Domain and infrastructure:** pure decisions and filesystem/process/network I/O shared
functions; for example, `pty.rs::spawn_pty` combined memory policy, launcher resolution, and
process spawn. This was a reasonable tradeoff for the team and product size, not necessarily a
missing distributed-service architecture layer.

**Naming:** domain-oriented types included `WorktreeMode`, `ConflictEnv`,
`MergeOutcome`, `ScrollbackBuffer`, and `MonitoredAgent`. A backend-wide search for
`struct` names matching `struct \w*(Manager|Handler|Helper|Util)` found no real
identifiers, only prose in comments.

### 2.3 The `invoke()` boundary

Most IPC calls passed through `src/lib/tauri.ts` (1,135 lines, about 150 typed functions).
Two bypasses called `invoke()` directly:

- `src/lib/spotify.ts:20,24`: `spotify_login`, `spotify_logout`.
- `src/components/AgentCanvasPOC/index.tsx:11,745,820`: `install_agent`,
  `uninstall_agent`. This was the only component importing `invoke` directly.

**Recommendation:** move these four calls into `lib/tauri.ts` for consistency.

---

## 3. Duplicated code

### 3.1 Rust backend

Provider session modules for Claude, Codex, OpenCode, and Antigravity followed a similar path:
a schematic `#[tauri::command] async fn snapshot_X(cwd) → spawn_blocking(|| inner(cwd))`
wrapper, found the provider directory,
walked it, parsed JSON/JSONL, filtered by cwd, and sorted by `modified_at_ms`. Provider schemas
differed, but much of the scaffolding was copied.

- **Home-directory resolution:** `claude_sessions.rs:41-44`,
  `codex_sessions.rs:17-20`, and `antigravity_sessions.rs:16-19` each chose
  `USERPROFILE` or `HOME` and differed mainly in the provider-specific suffix:

  ```rust
  let home = env::var_os("USERPROFILE")
      .or_else(|| env::var_os("HOME"))
      .map(PathBuf::from)?;
  Some(home.join(".claude").join("projects")) // provider-specific suffix
  ```
- **Modification timestamps:** `modified_ms` had the same body in
  `claude_sessions.rs:61-68`, `codex_sessions.rs:23-30`, and
  `antigravity_sessions.rs:27-33`.
- **Cwd normalization:** independent implementations appeared in
  `codex_sessions.rs:32-39`, `antigravity_sessions.rs:79-86`, and
  `opencode_sessions.rs:22-33` (the `normalize_path` variant).
- **Blocking wrapper:** the documentation comment, `spawn_blocking` wrapper, and `map_err` error mapping were repeated in `claude_sessions.rs:172-176`,
  `codex_sessions.rs:98-102`, and `antigravity_sessions.rs:112-116`.
- **JSONL loop:** the read-line, skip-empty, parse-`serde_json::Value` pattern appeared five
  times: twice each in `claude_sessions.rs` and `agent_cost.rs`, once in
  `codex_usage.rs`:

  ```rust
  for line in reader.lines().map_while(Result::ok) {
      if line.is_empty() { continue; }
      let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { continue; };
      // Process value here.
  }
  ```
- **Clock helper:** `now_ms` (`now_ms()`) or equivalent `SystemTime`-to-milliseconds conversion was
  reimplemented in `crash_watch.rs:45-50`, `event_bus.rs:57-60`,
  `github_sync.rs:53-56`, `profiles.rs:55,157,163`, `planning.rs:149-151`,
  `projects.rs:31-33`, `resources.rs:165-167`, `supervisor.rs:25-27`,
  and `graphify.rs:98-100`.
- **Hidden Windows console:** `git_control.rs:36-37` already exposed
  `hide_console(&mut Command)`, yet `health_probe.rs:91-92` and
  `projects.rs:129` in `clone_github_repo` repeated the `CREATE_NO_WINDOW` block.
- **Parallel types:** `UsageWindow` in `claude_usage.rs:10-13` and
  `CodexUsageWindow` in `codex_usage.rs:11-16` represented similar concepts with
  different fields. `ModelCost` (`agent_cost.rs:110-120`) and `ModelRate`
  (`agent_cost.rs:438-446`) repeated a pricing table. Four
  `*SessionSnapshot` types shared `id: String` and `modified_at_ms: u128` plus
  provider fields: `ClaudeSessionSnapshot`, `CodexSessionSnapshot`,
  `OpenCodeSessionSnapshot`, and `AntigravitySessionSnapshot`.

The estimate was **150-200 duplicated lines**. A possible `src-tauri/src/provider_common.rs` could contain
`provider_home_dir(provider)`, `file_modified_ms(&Metadata)`, `now_ms()`, a JSONL iterator,
and a shared `SessionSnapshotBase` through composition or `#[serde(flatten)]`.
A helper such as `for_each_jsonl_value(reader, |v| {...})` could replace the repeated parser loop. The two
`CREATE_NO_WINDOW` copies could call `git_control::hide_console`. This was a mostly
mechanical refactor. The usage modules (`claude_usage.rs`, `codex_usage.rs`,
`antigravity_usage.rs`) differed substantially because of OAuth, JSON-RPC, and Google REST;
the assessment estimated only 15-20% duplication there and did not recommend forcing their
provider logic into one abstraction.

### 3.2 Frontend

**Four near-identical cache files:** `src/lib/claudeUsageCache.ts`, `codexUsageCache.ts`,
`antigravityUsageCache.ts` (25-26 lines each), and `src/lib/activityCache.ts` (with `days`
in its key) all cached a value with a TTL and deduplicated an in-flight promise. A generic
`createCache<T>(fetcher, ttlMs)` could replace about 100 repeated lines with roughly 20 lines
of factory code and four short calls. The repeated pattern was:

```ts
let cached: { value: ClaudeUsage; at: number } | null = null
let inFlight: Promise<ClaudeUsage> | null = null
export function getCachedClaudeUsage(force = false): Promise<ClaudeUsage> {
  const now = Date.now()
  if (!force && cached && now - cached.at < TTL_MS) return Promise.resolve(cached.value)
  if (!force && inFlight) return inFlight
  inFlight = getClaudeUsage().then((value) => { cached = { value, at: Date.now() }; return value })
    .finally(() => { inFlight = null })
  return inFlight
}
```

**Title-bar provider polling:** `TitleBar/index.tsx:122-214` had three `useEffect`
blocks (about 95 lines), one each for Claude, Codex, and Antigravity. Each maintained a
`cancelled` flag, timers, and cleanup; they differed mainly in 1,500/2,500/3,000 ms
startup delays and whether `observeXReset` ran. A
`useProviderUsagePolling(getCachedUsage, setUsage, { delayMs, observeReset })` hook was
recommended.

**Usage cards:** `HomeView/UsageStrip.tsx` (`HomeView/UsageStrip.tsx:186-452`) had roughly 270 lines in
`ClaudeCard`, `CodexCard`, and `AntigravityCard`. They shared
`CardHead`, `Hero`, `Meter`, `StatGrid`, and `CardFoot`, but repeated the
card skeleton. A configuration-driven `<UsageCard providerConfig={...} usage={...}/>`
could reuse the existing subcomponents.

**Modal setup:** roughly 120 lines of color-swatch style and `reset()` form hydration were
repeated in `NewGroupModal.tsx:83-90`, `EditGroupModal.tsx:89-96`,
`NewProjectModal.tsx:146-210` (three variants), and
`EditProjectModal.tsx:447-511` (four variants). The `Modal.tsx` Radix wrapper was
already shared; only inner-state setup repeated. Suggested hooks were
`useColorSwatchPicker(colors, initial)` and
`useModalFormReset(open, entity, mapper)`.

**Polling loops:** the report counted 15 independent `setInterval` loops, often paired with `setTimeout` with hand-written
cancellation and cleanup across `hooks/useResourceSupervisor.ts`, `useNowPlaying.ts`,
`useGsdSyncSessions.ts`, `useDiscordPresence.ts`, `lib/activityTracker.ts` (two),
`lib/limitResetWatch.ts`, `stores/mergeStore.ts`, `AgentCanvasPOC` (two), `TokenHud`,
the three `TitleBar` polls, `SidebarMergePanel`, `HomeView/TimeAnalytics`,
`HomeView/index.tsx`, `GitControl.tsx`, and `GhosttySurface`. A shared
`usePolling(fn, intervalMs, { enabled, startDelayMs })` could remove about 90-100
scaffolding lines and standardize visibility gating. At the time,
`GitControl` used `document.visibilityState`, `TitleBar` an `activeRef`,
and `AgentCanvasPOC` a local flag for the same concern.

**Agent lists:** `NewTerminalModal.tsx:14-22` (`AGENTS`) and
`EditProjectModal.tsx:28-36` (`ALL_AGENTS`) independently listed the same seven
agent types with slightly different labels, such as "Claude" versus "Claude Code".
They should use one source in `types.ts`.

The total frontend duplication estimate was **600-700 lines**.

---
## 4. Performance and optimization

### 4.1 Zustand selectors and rendering

Most of the roughly 240 sampled `useProjectsStore` call sites selected narrow fields, a good
pattern visible in `src/components/TerminalPane/index.tsx:94-104`, `src/components/App.tsx:166-180`, and the
`useShallow` use at `src/components/ProjectSidebar/index.tsx:84-117`. Several top-level components,
however, selected whole slices:

- `WorkspaceView/index.tsx:52-53`: all `s.projects` and `s.groups`.
- `ProjectSidebar/index.tsx:76-79`: all projects, groups, `s.ungroupedOrder`, and
  `s.workspace.containers`.
- `HomeView/index.tsx:72-75` and `TerminalInspector/index.tsx:49`: similar broad selections.

Immer-style updates replaced a whole slice reference after a mutation, so these components
rendered even when the change did not affect their displayed data. For example, a PTY session ID
change in another project could rerender the entire 1,540-line `ProjectSidebar`.

`TerminalPane/index.tsx:121-140` and `WorkspaceView/PaneArea.tsx:67` also ran a linear
`.find()` over projects inside selectors on every store notification. The selected object's stable
reference usually prevented a needless render, but each mutation still incurred O(project count)
work per open pane.

**Recommendation:** use per-ID selectors with `useShallow` where only a subset is needed.
If project count grows, consider a `Map<id, Project>` index instead of repeated array searches.

### 4.2 Memoization

| Component | `useMemo` | `useCallback` | `React.memo` |
|---|---:|---:|---|
| `XTermView/index.tsx` (1,719 lines) | 0 | 8 | No |
| `AgentCanvasPOC/index.tsx` (1,765 lines) | 0 | 6 | No |
| `ProjectSidebar/index.tsx` (1,540 lines, about 16 handlers) | 5 | 0 | No |

`ProjectSidebar` defined around 16 handlers per render, including `onDragEnd`,
`onGroupOpenAll`, and recursive `renderGroup`, and passed new references to children.
`AgentCanvasPOC/index.tsx:1179-1187` ran five `.filter()` calls/groupings of `nodes` directly
during render. `XTermView` was mounted once per open terminal pane without memoization, while
its parent `TerminalPane` already used `memo()`. Existing positive examples were
`TerminalPane`, `ProjectContainer`, `WebPane`, and `MarkdownRenderer`.

**Recommendation:** use `useCallback` for sidebar handlers, `useMemo` for canvas
groupings, and evaluate `React.memo` on `XTermView`, where multiple instances can coexist.

### 4.3 `projectsStore` persistence

About 59 calls to the internal `update()` wrapper scheduled `scheduleSave(get)`
(`src/stores/projectsStore.ts:987`). The 500 ms `SAVE_DEBOUNCE_MS` coalesced rapid mutations, but
each save serialized the entire `ProjectsFile`: groups, projects and their terminals/tabs,
todos, workspace, preferences, and `cliPaths`. It used
`JSON.stringify` with `null, 2` (`JSON.stringify(payload, null, 2)`), adding pretty-print CPU and I/O. Completing one todo
serialized as much data as moving a whole pane.

**Recommendation:** preserve the useful debounce, remove production pretty-printing if human
readability is not required, and consider incremental or append-log persistence if the payload
grows substantially.

### 4.4 WebGL and xterm

`src/lib/webglPool.ts` was a WebGL context **budget counter**, defaulting to four visible
contexts, rather than a true pool that reused contexts. Further visible panes fell back to
Canvas2D, which was intentional and documented. The "pool" name could be misleading.
`@xterm/addon-serialize` was declared in `package.json` but not imported in `src/` at
the time of the review; it was a candidate for removal after verification.

### 4.5 Bundle loading

Heavy `mermaid` (`MarkdownRenderer`) and `cytoscape` (`GraphifyView`) were imported
statically through `WorkspaceView/PaneArea.tsx:6-9` and `RightSidebar/index.tsx:8`,
even when those panes were closed. Only four components were lazy-loaded
(`App.tsx:53-68`: `AgentCanvasPOC`, `HomeView`, `LayoutDesignerModal`,
`MemoryAnalyticsModal`); about 25 other modals entered the main bundle.

**Recommendation:** consider `React.lazy()` for `MarkdownPane`, `GraphifyView`,
and infrequent modals such as `ProfilesModal`, `SyncModal`, `ThemePickerModal`,
and `WelcomeModal`. Remove `@xterm/addon-serialize` only if it remains unused.

### 4.6 Backend I/O and locks

**A strength:** PTY scrollback in `pty.rs` already used incremental `push_scrollback` appends with a
250 ms throttle, a dedicated background writer through `mpsc` rather than blocking the
PTY read thread, and amortized compaction after roughly 4 MB of output. Locks around
operations such as `write_pty` were scoped inside `spawn_blocking` so they would not
delay attach, resize, or kill operations on other PTYs. No change was recommended there.

**The remaining finding:** `src-tauri/src/projects.rs::save_projects` (lines 59-89)
held `SAVE_MUTEX` (`tokio::sync::Mutex`) while running synchronous
`fs::create_dir_all`, `fs::write`, and `fs::rename` in an async task, without
`spawn_blocking`. The same file's `clone_github_repo` already used that pattern.
Current impact was low because payloads were small and frontend writes were debounced,
but slow disks, network storage, or antivirus scans could block a Tokio worker and queue
other saves behind the mutex.

**Recommendation:** move the `save_projects` body into `tokio::task::spawn_blocking`,
matching `clone_github_repo`.

### 4.7 Polling

`GhosttySurface/index.tsx:239-254` called `ghosttySurfaceExited` every **700 ms per
open native pane**. The cost scaled linearly with pane count; the other 14 frontend
pollers ran at intervals from three seconds to five minutes and each had its own cleanup
logic (§3.2).

**Recommendation:** use a longer interval, perhaps two to three seconds if the user-visible
delay is acceptable, or send a backend push event when a surface exits.

---

## 5. Documentation, governance, and CI

- **Broken agent guidance:** `AGENTS.md` had referenced five nonexistent files:
  `CONTEXTO_IA.md`, `GLOSSARY.md`, `BUILD_WINDOWS.md`,
  `HANDOFF_STATUS.md`, and `CURRENT_STEP.md`. It also described a `poc/` tree with
  `public launch/` even though `src/` and `src-tauri/` were at the root. Because agents
  receive `AGENTS.md` as context, these broken references could misdirect work.
- **No formal ADR/RFC files:** there was no `adr/`, `decisions/`, or `rfcs/` directory
  and no `ADR-*.md`. Comments nevertheless referenced the `RFC-003/004/006/007` group: `RFC-003` in `worktrees.rs`,
  `RFC-004` in `graphify.rs`, `RFC-006` in `merge_analyzer.rs`, and
  `RFC-007` in `conflict_resolution.rs`. Capturing those decisions would make them reviewable.
- **No `CODEOWNERS`** was present at the time.
- **CI at the time had no dedicated lint step:** it ran `tsc && vite build`, tests,
  and cross-platform `cargo check`/`cargo test`, but neither ESLint nor
  `cargo clippy`. This is a historical finding; inspect the current workflow before acting.
- **Test-script mismatch:** `package.json` used `vitest run` for its `"test"` script (`npm test`), while
  old comments in `ci.yml` and §4 of `AGENTS.md` described `node --test`, which
  belonged to a separate `test:node` script not explicitly run by CI then.
- **A strength in i18n:** `pt-BR.ts` was typed as `Record<MessageKey, string>`
  against `en.ts`. `npm run build` therefore caught missing or extra keys
  structurally without a separate lint script.
- **Changelog discipline:** `docs/CHANGELOG.md` was maintained actively under
  `[Unreleased]` and tracked ongoing work.
- A temporary AI-session handoff note was removed from `docs/` before public release.

---

## 6. Severity matrix

| Finding | Area | Impact | Effort | Recommendation |
|---|---|---|---|---|
| `projectsStore.ts` god object (3,080 lines) | Frontend | High | L | Split into domain slices |
| Frontend test coverage about 9%, none for components/stores/hooks | Frontend | High | L | Test `projectsStore`, `XTermView`, and `ProjectSidebar` first |
| `AGENTS.md` referenced nonexistent docs/layout | Governance | High | S | Correct or remove broken references |
| 24/50 Rust modules had no tests | Backend | Medium-high | M | Prioritize `cli_resolver.rs`, `profiles.rs`, session parsing |
| Frontend duplication (600-700 lines) | Frontend | Medium | M | `createCache<T>`, `usePolling`, generic `<UsageCard/>` |
| Backend duplication (150-200 lines) | Backend | Medium | S-M | `provider_common.rs` |
| No formal ADR/RFC files despite named decisions | Governance | Medium | S | Document RFC-003/004/006/007 |
| Broad Zustand selectors | Performance | Medium | M | Per-ID selectors and `useShallow` |
| `save_projects` lacked `spawn_blocking` | Backend/performance | Low-medium | S | Match the `clone_github_repo` pattern |
| Missing `useCallback`/`useMemo` in sidebar/canvas | Performance | Medium | S-M | Memoize handlers and groupings |
| Static `mermaid`/`cytoscape` and about 25 modals | Performance | Low-medium | S | Consider `React.lazy()` |
| `GhosttySurface` polled at 700 ms per pane | Performance | Low-medium | S | Lengthen interval or use push events |
| No `CODEOWNERS` or CI lint | Governance | Low | S | Add ownership and ESLint/clippy checks |
| `test` versus `test:node` description drift | Governance | Low | S | Align CI and agent guidance with actual scripts |
| Temporary handoff note as permanent documentation | Governance | Low | S | Resolved before public release |
| Two parallel agent-type arrays | Frontend | Low | S | Unify in `types.ts` |
| Minor structure/naming inconsistencies | Frontend | Low | S | Standardize conventions |

---

## 7. Scope note

This is a diagnostic with targeted recommendations, not a sequenced refactoring plan. The
assessment changed no code. The owner decides priority, order, and whether each finding
justifies the cost. Several low-impact items can be fixed independently; the high-impact
store, testing, and agent-guidance findings need their own discussion before implementation.
