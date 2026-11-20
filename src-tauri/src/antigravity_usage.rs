use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::cli_resolver;

const USAGE_TIMEOUT: Duration = Duration::from_secs(20);
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct AntigravityQuotaBucket {
    pub label: String,
    pub models: Vec<String>,
    pub used_percent: f64,
    pub remaining_percent: f64,
    pub resets_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AntigravityUsage {
    /// ready | no_cli | no_auth | unavailable
    pub status: String,
    pub cli_path: String,
    pub used_percent: f64,
    pub rate_limited: bool,
    pub buckets: Vec<AntigravityQuotaBucket>,
}

fn empty_usage(status: &str, cli_path: String) -> AntigravityUsage {
    AntigravityUsage {
        status: status.to_string(),
        cli_path,
        used_percent: 0.0,
        rate_limited: false,
        buckets: Vec::new(),
    }
}

fn command_output(launcher: &std::path::Path, args: &[&str], timeout: Duration) -> Result<String, String> {
    let mut command = Command::new(launcher);
    command
        .args(args)
        .env("AGY_CLI_DISABLE_AUTO_UPDATE", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::git_control::hide_console(&mut command);
    let mut child = command.spawn().map_err(|_| "spawn_failed".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "stdout_unavailable".to_string())?;
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        let result = std::io::BufReader::new(stdout).read_to_string(&mut output);
        (output, result)
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("timed_out".to_string());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err("wait_failed".to_string());
            }
        }
    };

    let (output, read_result) = reader.join().map_err(|_| "read_failed".to_string())?;
    read_result.map_err(|_| "read_failed".to_string())?;
    if !status.success() {
        return Err("command_failed".to_string());
    }
    Ok(output)
}

fn supports_structured_usage(launcher: &std::path::Path) -> bool {
    let Ok(output) = command_output(launcher, &["--version"], VERSION_TIMEOUT) else {
        return false;
    };
    let Some(version) = parse_version(&output) else {
        return false;
    };
    version >= (1, 1, 11)
}

