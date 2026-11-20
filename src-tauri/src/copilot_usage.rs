use github_copilot_sdk::{Client, ClientOptions};
use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct CopilotQuotaSnapshot {
    key: String,
    label: String,
    used_requests: i64,
    entitlement_requests: i64,
    remaining_percent: f64,
    resets_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CopilotUsage {
    status: String,
    snapshots: Vec<CopilotQuotaSnapshot>,
}

fn quota_label(key: &str) -> String {
    match key {
        "premium_interactions" => "Premium interactions".to_string(),
        "ai_credits" => "AI credits".to_string(),
        "chat" => "Chat".to_string(),
        "completions" => "Completions".to_string(),
        other => other
            .split(['_', '-', '.'])
            .filter(|part| !part.is_empty())
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn looks_like_auth_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    ["not logged in", "not authenticated", "unauthorized", "authentication required"]
        .iter()
        .any(|hint| message.contains(hint))
}

fn reset_date_is_plausible(reset_date: Option<String>) -> Option<String> {
    let reset_date = reset_date?;
    let parsed = chrono::DateTime::parse_from_rfc3339(&reset_date).ok()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    let seconds_until_reset = parsed.timestamp() - now;
    // Some CLI builds return the fetch time in resetDate. Do not present that as a real reset.
    (seconds_until_reset > 60 && seconds_until_reset < 45 * 24 * 60 * 60).then_some(reset_date)
}

fn empty_usage(status: &str) -> CopilotUsage {
    CopilotUsage {
        status: status.to_string(),
        snapshots: Vec::new(),
    }
}

async fn fetch_quota() -> Result<CopilotUsage, String> {
    let client = Client::start(ClientOptions::default())
        .await
        .map_err(|error| error.to_string())?;
    let response = client.rpc().account().get_quota().await;
    let shutdown = client.stop().await;
    let response = response.map_err(|error| error.to_string())?;
    let _ = shutdown;

    let mut snapshots = response
        .quota_snapshots
        .into_iter()
        .filter_map(|(key, snapshot)| {
            let remaining = snapshot.remaining_percentage;
            if !remaining.is_finite() || snapshot.entitlement_requests == 0 {
                return None;
            }
            Some(CopilotQuotaSnapshot {
                label: quota_label(&key),
                key,
                used_requests: snapshot.used_requests,
                entitlement_requests: snapshot.entitlement_requests,
                remaining_percent: remaining.clamp(0.0, 100.0),
                resets_at: reset_date_is_plausible(snapshot.reset_date),
            })
        })
        .collect::<Vec<_>>();
    snapshots.sort_by(|a, b| {
        (a.entitlement_requests == -1)
            .cmp(&(b.entitlement_requests == -1))
            .then(quota_sort_key(&a.key).cmp(&quota_sort_key(&b.key)))
            .then(a.key.cmp(&b.key))
    });

    if snapshots.is_empty() {
        return Err("quota data unavailable".to_string());
    }
    Ok(CopilotUsage {
        status: "ready".to_string(),
        snapshots,
    })
}

fn quota_sort_key(key: &str) -> u8 {
    match key {
        "premium_interactions" => 0,
        "ai_credits" => 1,
        "chat" => 2,
        "completions" => 3,
        _ => 4,
    }
}

#[tauri::command]
pub async fn get_copilot_usage() -> Result<CopilotUsage, String> {
    match tokio::time::timeout(Duration::from_secs(30), fetch_quota()).await {
        Ok(Ok(usage)) => Ok(usage),
        Ok(Err(error)) if looks_like_auth_error(&error) => Ok(empty_usage("no_auth")),
        Ok(Err(_)) => Ok(empty_usage("unavailable")),
        Err(_) => Ok(empty_usage("unavailable")),
    }
}

#[cfg(test)]
mod tests {
    use super::{looks_like_auth_error, quota_label, quota_sort_key, reset_date_is_plausible};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn labels_known_and_future_quota_types() {
        assert_eq!(quota_label("premium_interactions"), "Premium interactions");
        assert_eq!(quota_label("future_quota-type"), "Future Quota Type");
    }

    #[test]
    fn prioritizes_main_copilot_entitlement() {
        assert!(quota_sort_key("premium_interactions") < quota_sort_key("ai_credits"));
        assert!(quota_sort_key("chat") < quota_sort_key("completions"));
    }

    #[test]
    fn recognizes_auth_failures_without_exposing_error_details() {
        assert!(looks_like_auth_error("GitHub account is not authenticated"));
        assert!(!looks_like_auth_error("temporary network failure"));
    }

    #[test]
    fn ignores_fetch_timestamp_returned_as_quota_reset() {
        let now = chrono::DateTime::from_timestamp(
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64,
            0,
        )
        .unwrap()
        .to_rfc3339();
        assert_eq!(reset_date_is_plausible(Some(now)), None);
        assert_eq!(reset_date_is_plausible(Some("not a date".to_string())), None);
    }
}
