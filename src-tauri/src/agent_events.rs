// Listener da POC do canvas de subagents (Fase 1).
//
// O Claude Code dispara hooks `SubagentStart`/`SubagentStop` como POST HTTP

use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 9123;
const MAX_PORT: u16 = 9143;
const BODY_LIMIT: u64 = 1024 * 1024; // 1 MB
static LISTENER_PORT: AtomicU16 = AtomicU16::new(0);
static LISTENER_TOKEN: OnceLock<String> = OnceLock::new();

fn project_root_or_directory(repo: &str) -> Result<PathBuf, String> {
    if let Ok(root) = crate::git_control::repository_root(repo) {
        return Ok(root);
    }
    let path = PathBuf::from(repo.trim())
        .canonicalize()
        .map_err(|_| "directory_not_found".to_string())?;
    if path.is_dir() {
        Ok(path)
    } else {
        Err("directory_not_found".to_string())
    }
}

fn init_token() -> &'static str {
    LISTENER_TOKEN.get_or_init(|| nanoid::nanoid!(32))
}

fn check_token(request: &tiny_http::Request) -> bool {
    let expected = init_token();
    // Header names are case-insensitive, and clients do send them lowercased.
    request
        .headers()
        .iter()
        .any(|h| h.field.equiv("X-mosAIco-Token") && h.value.as_str() == expected)
}

fn listener_addr(port: u16) -> String {
    format!("{HOST}:{port}")
}

fn listener_endpoint(port: u16) -> String {
    format!("http://{HOST}:{port}")
}

fn current_listener_port() -> Option<u16> {
    let port = LISTENER_PORT.load(Ordering::SeqCst);
    (port != 0).then_some(port)
}

fn wait_for_listener_port() -> Option<u16> {
    let start = Instant::now();
    loop {
        if let Some(port) = current_listener_port() {
            return Some(port);
        }
        if start.elapsed() >= Duration::from_secs(2) {
            return None;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[tauri::command]
pub fn agent_hooks_endpoint() -> Result<String, String> {
    let port = wait_for_listener_port()
        .ok_or_else(|| "listener de agents ainda nao esta disponivel".to_string())?;
    Ok(listener_endpoint(port))
}

#[tauri::command]
pub fn agent_hooks_token() -> String {
    init_token().to_string()
}

#[tauri::command]
pub fn agent_hooks_settings_path(
    planner_id: String,
    orchestrator: Option<bool>,
) -> Result<String, String> {
    let orchestrator = orchestrator.unwrap_or(true);
    let port = wait_for_listener_port()
        .ok_or_else(|| "listener de agents ainda nao esta disponivel".to_string())?;
    let endpoint = listener_endpoint(port);
    // Namespaced by port and planner so each Claude terminal gets its own file and its hooks carry
    // the id back, the same way the orchestrator MCP config does per terminal.
    let safe_planner: String = planner_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let variant = if orchestrator { "full" } else { "session" };
    let path = std::env::temp_dir()
        .join(format!("mosaico-agent-hooks-{port}-{variant}-{safe_planner}.json"));
    let token = init_token();
    let hook = serde_json::json!([
        { "hooks": [ {
            "type": "http",
            "url": format!("{endpoint}/hook"),
            "timeout": 5,
            "headers": { "X-mosAIco-Token": token, "X-mosAIco-Planner": planner_id }
        } ] }
    ]);

    // Both carry `session_id`, the only authoritative answer to which conversation a pane sits on
    // once `/clear` or an in-CLI `/resume` moves it off the id it was launched with.
    let mut hooks = serde_json::Map::new();
    hooks.insert("SessionStart".to_string(), hook.clone());
    hooks.insert("UserPromptSubmit".to_string(), hook.clone());

    let mut settings = serde_json::Map::new();
    if orchestrator {
        settings.insert(
            "teammateMode".to_string(),
            serde_json::Value::String("in-process".to_string()),
        );
        for event in [
            "SubagentStart",
            "SubagentStop",
            "PreToolUse",
            "PostToolUse",
            "TeammateIdle",
            "TaskCreated",
            "TaskCompleted",
        ] {
            hooks.insert(event.to_string(), hook.clone());
        }
    }
    settings.insert("hooks".to_string(), serde_json::Value::Object(hooks));

    let body = serde_json::to_string_pretty(&serde_json::Value::Object(settings))
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

const CODEX_HOOKS_MARK_START: &str = "# mosaico-managed-hooks-start";
const CODEX_HOOKS_MARK_END: &str = "# mosaico-managed-hooks-end";

// The listener port moves between runs, so it must not reach the filename: Codex would read a
// changed command and ask to trust the hooks again. The exe path keeps dev and prod apart.
fn install_tag() -> &'static str {
    static TAG: OnceLock<String> = OnceLock::new();
    TAG.get_or_init(|| {
        use sha2::{Digest, Sha256};
        let exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_lowercase())
            .unwrap_or_else(|_| "mosaico".to_string());
        // Independent test runners must not overwrite each other's endpoint or delete the script.
        #[cfg(test)]
        let exe = format!("{exe}:{}", std::process::id());
        let digest = Sha256::digest(exe.as_bytes());
        digest.iter().take(4).map(|b| format!("{b:02x}")).collect()
    })
}

#[cfg(windows)]
fn ps_escape(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(unix)]
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(unix)]
fn write_private_script(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| format!("script_open_failed:{error}"))?;
    file.set_permissions(std::fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("script_permissions_failed:{error}"))?;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("script_write_failed:{error}"))
}

