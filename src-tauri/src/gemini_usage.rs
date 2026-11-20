use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LOOKBACK_DAYS: u64 = 7;
const MAX_FILES: usize = 20_000;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize, Default, Clone)]
pub struct GeminiModelUsage {
    pub model: String,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub thought_tokens: u64,
    pub tool_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Serialize, Default)]
pub struct GeminiUsageSummary {
    pub status: String,
    pub period_days: u64,
    pub session_count: u64,
    pub requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub thought_tokens: u64,
    pub tool_tokens: u64,
    pub total_tokens: u64,
    pub last_updated_at_ms: u64,
    pub by_model: Vec<GeminiModelUsage>,
}

#[derive(Deserialize)]
struct SessionDocument {
    #[serde(default)]
    messages: Vec<SessionMessage>,
}

#[derive(Deserialize)]
struct SessionMessage {
    #[serde(rename = "type")]
    message_type: Option<String>,
    model: Option<String>,
    timestamp: Option<String>,
    tokens: Option<MessageTokens>,
}

#[derive(Deserialize, Default)]
struct MessageTokens {
    input: Option<u64>,
    output: Option<u64>,
    cached: Option<u64>,
    thoughts: Option<u64>,
    tool: Option<u64>,
    total: Option<u64>,
}

fn sessions_dir() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("GEMINI_CLI_HOME") {
        return Some(PathBuf::from(home).join("tmp"));
    }
    crate::provider_common::provider_home_dir(&[".gemini", "tmp"])
}

fn collect_session_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if out.len() >= MAX_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if out.len() >= MAX_FILES {
            break;
        }
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect_session_files(&path, out);
        } else if kind.is_file()
            && matches!(path.extension().and_then(|ext| ext.to_str()), Some("json" | "jsonl"))
        {
            out.push(path);
        }
    }
}

fn timestamp_ms(value: &str) -> Option<u64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .and_then(|time| u64::try_from(time.timestamp_millis()).ok())
}

fn add_message(
    message: SessionMessage,
    cutoff_ms: u64,
    session_usage: &mut HashMap<String, GeminiModelUsage>,
) -> bool {
    if message.message_type.as_deref() != Some("gemini") {
        return false;
    }
    let Some(time_ms) = message.timestamp.as_deref().and_then(timestamp_ms) else {
        return false;
    };
    if time_ms < cutoff_ms {
        return false;
    }
    let Some(tokens) = message.tokens else {
        return false;
    };

    let model = message
        .model
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "unknown".into());
    let entry = session_usage
        .entry(model.clone())
        .or_insert_with(|| GeminiModelUsage {
            model,
            ..Default::default()
        });
    let input = tokens.input.unwrap_or(0);
    let output = tokens.output.unwrap_or(0);
    let cached = tokens.cached.unwrap_or(0);
    let thoughts = tokens.thoughts.unwrap_or(0);
    let tool = tokens.tool.unwrap_or(0);
    entry.requests += 1;
    entry.input_tokens += input;
    entry.output_tokens += output;
    entry.cached_tokens += cached;
    entry.thought_tokens += thoughts;
    entry.tool_tokens += tool;
    entry.total_tokens += tokens.total.unwrap_or(input + output + cached + thoughts + tool);
    true
}

fn parse_session_file(path: &Path, cutoff_ms: u64) -> HashMap<String, GeminiModelUsage> {
    let mut usage = HashMap::new();
    let Ok(metadata) = fs::metadata(path) else {
        return usage;
    };
    if metadata.len() > MAX_FILE_BYTES {
        return usage;
    }

    let Ok(file) = fs::File::open(path) else {
        return usage;
    };
    if let Ok(document) = serde_json::from_reader::<_, SessionDocument>(BufReader::new(file)) {
        for message in document.messages {
            add_message(message, cutoff_ms, &mut usage);
        }
        return usage;
    }

    let Ok(file) = fs::File::open(path) else {
        return usage;
    };
    let mut reader = BufReader::new(file);
    let mut parse_line = |line: &[u8]| {
        if let Ok(message) = serde_json::from_slice::<SessionMessage>(line) {
            add_message(message, cutoff_ms, &mut usage);
        }
    };
    let mut line = Vec::new();
    loop {
        match crate::claude_sessions::read_capped_line(&mut reader, &mut line) {
            Ok(true) => parse_line(&line),
            Ok(false) | Err(_) => break,
        }
    }
    usage
}

