//! Tauri glue for the delegation core in `orchestrator_core`.
//!
//! The MCP server is hosted in-process over HTTP on the `agent_events` listener, so worker state
//! lives next to the UI instead of in a sidecar.

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::cli_resolver;
use crate::orchestrator_core::{Core, Launcher, Planner};

const JOBS_EVENT: &str = "orchestrator://jobs";

#[derive(Default)]
pub struct OrchestratorState {
    core: Core,
    preparation: OnceLock<Result<(), String>>,
}

impl OrchestratorState {
    pub fn core(&self) -> &Core {
        &self.core
    }
}

/// Resolving launchers during setup keeps a missing Codex install from blocking app start; the
/// failure then surfaces as a delivery on the job that needed it. The PATH scan runs only once.
pub(crate) fn prepare(app: &AppHandle, state: &OrchestratorState) -> Result<(), String> {
    state
        .preparation
        .get_or_init(|| {
            let core = state.core.clone();
            // History outlives the app: what each worker was asked and reported is kept, and Codex keeps
            // the thread itself, so a worker can be started again with its context intact.
            prepare_store(
                &core,
                || crate::paths::orchestrator_store_path(app),
                |path| std::fs::metadata(path),
            )?;
            let handle = app.clone();
            core.set_observer(Arc::new(move |snapshot: Value| {
                let _ = handle.emit(JOBS_EVENT, snapshot);
            }));

            if let Some(program) = cli_resolver::find_windows_cli_launcher("codex") {
                let mut launcher = Launcher::codex_app_server(PathBuf::from(program));
                #[cfg(windows)]
                launcher.env.push((
                    "Path".to_string(),
                    crate::orchestrator_core::path_without_store_aliases(
                        &cli_resolver::rebuilt_path(),
                    ),
                ));
                core.set_launcher(launcher);
            }
            if let Some(program) = cli_resolver::find_windows_cli_launcher("claude") {
                core.set_launcher(Launcher::claude_headless(PathBuf::from(program)));
            }
            Ok(())
        })
        .clone()
}

fn prepare_store(
    core: &Core,
    resolve: impl FnOnce() -> Result<PathBuf, String>,
    metadata: impl FnOnce(&Path) -> std::io::Result<std::fs::Metadata>,
) -> Result<(), String> {
    let path = resolve().map_err(|error| {
        format!("prepare orchestrator persistence store: resolve path: {error}")
    })?;
    let parent = path.parent().ok_or_else(|| {
        format!(
            "prepare orchestrator persistence store: no parent directory for {}",
            path.display()
        )
    })?;
    std::fs::create_dir_all(parent).map_err(|error| {
        format!(
            "prepare orchestrator persistence store: create directory {}: {error}",
            parent.display()
        )
    })?;
    match metadata(&path) {
        Ok(file) if file.is_file() => {}
        Ok(file) => {
            let kind = if file.is_dir() {
                "directory"
            } else {
                "unsupported file type"
            };
            return Err(format!(
                "prepare orchestrator persistence store: expected a regular file at {}, found {kind}",
                path.display()
            ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "prepare orchestrator persistence store: inspect store path {}: {error}",
                path.display()
            ));
        }
    }
    core.set_store(path);
    core.restore();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> PathBuf {
        std::env::temp_dir()
            .join(format!("mosaico-orchestrator-store-{}", nanoid::nanoid!()))
            .join("orchestrator-jobs.json")
    }

    #[test]
    fn desktop_store_preparation_accepts_a_new_store_file() {
        let core = Core::default();
        let path = temp_store();
        prepare_store(&core, || Ok(path.clone()), |path| std::fs::metadata(path))
            .expect("prepare desktop store");
        assert!(!path.exists(), "a missing store is valid on first startup");

        core.register_planner(Planner {
            id: "planner".to_string(),
            label: "Planner".to_string(),
            agent: "codex".to_string(),
        });
        assert!(path.is_file(), "the desktop core must write to its store");
        std::fs::remove_dir_all(path.parent().unwrap()).expect("remove test store");
    }

    #[test]
    fn desktop_store_preparation_accepts_an_existing_regular_file() {
        let core = Core::default();
        let path = temp_store();
        std::fs::create_dir_all(path.parent().unwrap()).expect("create test directory");
        std::fs::write(&path, b"{\"jobs\":[],\"planners\":[]}").expect("create test store");

        prepare_store(&core, || Ok(path.clone()), |path| std::fs::metadata(path))
            .expect("prepare existing desktop store");
        core.register_planner(Planner {
            id: "existing-store".to_string(),
            label: "Existing store".to_string(),
            agent: "codex".to_string(),
        });
        let stored = std::fs::read_to_string(&path).expect("read persisted planner");
        assert!(stored.contains("existing-store"));
        std::fs::remove_dir_all(path.parent().unwrap()).expect("remove test store");
    }

    #[test]
    fn desktop_store_resolution_failure_returns_error_before_configuring_core() {
        let core = Core::default();
        let error = prepare_store(
            &core,
            || Err("forced store resolution failure".to_string()),
            |path| std::fs::metadata(path),
        )
        .expect_err("desktop store resolution must fail");
        assert!(error.contains("prepare orchestrator persistence store"));
        assert!(error.contains("forced store resolution failure"));
        assert!(core.snapshot()["planners"].as_array().unwrap().is_empty());
    }

    #[test]
    fn desktop_store_directory_failure_returns_the_path_and_operation() {
        let core = Core::default();
        let path = temp_store();
        let directory = path.parent().unwrap();
        std::fs::create_dir_all(directory).expect("create test directory");
        let blocker = directory.join("blocker");
        std::fs::write(&blocker, b"blocker").expect("create blocking file");
        let blocked_store = blocker.join("orchestrator-jobs.json");

        let error = prepare_store(
            &core,
            || Ok(blocked_store.clone()),
            |path| std::fs::metadata(path),
        )
        .expect_err("a file cannot be used as the store directory");
        assert!(error.contains("create directory"));
        assert!(error.contains(&blocker.display().to_string()));
        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn desktop_store_preparation_rejects_a_directory_at_the_store_path() {
        let core = Core::default();
        let path = temp_store();
        std::fs::create_dir_all(&path).expect("create directory at store path");

        let error = prepare_store(&core, || Ok(path.clone()), |path| std::fs::metadata(path))
            .expect_err("store path must be a regular file");
        assert!(error.contains("found directory"));
        assert!(error.contains(&path.display().to_string()));
        std::fs::remove_dir_all(path.parent().unwrap()).expect("remove test directory");
    }

    #[test]
    fn desktop_store_metadata_failure_does_not_configure_a_store() {
        let core = Core::default();
        let path = temp_store();
        let error = prepare_store(
            &core,
            || Ok(path.clone()),
            |_| {
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "forced metadata failure",
                ))
            },
        )
        .expect_err("metadata failure must stop desktop preparation");
        assert!(error.contains("inspect store path"));
        assert!(error.contains(&path.display().to_string()));
        assert!(error.contains("forced metadata failure"));

        core.register_planner(Planner {
            id: "memory-only-after-error".to_string(),
            label: "Memory only".to_string(),
            agent: "codex".to_string(),
        });
        assert!(
            !path.exists(),
            "failed preparation must not configure the store"
        );
        std::fs::remove_dir_all(path.parent().unwrap()).expect("remove test directory");
    }

    #[test]
    fn generic_core_can_still_work_without_a_store() {
        let core = Core::default();
        core.register_planner(Planner {
            id: "memory-only".to_string(),
            label: "Memory only".to_string(),
            agent: "codex".to_string(),
        });
        assert_eq!(core.snapshot()["planners"][0]["id"], "memory-only");
    }
}