fn toml_string(value: &str) -> String {
    toml_edit::Value::from(value).to_string()
}

/// Codex CLI hooks only run `command`/`commandWindows` handlers — there is no built-in http type
/// like Claude Code's, so a platform-specific forwarder receives Codex's hook JSON on stdin. One script
/// per install, never per terminal or per port: Codex asks to trust .codex/config.toml again
/// whenever it changes, so the endpoint lives inside the script and the terminal identifies itself
/// through MOSAICO_PLANNER at run time.
#[cfg(windows)]
fn write_codex_hook_forwarder(port: u16) -> Result<PathBuf, String> {
    let endpoint = listener_endpoint(port);
    let token = init_token();
    let script = format!(
        "$body = [Console]::In.ReadToEnd()\r\n\
         $planner = $env:MOSAICO_PLANNER\r\n\
         try {{\r\n\
         \x20\x20Invoke-RestMethod -Uri '{endpoint}/hook' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 4 -Headers @{{ 'X-mosAIco-Token' = '{token}'; 'X-mosAIco-Planner' = $planner; 'X-mosAIco-Agent' = 'codex' }} | Out-Null\r\n\
         }} catch {{ [Console]::Error.WriteLine('[mosaico-hook] ' + $_.Exception.Message) }}\r\n",
        endpoint = endpoint,
        token = ps_escape(token),
    );
    let path = std::env::temp_dir().join(format!("mosaico-codex-hook-forward-{}.ps1", install_tag()));
    std::fs::write(&path, script).map_err(|e| format!("write_failed:{e}"))?;
    Ok(path)
}

#[cfg(unix)]
fn write_codex_hook_forwarder(port: u16) -> Result<PathBuf, String> {
    let script = format!(
        r#"#!/bin/sh
curl -fsS --max-time 4 -X POST -H 'Content-Type: application/json' \
  -H 'X-mosAIco-Token: {token}' \
  -H "X-mosAIco-Planner: $MOSAICO_PLANNER" \
  -H 'X-mosAIco-Agent: codex' --data-binary @- \
  '{endpoint}/hook' >/dev/null || echo '[mosaico-hook] forwarding failed' >&2
"#,
        token = init_token(),
        endpoint = listener_endpoint(port),
    );
    let path = std::env::temp_dir().join(format!("mosaico-codex-hook-forward-{}.sh", install_tag()));
    write_private_script(&path, &script)?;
    Ok(path)
}

const CODEX_MCP_MARK_START: &str = "# mosaico-managed-mcp-start";
const CODEX_MCP_MARK_END: &str = "# mosaico-managed-mcp-end";