fn get_gemini_usage_inner() -> GeminiUsageSummary {
    let Some(root) = sessions_dir() else {
        return GeminiUsageSummary {
            status: "unavailable".into(),
            period_days: LOOKBACK_DAYS,
            ..Default::default()
        };
    };
    if !root.is_dir() {
        return GeminiUsageSummary {
            status: "no_history".into(),
            period_days: LOOKBACK_DAYS,
            ..Default::default()
        };
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64;
    let cutoff_ms = now_ms.saturating_sub(LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    let mut files = Vec::new();
    collect_session_files(&root, &mut files);

    let mut all_models: HashMap<String, GeminiModelUsage> = HashMap::new();
    let mut session_count = 0;
    for path in files {
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if crate::provider_common::file_modified_ms(&metadata) < cutoff_ms as u128 {
            continue;
        }
        let session_models = parse_session_file(&path, cutoff_ms);
        if session_models.is_empty() {
            continue;
        }
        session_count += 1;
        for (model, session) in session_models {
            let total = all_models
                .entry(model.clone())
                .or_insert_with(|| GeminiModelUsage {
                    model,
                    ..Default::default()
                });
            total.requests += session.requests;
            total.input_tokens += session.input_tokens;
            total.output_tokens += session.output_tokens;
            total.cached_tokens += session.cached_tokens;
            total.thought_tokens += session.thought_tokens;
            total.tool_tokens += session.tool_tokens;
            total.total_tokens += session.total_tokens;
        }
    }

    let mut by_model: Vec<_> = all_models.into_values().collect();
    by_model.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));
    let summary = GeminiUsageSummary {
        status: if session_count > 0 { "ready" } else { "no_history" }.into(),
        period_days: LOOKBACK_DAYS,
        session_count,
        requests: by_model.iter().map(|model| model.requests).sum(),
        input_tokens: by_model.iter().map(|model| model.input_tokens).sum(),
        output_tokens: by_model.iter().map(|model| model.output_tokens).sum(),
        cached_tokens: by_model.iter().map(|model| model.cached_tokens).sum(),
        thought_tokens: by_model.iter().map(|model| model.thought_tokens).sum(),
        tool_tokens: by_model.iter().map(|model| model.tool_tokens).sum(),
        total_tokens: by_model.iter().map(|model| model.total_tokens).sum(),
        last_updated_at_ms: now_ms,
        by_model,
    };
    summary
}

#[tauri::command]
pub async fn get_gemini_usage_summary() -> Result<GeminiUsageSummary, String> {
    tokio::task::spawn_blocking(get_gemini_usage_inner)
        .await
        .map_err(|error| format!("get_gemini_usage_summary: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_token_metadata_without_requiring_transcript_content() {
        let now = chrono::DateTime::<chrono::Utc>::from(SystemTime::now()).to_rfc3339();
        let json = format!(
            r#"{{"sessionId":"s1","messages":[{{"type":"user","timestamp":"{now}","content":"private prompt"}},{{"type":"gemini","timestamp":"{now}","model":"gemini-3.8-flash","content":"private response","tokens":{{"input":20000,"output":8,"cached":0,"thoughts":183,"tool":0,"total":20191}}}}]}}"#
        );
        let directory = std::env::temp_dir()
            .join(format!("mosaico-gemini-{}", nanoid::nanoid!(8)));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("session.json");
        fs::write(&path, json).unwrap();

        let usage = parse_session_file(&path, 0);
        let _ = fs::remove_dir_all(&directory);

        let model = usage.get("gemini-3.8-flash").unwrap();
        assert_eq!(model.requests, 1);
        assert_eq!(model.input_tokens, 20_000);
        assert_eq!(model.output_tokens, 8);
        assert_eq!(model.total_tokens, 20_191);
    }

    #[test]
    fn ignores_messages_older_than_the_requested_window() {
        let old = "2020-01-01T00:00:00Z";
        let json = format!(
            r#"{{"messages":[{{"type":"gemini","timestamp":"{old}","model":"gemini-3.8-flash","tokens":{{"input":10,"output":2}}}}]}}"#
        );
        let directory = std::env::temp_dir()
            .join(format!("mosaico-gemini-{}", nanoid::nanoid!(8)));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("session.json");
        fs::write(&path, json).unwrap();

        let usage = parse_session_file(&path, u64::MAX);
        let _ = fs::remove_dir_all(&directory);

        assert!(usage.is_empty());
    }
}