pub fn handle_mcp_body(
    app: Option<&AppHandle>,
    state: &OrchestratorState,
    body: &str,
    planner: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(app) = app {
        prepare(app, state)?;
    }
    Ok(crate::orchestrator_core::handle_mcp_body(
        &state.core,
        body,
        planner,
    ))
}

#[tauri::command]
pub fn orchestrator_mcp_config_path(
    app: AppHandle,
    planner_id: String,
    planner_label: String,
    planner_agent: String,
) -> Result<String, String> {
    let state = app.state::<OrchestratorState>();
    prepare(&app, &state)?;
    state.core.register_planner(Planner {
        id: planner_id.clone(),
        label: planner_label,
        agent: planner_agent,
    });
    let endpoint = crate::agent_events::agent_hooks_endpoint()?;
    let token = crate::agent_events::agent_hooks_token();
    let config = json!({
        "mcpServers": {
            "mosaico": {
                "type": "http",
                "url": format!("{endpoint}/mcp"),
                "headers": {
                    "X-mosAIco-Token": token,
                    // One config per terminal, so a request says which session it came from.
                    "X-mosAIco-Planner": planner_id
                }
            }
        }
    });
    // Namespaced by port, like the agent hooks file: two instances writing one shared path would
    // leave whichever started last owning it, pointing the other one's terminals at the wrong app.
    let port = endpoint.rsplit(':').next().unwrap_or("0");
    let safe: String = planner_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let path = std::env::temp_dir().join(format!("mosaico-orchestrator-mcp-{port}-{safe}.json"));
    let body = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    std::fs::write(&path, body).map_err(|error| format!("write_failed:{error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn orchestrator_jobs(
    app: AppHandle,
    state: tauri::State<'_, OrchestratorState>,
) -> Result<Value, String> {
    prepare(&app, &state)?;
    Ok(state.core.snapshot())
}

#[tauri::command]
pub fn orchestrator_set_concurrency(state: tauri::State<'_, OrchestratorState>, limit: usize) {
    state.core.set_concurrency_limit(limit);
}

/// Fed by the same usage poll that drives the warning chip, so the planner and the person read the
/// same numbers at the same cadence.
#[tauri::command]
pub fn orchestrator_set_agent_fitness(
    state: tauri::State<'_, OrchestratorState>,
    agent: String,
    snapshot: Value,
) {
    state.core.set_agent_fitness(&agent, snapshot);
}

/// The pane answers a blocked worker directly: the person is already looking at the question.
#[tauri::command]
pub fn orchestrator_answer(
    state: tauri::State<'_, OrchestratorState>,
    job_id: String,
    decision: String,
) -> Result<Value, String> {
    state.core.answer(&job_id, &decision)
}

#[tauri::command]
pub fn orchestrator_job_diff(
    state: tauri::State<'_, OrchestratorState>,
    job_id: String,
) -> Result<String, String> {
    state.core.job_diff(&job_id)
}

/// Lets the pane talk to one worker without going through the lead. A worker mid-turn is steered so
/// the correction lands on what it is doing now; an idle one gets the message as a new turn.
#[tauri::command]
pub fn orchestrator_message(
    state: tauri::State<'_, OrchestratorState>,
    job_id: String,
    message: String,
    steer: bool,
) -> Result<Value, String> {
    let mut arguments = serde_json::Map::new();
    arguments.insert("jobId".into(), Value::String(job_id));
    arguments.insert("message".into(), Value::String(message));
    let tool = if steer { "mosaico_steer" } else { "mosaico_send" };
    crate::orchestrator_core::call_tool(&state.core, tool, &arguments, None)
}