fn parse_version(output: &str) -> Option<(u64, u64, u64)> {
    for token in output.split(|ch: char| !ch.is_ascii_digit() && ch != '.') {
        let mut parts = token.split('.');
        let (Some(major), Some(minor), Some(patch)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if parts.next().is_some() {
            continue;
        }
        let Ok(major) = major.parse() else { continue };
        let Ok(minor) = minor.parse() else { continue };
        let Ok(patch) = patch.parse() else { continue };
        return Some((major, minor, patch));
    }
    None
}

fn number(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .or_else(|| value.and_then(Value::as_str).and_then(|s| s.parse().ok()))
}

fn find_usage_data(value: &Value) -> Option<&Value> {
    if let Some(command) = value.get("command") {
        if matches!(command.get("name").and_then(Value::as_str), Some("usage" | "quota")) {
            if let Some(data) = command.get("data") {
                return Some(data);
            }
        }
    }
    if value.get("groups").and_then(Value::as_array).is_some() {
        return Some(value);
    }
    value
        .as_object()?
        .values()
        .find_map(find_usage_data)
}

fn group_label(group: &Value) -> Option<&str> {
    ["name", "label", "title", "id"]
        .iter()
        .find_map(|key| group.get(key).and_then(Value::as_str))
}

fn parse_usage(body: &Value, cli_path: String) -> Result<AntigravityUsage, String> {
    let data = find_usage_data(body).ok_or_else(|| "usage_data_missing".to_string())?;
    let groups = data
        .get("groups")
        .and_then(Value::as_array)
        .ok_or_else(|| "quota_groups_missing".to_string())?;
    let mut buckets = Vec::new();

    for group in groups {
        let Some(group_name) = group_label(group).filter(|name| !name.trim().is_empty()) else {
            continue;
        };
        let Some(group_buckets) = group.get("buckets").and_then(Value::as_array) else {
            continue;
        };
        for bucket in group_buckets {
            if bucket.get("disabled").and_then(Value::as_bool) == Some(true) {
                continue;
            }
            let Some(remaining) = number(bucket.get("remaining_fraction"))
                .or_else(|| number(bucket.get("remainingFraction")))
            else {
                continue;
            };
            if !remaining.is_finite() {
                continue;
            }

            let window = bucket
                .get("window")
                .and_then(Value::as_str)
                .unwrap_or_else(|| bucket.get("id").and_then(Value::as_str).unwrap_or("quota"));
            let label = format!("{group_name} · {window}");
            let models = bucket
                .get("models")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .filter(|items| !items.is_empty())
                .unwrap_or_else(|| {
                    bucket
                        .get("id")
                        .and_then(Value::as_str)
                        .map(|id| vec![id.to_string()])
                        .unwrap_or_else(|| vec![group_name.to_string()])
                });
            let remaining_percent = (remaining.clamp(0.0, 1.0) * 100.0 * 10_000.0).round()
                / 10_000.0;
            let resets_at = bucket
                .get("reset_time")
                .and_then(Value::as_str)
                .or_else(|| bucket.get("resetTime").and_then(Value::as_str))
                .unwrap_or("")
                .to_string();
            buckets.push(AntigravityQuotaBucket {
                label,
                models,
                used_percent: (100.0 - remaining_percent).clamp(0.0, 100.0),
                remaining_percent,
                resets_at,
            });
        }
    }

    buckets.sort_by(|a, b| {
        b.used_percent
            .total_cmp(&a.used_percent)
            .then_with(|| a.label.cmp(&b.label))
    });
    if buckets.is_empty() {
        return Err("quota_buckets_missing".to_string());
    }

    let used_percent = buckets
        .iter()
        .map(|bucket| bucket.used_percent)
        .fold(0.0, f64::max);
    Ok(AntigravityUsage {
        status: "ready".to_string(),
        cli_path,
        used_percent,
        rate_limited: used_percent >= 99.9,
        buckets,
    })
}

#[tauri::command]
pub async fn get_antigravity_usage() -> Result<AntigravityUsage, String> {
    let Some(launcher) = cli_resolver::find_windows_cli_launcher("agy") else {
        return Ok(empty_usage("no_cli", String::new()));
    };
    let cli_path = launcher.to_string_lossy().to_string();
    let usage_launcher = launcher.clone();
    tokio::task::spawn_blocking(move || {
        if !supports_structured_usage(&usage_launcher) {
            return empty_usage("unavailable", cli_path);
        }
        let output = match command_output(
            &usage_launcher,
            &["--print", "/usage", "--output-format", "json"],
            USAGE_TIMEOUT,
        ) {
            Ok(output) => output,
            Err(_) => return empty_usage("unavailable", cli_path),
        };
        let Ok(body) = serde_json::from_str::<Value>(&output) else {
            return empty_usage("unavailable", cli_path);
        };
        parse_usage(&body, cli_path.clone())
            .unwrap_or_else(|_| empty_usage("unavailable", cli_path))
    })
    .await
    .map_err(|_| "antigravity usage task failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_structured_quota_from_agy_usage_response() {
        let body = serde_json::json!({
            "status": "SUCCESS",
            "command": {
                "name": "usage",
                "data": {
                    "groups": [
                        {
                            "id": "gemini",
                            "name": "Gemini Models",
                            "buckets": [
                                { "id": "gemini-weekly", "window": "weekly", "remaining_fraction": 0.9358, "reset_time": "2026-10-12T12:00:00Z" },
                                { "id": "gemini-5h", "window": "5h", "remaining_fraction": 0.75, "reset_time": "2026-10-05T20:00:00Z" }
                            ]
                        },
                        {
                            "id": "third-party",
                            "name": "Claude and GPT models",
                            "buckets": [
                                { "id": "3p-weekly", "window": "weekly", "remaining_fraction": 0.4404, "reset_time": "2026-10-12T12:00:00Z" },
                                { "id": "3p-5h", "window": "5h", "disabled": true }
                            ]
                        }
                    ]
                }
            }
        });

        let usage = parse_usage(&body, "agy.exe".to_string()).unwrap();
        assert_eq!(usage.status, "ready");
        assert_eq!(usage.buckets.len(), 3);
        assert_eq!(usage.buckets[0].label, "Claude and GPT models · weekly");
        assert!((usage.buckets[0].used_percent - 55.96).abs() < 0.001);
        assert!((usage.buckets[0].remaining_percent - 44.04).abs() < 0.001);
        assert!((usage.used_percent - 55.96).abs() < 0.001);
    }

    #[test]
    fn accepts_nested_command_envelopes_and_camel_case_fields() {
        let body = serde_json::json!({
            "result": {
                "command": {
                    "name": "quota",
                    "data": {
                        "groups": [{
                            "label": "Gemini",
                            "buckets": [{
                                "id": "weekly",
                                "window": "weekly",
                                "remainingFraction": "0.5",
                                "resetTime": "2026-10-12T12:00:00Z"
                            }]
                        }]
                    }
                }
            }
        });
        let usage = parse_usage(&body, "agy.exe".to_string()).unwrap();
        assert_eq!(usage.buckets[0].used_percent, 50.0);
    }

    #[test]
    fn rejects_unrecognized_or_disabled_quota_without_reporting_zero_usage() {
        let missing = serde_json::json!({ "models": {} });
        assert_eq!(parse_usage(&missing, "agy".to_string()).unwrap_err(), "usage_data_missing");

        let disabled = serde_json::json!({
            "command": { "name": "usage", "data": {
                "groups": [{ "name": "Gemini", "buckets": [{ "id": "weekly", "disabled": true }] }]
            }}
        });
        assert_eq!(parse_usage(&disabled, "agy".to_string()).unwrap_err(), "quota_buckets_missing");
    }

    #[test]
    fn requires_a_cli_version_with_structured_usage_support() {
        assert_eq!(parse_version("agy version 1.2.4"), Some((1, 2, 4)));
        assert_eq!(parse_version("1.1.11"), Some((1, 1, 11)));
        assert_eq!(parse_version("agy"), None);
        assert!((1, 1, 11) >= (1, 1, 11));
        assert!((1, 1, 10) < (1, 1, 11));
    }
}
