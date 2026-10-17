use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
    Disconnected,
    Ready,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Skin {
    pub id: i64,
    pub champion_id: i64,
    pub name: String,
    pub availability: String,
    pub available: bool,
    pub selected: bool,
    pub is_base: bool,
    pub is_chroma: bool,
    pub parent_skin_id: Option<i64>,
    pub tile_image_path: Option<String>,
    pub splash_image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub connection: ConnectionState,
    pub phase: String,
    pub active: bool,
    pub context_id: Option<String>,
    pub champion_id: Option<i64>,
    pub champion_name: Option<String>,
    pub selected_skin_id: Option<i64>,
    pub write_enabled: bool,
    pub write_block_reason: Option<String>,
    pub skins: Vec<Skin>,
    pub revision: u64,
    pub updated_at_ms: u64,
}

impl AppSnapshot {
    pub fn disconnected(message: Option<&str>) -> Self {
        Self {
            connection: ConnectionState::Disconnected,
            phase: "Disconnected".to_string(),
            active: false,
            context_id: None,
            champion_id: None,
            champion_name: None,
            selected_skin_id: None,
            write_enabled: false,
            write_block_reason: message.map(str::to_string),
            skins: Vec::new(),
            revision: 0,
            updated_at_ms: now_ms(),
        }
    }

    pub fn inactive(phase: impl Into<String>) -> Self {
        Self {
            connection: ConnectionState::Ready,
            phase: phase.into(),
            active: false,
            context_id: None,
            champion_id: None,
            champion_name: None,
            selected_skin_id: None,
            write_enabled: false,
            write_block_reason: Some("outside-champion-select".to_string()),
            skins: Vec::new(),
            revision: 0,
            updated_at_ms: now_ms(),
        }
    }

    pub fn same_content(&self, other: &Self) -> bool {
        self.connection == other.connection
            && self.phase == other.phase
            && self.active == other.active
            && self.context_id == other.context_id
            && self.champion_id == other.champion_id
            && self.champion_name == other.champion_name
            && self.selected_skin_id == other.selected_skin_id
            && self.write_enabled == other.write_enabled
            && self.write_block_reason == other.write_block_reason
            && self.skins == other.skins
    }

    pub fn mark_selected(&mut self, skin_id: i64) {
        self.selected_skin_id = Some(skin_id);
        for skin in &mut self.skins {
            skin.selected = skin.id == skin_id;
        }
        self.updated_at_ms = now_ms();
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub status: String,
    pub skin_id: i64,
    pub champion_id: Option<i64>,
    pub reason: Option<String>,
    pub dispatch_ms: u64,
    pub confirmation_ms: Option<u64>,
    pub total_ms: u64,
}

pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_connection_failures_do_not_change_visible_content() {
        let first = AppSnapshot::disconnected(Some("league-client-not-found"));
        let mut retry = first.clone();
        retry.updated_at_ms = first.updated_at_ms.saturating_add(2_000);
        retry.revision = first.revision.saturating_add(1);

        assert!(first.same_content(&retry));
    }

    #[test]
    fn successful_connection_changes_visible_content() {
        let failed = AppSnapshot::disconnected(Some("league-client-not-found"));
        let ready = AppSnapshot::inactive("Lobby");

        assert!(!failed.same_content(&ready));
        assert_eq!(ready.connection, ConnectionState::Ready);
    }
}