/// Codex's MCP client only declares servers via `command`/`args` (stdio), unlike Claude Code's
/// remote `http` support — this script bridges stdin/stdout JSON-RPC to mosAIco's `/mcp` endpoint.
#[cfg(windows)]
fn write_codex_mcp_bridge(port: u16) -> Result<PathBuf, String> {
    let endpoint = listener_endpoint(port);
    let token = init_token();
    let script = format!(
        "$planner = $env:MOSAICO_PLANNER\r\n\
         while ($line = [Console]::In.ReadLine()) {{\r\n\
         \x20\x20if ([string]::IsNullOrWhiteSpace($line)) {{ continue }}\r\n\
         \x20\x20try {{\r\n\
         \x20\x20\x20\x20$client = New-Object System.Net.WebClient\r\n\
         \x20\x20\x20\x20$client.Encoding = [System.Text.Encoding]::UTF8\r\n\
         \x20\x20\x20\x20$client.Headers.Add('Content-Type', 'application/json')\r\n\
         \x20\x20\x20\x20$client.Headers.Add('X-mosAIco-Token', '{token}')\r\n\
         \x20\x20\x20\x20$client.Headers.Add('X-mosAIco-Planner', $planner)\r\n\
         \x20\x20\x20\x20$resp = $client.UploadString('{endpoint}/mcp', 'POST', $line)\r\n\
         \x20\x20\x20\x20if ($resp) {{\r\n\
         \x20\x20\x20\x20\x20\x20[Console]::Out.WriteLine($resp)\r\n\
         \x20\x20\x20\x20\x20\x20[Console]::Out.Flush()\r\n\
         \x20\x20\x20\x20}}\r\n\
         \x20\x20}} catch {{\r\n\
         \x20\x20\x20\x20[Console]::Error.WriteLine('[mosaico-mcp] ' + $_.Exception.Message)\r\n\
         \x20\x20\x20\x20exit 1\r\n\
         \x20\x20}} finally {{\r\n\
         \x20\x20\x20\x20if ($client) {{ $client.Dispose(); $client = $null }}\r\n\
         \x20\x20}}\r\n\
         }}\r\n",
        endpoint = endpoint,
        token = ps_escape(token),
    );
    let path = std::env::temp_dir().join(format!("mosaico-codex-mcp-bridge-{}.ps1", install_tag()));
    std::fs::write(&path, script).map_err(|e| format!("write_failed:{e}"))?;
    Ok(path)
}

#[cfg(unix)]
fn write_codex_mcp_bridge(port: u16) -> Result<PathBuf, String> {
    let script = format!(
        r#"#!/bin/sh
while IFS= read -r line; do
  [ -n "$line" ] || continue
  response=$(printf '%s' "$line" | curl -fsS --max-time 30 -X POST \
    -H 'Content-Type: application/json' \
    -H 'X-mosAIco-Token: {token}' \
    -H "X-mosAIco-Planner: $MOSAICO_PLANNER" \
    --data-binary @- '{endpoint}/mcp') || exit 1
  [ -z "$response" ] || printf '%s\n' "$response"
done
"#,
        token = init_token(),
        endpoint = listener_endpoint(port),
    );
    let path = std::env::temp_dir().join(format!("mosaico-codex-mcp-bridge-{}.sh", install_tag()));
    write_private_script(&path, &script)?;
    Ok(path)
}

fn codex_mcp_config_write_inner(repo: String, _planner_id: String) -> Result<(), String> {
    let port = wait_for_listener_port()
        .ok_or_else(|| "listener de agents ainda nao esta disponivel".to_string())?;
    let script_path = write_codex_mcp_bridge(port)?;

    let root = project_root_or_directory(&repo)?;
    let codex_dir = root.join(".codex");
    std::fs::create_dir_all(&codex_dir).map_err(|e| format!("mkdir_failed:{e}"))?;
    let path = codex_dir.join("config.toml");

    let existing = if path.is_file() {
        std::fs::read_to_string(&path).map_err(|e| format!("read_failed:{e}"))?
    } else {
        String::new()
    };

    let mut kept_lines: Vec<&str> = Vec::new();
    let mut skipping = false;
    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed == CODEX_MCP_MARK_START {
            skipping = true;
            continue;
        }
        if trimmed == CODEX_MCP_MARK_END {
            skipping = false;
            continue;
        }
        if !skipping {
            kept_lines.push(line);
        }
    }
    let mut body = kept_lines.join("\n");
    if !body.is_empty() && !body.ends_with('\n') {
        body.push('\n');
    }

    let script_toml = toml_string(&script_path.to_string_lossy());
    let (command, args) = if cfg!(windows) {
        ("powershell.exe", format!("[\"-NoProfile\", \"-ExecutionPolicy\", \"Bypass\", \"-File\", {script_toml}]"))
    } else {
        ("sh", format!("[{script_toml}]"))
    };
    body.push_str(&format!(
        "\n{CODEX_MCP_MARK_START}\n[mcp_servers.mosaico]\ncommand = {command_toml}\nargs = {args}\n{CODEX_MCP_MARK_END}\n",
        command_toml = toml_string(command),
    ));

    std::fs::write(&path, body).map_err(|e| format!("write_failed:{e}"))
}

