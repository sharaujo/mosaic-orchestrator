use std::sync::mpsc::{self, Sender};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::State;

const LARGE_IMAGE_ASSET: &str = "mosaico";

enum PresenceCommand {
    Set {
        details: String,
        state: String,
        started_at: i64,
        application_id: String,
    },
    Clear,
}

pub struct DiscordPresence {
    sender: Sender<PresenceCommand>,
}

impl DiscordPresence {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();

        std::thread::spawn(move || {
            let mut client: Option<DiscordIpcClient> = None;
            let mut active_application_id = String::new();

            while let Ok(command) = receiver.recv() {
                match command {
                    PresenceCommand::Set {
                        details,
                        state,
                        started_at,
                        application_id,
                    } => {
                        let application_id = if application_id.trim().is_empty() {
                            std::env::var("MOSAICO_DISCORD_APPLICATION_ID").unwrap_or_default()
                        } else {
                            application_id.trim().to_string()
                        };
                        if application_id != active_application_id {
                            if let Some(mut current) = client.take() {
                                let _ = current.clear_activity();
                                let _ = current.close();
                            }
                            active_application_id = application_id.clone();
                        }
                        if !application_id.is_empty() {
                            set_activity(&mut client, &application_id, &details, &state, started_at);
                        }
                    }
                    PresenceCommand::Clear => {
                        if let Some(mut current) = client.take() {
                            let _ = current.clear_activity();
                            let _ = current.close();
                        }
                    }
                }
            }
        });

        Self { sender }
    }
}

fn connect(application_id: &str) -> Option<DiscordIpcClient> {
    let mut client = DiscordIpcClient::new(application_id);
    client.connect().ok()?;
    Some(client)
}

fn set_activity(
    client: &mut Option<DiscordIpcClient>,
    application_id: &str,
    details: &str,
    state: &str,
    started_at: i64,
) {
    let activity = || {
        activity::Activity::new()
            .details(details)
            .state(state)
            .timestamps(activity::Timestamps::new().start(started_at))
            .assets(
                activity::Assets::new()
                    .large_image(LARGE_IMAGE_ASSET)
                    .large_text("mosAIco"),
            )
    };

    if client.is_none() {
        *client = connect(application_id);
    }

    let sent = client
        .as_mut()
        .is_some_and(|current| current.set_activity(activity()).is_ok());

    if !sent {
        *client = connect(application_id);
        if let Some(current) = client.as_mut() {
            if current.set_activity(activity()).is_err() {
                *client = None;
            }
        }
    }
}

#[tauri::command]
pub fn set_discord_presence(
    presence: State<'_, DiscordPresence>,
    details: String,
    state: String,
    started_at: i64,
    application_id: String,
) -> Result<(), String> {
    presence
        .sender
        .send(PresenceCommand::Set {
            details,
            state,
            started_at,
            application_id,
        })
        .map_err(|_| "Discord presence worker is unavailable".to_string())
}

#[tauri::command]
pub fn clear_discord_presence(presence: State<'_, DiscordPresence>) -> Result<(), String> {
    presence
        .sender
        .send(PresenceCommand::Clear)
        .map_err(|_| "Discord presence worker is unavailable".to_string())
}