/// Writes (idempotently, replacing its own prior block) the `[mcp_servers.mosaico]` section that
/// registers this Codex terminal as an orchestrator planner — so a Codex-driven session can call
/// `mosaico_delegate` too, same as a Claude terminal already can.
#[tauri::command]
pub async fn codex_mcp_config_write(
    app: tauri::AppHandle,
    repo: String,
    planner_id: String,
    planner_label: String,
    planner_agent: String,
) -> Result<(), String> {
    let config_planner_id = planner_id.clone();
    tokio::task::spawn_blocking(move || codex_mcp_config_write_inner(repo, config_planner_id))
        .await
        .map_err(|error| format!("codex_mcp_config_write: blocking task failed: {error}"))??;
    let state = app.state::<crate::orchestrator::OrchestratorState>();
    crate::orchestrator::prepare(&app, &state)?;
    state.core().register_planner(crate::orchestrator_core::Planner {
        id: planner_id,
        label: planner_label,
        agent: planner_agent,
    });
    Ok(())
}

fn codex_hooks_config_write_inner(repo: String, _planner_id: String) -> Result<(), String> {
    let port = wait_for_listener_port()
        .ok_or_else(|| "listener de agents ainda nao esta disponivel".to_string())?;
    let script_path = write_codex_hook_forwarder(port)?;

    let root = project_root_or_directory(&repo)?;
    let codex_dir = root.join(".codex");
    std::fs::create_dir_all(&codex_dir).map_err(|e| format!("mkdir_failed:{e}"))?;
    let path = codex_dir.join("config.toml");

    let existing = if path.is_file() {
        std::fs::read_to_string(&path).map_err(|e| format!("read_failed:{e}"))?
    } else {
        String::new()
    };

    let mut kept_lines: Vec<&str> = Vec::new();
    let mut skipping = false;
    for line in existing.lines() {
        let trimmed = line.trim();
        if trimmed == CODEX_HOOKS_MARK_START {
            skipping = true;
            continue;
        }
        if trimmed == CODEX_HOOKS_MARK_END {
            skipping = false;
            continue;
        }
        if !skipping {
            kept_lines.push(line);
        }
    }
    let mut body = kept_lines.join("\n");
    if !body.is_empty() && !body.ends_with('\n') {
        body.push('\n');
    }

    #[cfg(windows)]
    let command = "true".to_string();
    #[cfg(windows)]
    let windows_command = Some(format!(
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{}\"",
        script_path.display()
    ));
    #[cfg(unix)]
    let command = format!("sh {}", shell_quote(&script_path.to_string_lossy()));
    #[cfg(unix)]
    let windows_command: Option<String> = None;
    let mut block = String::new();
    block.push_str(&format!("\n{CODEX_HOOKS_MARK_START}\n"));
    for event in ["SubagentStart", "SubagentStop"] {
        block.push_str(&format!(
            "[[hooks.{event}]]\nmatcher = \".*\"\n\n[[hooks.{event}.hooks]]\ntype = \"command\"\ncommand = {command_toml}\n",
            command_toml = toml_string(&command),
        ));
        if let Some(windows_command) = &windows_command {
            block.push_str(&format!(
                "commandWindows = {}\n",
                toml_string(windows_command)
            ));
        }
        block.push_str("timeout = 5\n\n");
    }
    block.push_str(&format!("{CODEX_HOOKS_MARK_END}\n"));
    body.push_str(&block);

    std::fs::write(&path, body).map_err(|e| format!("write_failed:{e}"))
}

/// Writes (idempotently, replacing its own prior block) the `[hooks]` section that reports this
/// Codex terminal's own subagents back to mosAIco, tagged with `planner_id` so the orchestrator
/// canvas can hang them off the terminal that spawned them.
#[tauri::command]
pub async fn codex_hooks_config_write(repo: String, planner_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || codex_hooks_config_write_inner(repo, planner_id))
        .await
        .map_err(|error| format!("codex_hooks_config_write: falha na task bloqueante: {error}"))?
}

pub fn start_listener(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_error: Option<String> = None;
        let mut bound: Option<(tiny_http::Server, u16)> = None;

        for port in DEFAULT_PORT..=MAX_PORT {
            let addr = listener_addr(port);
            match tiny_http::Server::http(&addr) {
                Ok(server) => {
                    bound = Some((server, port));
                    break;
                }
                Err(e) => {
                    last_error = Some(format!("{addr}: {e}"));
                }
            }
        }

        let Some((server, port)) = bound else {
            eprintln!(
                "[agent_events] falha ao subir listener em {HOST}:{DEFAULT_PORT}-{MAX_PORT}: {}",
                last_error.unwrap_or_else(|| "sem erro detalhado".to_string())
            );
            return;
        };

        LISTENER_PORT.store(port, Ordering::SeqCst);
        eprintln!("[agent_events] ouvindo em {}", listener_addr(port));

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();

            if !check_token(&request) {
                let _ = request.respond(tiny_http::Response::empty(401));
                continue;
            }

            let mut body = String::new();
            if let Err(e) = request
                .as_reader()
                .take(BODY_LIMIT)
                .read_to_string(&mut body)
            {
                eprintln!("[agent_events] erro lendo corpo: {e}");
                let _ = request.respond(tiny_http::Response::empty(400));
                continue;
            }

            // processo real (claude/codex/opencode) via
            // `curl -X POST /spawn -d '{"agent":"codex","task":"...","mode":"exec"}'`.
            // O mosAIco emite `agent-spawn`; o front sobe um PTY worker. Campos:

            if url.starts_with("/mcp") {
                let planner = request
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("X-mosAIco-Planner"))
                    .map(|h| h.value.as_str().to_string());
                let app = app.clone();
                std::thread::spawn(move || {
                    let state = app.state::<crate::orchestrator::OrchestratorState>();
                    match crate::orchestrator::handle_mcp_body(
                        Some(&app),
                        &state,
                        &body,
                        planner.as_deref(),
                    ) {
                        Ok(Some(payload)) => {
                            let header =
                                tiny_http::Header::from_bytes("Content-Type", "application/json")
                                    .expect("static header");
                            let _ = request.respond(
                                tiny_http::Response::from_string(payload).with_header(header),
                            );
                        }
                        Ok(None) => {
                            let _ = request.respond(tiny_http::Response::empty(202));
                        }
                        Err(error) => {
                            let _ = request.respond(
                                tiny_http::Response::from_string(error).with_status_code(503),
                            );
                        }
                    }
                });
                continue;
            }

            if url.starts_with("/spawn") {
                match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(payload) => {
                        let agent = payload
                            .get("agent")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if !matches!(agent.as_str(), "shell" | "claude" | "codex" | "opencode") {
                            let _ = request.respond(
                                tiny_http::Response::from_string(
                                    "agent invalido (use claude|codex|opencode)",
                                )
                                .with_status_code(400),
                            );
                            continue;
                        }
                        let job_id = payload
                            .get("job_id")
                            .and_then(|value| value.as_str())
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("sandbox-job-{}", nanoid::nanoid!(10)));
                        let mut event_payload = payload;
                        if let Some(object) = event_payload.as_object_mut() {
                            object.insert(
                                "job_id".to_string(),
                                serde_json::Value::String(job_id.clone()),
                            );
                        }
                        eprintln!("[agent_events] spawn accepted");
                        let _ = app.emit("agent-spawn", &event_payload);
                        let response = serde_json::json!({
                            "accepted": true,
                            "job_id": job_id,
                            "agent": agent,
                            "status": "queued"
                        });
                        let _ = request.respond(
                            tiny_http::Response::from_string(response.to_string()).with_header(
                                tiny_http::Header::from_bytes("Content-Type", "application/json")
                                    .unwrap(),
                            ),
                        );
                    }
                    Err(e) => {
                        let _ = request.respond(
                            tiny_http::Response::from_string(format!("/spawn espera JSON: {e}"))
                                .with_status_code(400),
                        );
                    }
                }
                continue;
            }

            // Alias legado: o control plane antigo despacha texto cru pro codex

            // emitindo agent-spawn com agent=codex.
            if url.starts_with("/codex") {
                let task = body.trim().to_string();
                eprintln!("[agent_events] /codex (legado) task ({} chars)", task.len());
                let payload = serde_json::json!({ "agent": "codex", "task": task });
                let _ = app.emit("agent-spawn", &payload);
                let _ = request.respond(tiny_http::Response::from_string(
                    "queued no terminal codex do mosAIco",
                ));
                continue;
            }

            // Bridge do plugin OpenCode (opencode_bridge.rs) — reporta
            // working/idle real de sessoes OpenCode. Campos: directory

            // state ("working" | "idle").
            if url.starts_with("/opencode-status") {
                match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(payload) => {
                        let _ = app.emit("opencode-bridge-status", &payload);
                    }
                    Err(e) => eprintln!("[agent_events] /opencode-status payload inválido: {e}"),
                }
                let _ = request.respond(tiny_http::Response::empty(200));
                continue;
            }

            match serde_json::from_str::<serde_json::Value>(&body) {
                Ok(mut payload) => {
                    // Which Claude terminal this fired from, so the frontend can hang the subagent
                    // off the same planner tree as its Codex delegations.
                    if let Some(planner) = request
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv("X-mosAIco-Planner"))
                        .map(|h| h.value.as_str().to_string())
                    {
                        if let Some(object) = payload.as_object_mut() {
                            object.insert(
                                "plannerId".to_string(),
                                serde_json::Value::String(planner),
                            );
                        }
                    }

                    // Which CLI's own subagent mechanism fired this — Claude's http hook carries no
                    // such header, so its absence defaults to "claude" for backward compatibility.
                    let source_agent = request
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv("X-mosAIco-Agent"))
                        .map(|h| h.value.as_str().to_string())
                        .unwrap_or_else(|| "claude".to_string());
                    if let Some(object) = payload.as_object_mut() {
                        object.insert(
                            "sourceAgent".to_string(),
                            serde_json::Value::String(source_agent),
                        );
                    }

                    if let Err(e) = app.emit("agent-hook", &payload) {
                        eprintln!("[agent_events] falha ao emitir agent-hook: {e}");
                    }
                }
                Err(e) => eprintln!("[agent_events] POST não-JSON ignorado: {e}"),
            }

            let _ = request.respond(tiny_http::Response::empty(200));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{project_root_or_directory, toml_string};
    #[cfg(windows)]
    use std::path::PathBuf;

    #[test]
    fn non_git_project_uses_its_directory_for_codex_configuration() {
        let folder = std::env::temp_dir().join(format!("mosaico-codex-config-{}", nanoid::nanoid!(8)));
        std::fs::create_dir(&folder).expect("project folder");
        let resolved = project_root_or_directory(folder.to_str().expect("folder path"))
            .expect("a project need not have a Git repository");
        assert_eq!(resolved, folder.canonicalize().expect("canonical folder"));
        std::fs::remove_dir(&folder).expect("remove empty test folder");
    }

    #[test]
    fn toml_string_escapes_windows_paths() {
        let path = r#"C:\Users\sampleuser\AppData\Local\Temp\mosaico-\"bridge\".ps1"#;
        let document = format!("path = {}", toml_string(path))
            .parse::<toml_edit::DocumentMut>()
            .expect("generated path should be valid TOML");

        assert_eq!(document["path"].as_str(), Some(path));
    }

    #[cfg(windows)]
    fn run_windows_script(
        script: PathBuf,
        server: tiny_http::Server,
        input: &[u8],
        respond: impl FnOnce(tiny_http::Request) + Send + 'static,
    ) -> Result<std::process::Output, String> {
        use std::io::Write;
        use std::os::windows::io::AsRawHandle;
        use std::process::{Command, Stdio};
        use std::sync::Arc;
        use windows_sys::Win32::Foundation::WAIT_OBJECT_0;
        use windows_sys::Win32::System::Threading::WaitForSingleObject;

        struct ScriptFile(PathBuf);
        impl Drop for ScriptFile {
            fn drop(&mut self) {
                std::fs::remove_file(&self.0).expect("remove test script");
            }
        }

        let script = ScriptFile(script);
        let mut child = Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script.0)
            .env("MOSAICO_PLANNER", "pty-test")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Windows PowerShell: {error}"))?;
        let server = Arc::new(server);
        let receiver = Arc::clone(&server);
        let response_thread = std::thread::spawn(move || {
            let request = receiver
                .recv()
                .map_err(|error| format!("receive request: {error}"))?;
            respond(request);
            Ok::<_, String>(())
        });
        let mut stdin = child.stdin.take().expect("stdin");
        let sent = stdin.write_all(input);
        drop(stdin);

        // Keep the listener alive throughout PowerShell startup and the request. This is only a
        // deadlock ceiling for the child, not a separate timer racing the client's first request.
        let finished = unsafe { WaitForSingleObject(child.as_raw_handle() as _, 60_000) };
        let killed = if finished != WAIT_OBJECT_0 {
            child.kill()
        } else {
            Ok(())
        };
        let output = child.wait_with_output();
        server.unblock();
        let response = response_thread.join();
        let output = output.map_err(|error| format!("PowerShell output: {error}"))?;
        let diagnostics = format!(
            "status={}\nstdout={}\nstderr={}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
        if finished != WAIT_OBJECT_0 {
            return Err(format!(
                "PowerShell did not finish (wait={finished}, kill={killed:?}): {diagnostics}"
            ));
        }
        if !output.status.success() {
            return Err(format!("PowerShell failed: {diagnostics}"));
        }
        sent.map_err(|error| format!("send script input: {error}; {diagnostics}"))?;
        response
            .map_err(|_| format!("response thread panicked: {diagnostics}"))?
            .map_err(|error| format!("{error}; {diagnostics}"))?;
        Ok(output)
    }

    #[cfg(windows)]
    #[test]
    fn codex_mcp_bridge_completes_a_windows_powershell_handshake() {
        let server = tiny_http::Server::http("127.0.0.1:0").expect("local test listener");
        let port = server.server_addr().to_ip().expect("IP listener").port();
        let script = super::write_codex_mcp_bridge(port).expect("bridge script");
        let token = super::init_token().to_string();
        let output = run_windows_script(
            script,
            server,
            b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n",
            move |request| {
                assert_eq!(request.url(), "/mcp");
                assert!(request.headers().iter().any(|header| {
                    header.field.equiv("X-mosAIco-Token") && header.value.as_str() == token
                }));
                request
                    .respond(tiny_http::Response::from_string(
                        r#"{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"mosaico"}}}"#,
                    ))
                    .expect("MCP response");
            },
        )
        .expect("bridge handshake");
        let message: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("JSON-RPC response on stdout");
        assert_eq!(message["result"]["serverInfo"]["name"], "mosaico");
    }

    #[cfg(windows)]
    #[test]
    fn codex_hook_forwarder_sends_the_planner_and_subagent_event() {
        let server = tiny_http::Server::http("127.0.0.1:0").expect("local test listener");
        let port = server.server_addr().to_ip().expect("IP listener").port();
        let script = super::write_codex_hook_forwarder(port).expect("hook script");
        let token = super::init_token().to_string();
        run_windows_script(
            script,
            server,
            b"{\"hook_event_name\":\"SubagentStart\",\"agent_id\":\"worker-1\"}",
            move |mut request| {
                assert_eq!(request.url(), "/hook");
                for (name, value) in [
                    ("X-mosAIco-Token", token.as_str()),
                    ("X-mosAIco-Planner", "pty-test"),
                    ("X-mosAIco-Agent", "codex"),
                ] {
                    assert!(request.headers().iter().any(|header| {
                        header.field.equiv(name) && header.value.as_str() == value
                    }));
                }
                let mut body = String::new();
                request
                    .as_reader()
                    .read_to_string(&mut body)
                    .expect("hook body");
                let event: serde_json::Value = serde_json::from_str(&body).expect("hook JSON");
                assert_eq!(event["hook_event_name"], "SubagentStart");
                request
                    .respond(tiny_http::Response::empty(200))
                    .expect("hook response");
            },
        )
        .expect("hook forwarding");
    }

    #[cfg(windows)]
    #[test]
    fn windows_script_failure_preserves_stderr_and_cleans_up_without_a_request() {
        let server = tiny_http::Server::http("127.0.0.1:0").expect("local test listener");
        let script =
            std::env::temp_dir().join(format!("mosaico-failing-script-{}.ps1", nanoid::nanoid!(8)));
        std::fs::write(
            &script,
            "[Console]::Error.WriteLine('expected-script-failure'); exit 17",
        )
        .expect("failing script");
        let error = run_windows_script(script.clone(), server, b"", |_| {
            panic!("unexpected request")
        })
        .expect_err("script must fail");
        assert!(error.contains("expected-script-failure"), "{error}");
        assert!(error.contains("17"), "{error}");
        assert!(!script.exists(), "test script must be removed on failure");
    }

    #[cfg(unix)]
    #[test]
    fn codex_mcp_bridge_completes_a_unix_shell_handshake() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        use std::time::Duration;

        let server = tiny_http::Server::http("127.0.0.1:0").expect("local test listener");
        let port = server.server_addr().to_ip().expect("IP listener").port();
        let script = super::write_codex_mcp_bridge(port).expect("bridge script");
        let token = super::init_token().to_string();
        let response_thread = std::thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("receive request")
                .expect("MCP request");
            assert_eq!(request.url(), "/mcp");
            assert!(request.headers().iter().any(|header| {
                header.field.equiv("X-mosAIco-Token") && header.value.as_str() == token
            }));
            request
                .respond(tiny_http::Response::from_string(
                    r#"{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"mosaico"}}}"#,
                ))
                .expect("MCP response");
        });

        let mut child = Command::new("sh")
            .arg(&script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("POSIX shell");
        child
            .stdin
            .take()
            .expect("stdin")
            .write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n")
            .expect("send initialize");
        let output = child.wait_with_output().expect("bridge output");
        response_thread.join().expect("response thread");
        let _ = std::fs::remove_file(script);
        assert!(
            output.status.success(),
            "bridge failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let message: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("JSON-RPC response on stdout");
        assert_eq!(message["result"]["serverInfo"]["name"], "mosaico");
    }

    #[cfg(unix)]
    #[test]
    fn codex_hook_forwarder_sends_the_planner_and_subagent_event() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        use std::time::Duration;

        let server = tiny_http::Server::http("127.0.0.1:0").expect("local test listener");
        let port = server.server_addr().to_ip().expect("IP listener").port();
        let script = super::write_codex_hook_forwarder(port).expect("hook script");
        let token = super::init_token().to_string();
        let response_thread = std::thread::spawn(move || {
            let mut request = server
                .recv_timeout(Duration::from_secs(10))
                .expect("receive request")
                .expect("hook request");
            assert_eq!(request.url(), "/hook");
            for (name, value) in [
                ("X-mosAIco-Token", token.as_str()),
                ("X-mosAIco-Planner", "pty-test"),
                ("X-mosAIco-Agent", "codex"),
            ] {
                assert!(request.headers().iter().any(|header| {
                    header.field.equiv(name) && header.value.as_str() == value
                }));
            }
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).expect("hook body");
            let event: serde_json::Value = serde_json::from_str(&body).expect("hook JSON");
            assert_eq!(event["hook_event_name"], "SubagentStart");
            request
                .respond(tiny_http::Response::empty(200))
                .expect("hook response");
        });

        let mut child = Command::new("sh")
            .arg(&script)
            .env("MOSAICO_PLANNER", "pty-test")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("POSIX shell");
        child
            .stdin
            .take()
            .expect("stdin")
            .write_all(b"{\"hook_event_name\":\"SubagentStart\",\"agent_id\":\"worker-1\"}")
            .expect("send hook");
        let output = child.wait_with_output().expect("hook output");
        response_thread.join().expect("response thread");
        let _ = std::fs::remove_file(script);
        assert!(
            output.status.success(),
            "hook failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
