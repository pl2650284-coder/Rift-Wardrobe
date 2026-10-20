use crate::{
    discovery::Credentials,
    models::{now_ms, AppSnapshot, ApplyResult, ConnectionState, Skin},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{Method, StatusCode};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, time::Duration};
use thiserror::Error;
use tokio::time::{sleep_until, Instant};

const GAMEFLOW_PHASE_ENDPOINT: &str = "/lol-gameflow/v1/gameflow-phase";
const CHAMP_SELECT_SESSION_ENDPOINT: &str = "/lol-champ-select/v1/session";
const SKIN_CAROUSEL_ENDPOINT: &str = "/lol-champ-select/v1/skin-carousel-skins";
const SKIN_SELECTOR_INFO_ENDPOINT: &str = "/lol-champ-select/v1/skin-selector-info";
const PICKABLE_SKIN_IDS_ENDPOINT: &str = "/lol-champ-select/v1/pickable-skin-ids";
const MY_SELECTION_ENDPOINT: &str = "/lol-champ-select/v1/session/my-selection";
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const IMAGE_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const APPLY_DEADLINE_MS: u64 = 950;

#[derive(Debug, Error)]
pub enum LcuError {
    #[error("LCU request failed with HTTP {status}: {endpoint}")]
    Http {
        endpoint: String,
        status: u16,
    },
    #[error("Could not communicate with the local League client")]
    Network,
    #[error("LCU returned an unsupported response: {0}")]
    Protocol(String),
}

impl LcuError {
    fn is_not_found(&self) -> bool {
        matches!(self, Self::Http { status: 404, .. })
    }

    fn is_definitive_rejection(&self) -> bool {
        matches!(self, Self::Http { status, .. }
            if (400..500).contains(status) && !matches!(status, 408 | 409 | 425 | 429))
    }

    fn status_code(&self) -> Option<u16> {
        match self {
            Self::Http { status, .. } => Some(*status),
            _ => None,
        }
    }
}

#[derive(Clone)]
pub struct LcuClient {
    credentials: Credentials,
    http: reqwest::Client,
}

impl LcuClient {
    pub fn new(credentials: Credentials) -> Result<Self, LcuError> {
        let http = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .connect_timeout(Duration::from_millis(500))
            .timeout(Duration::from_millis(900))
            .pool_idle_timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(8)
            .build()
            .map_err(|_| LcuError::Network)?;
        Ok(Self { credentials, http })
    }

    fn url(&self, endpoint: &str) -> Result<String, LcuError> {
        if !endpoint.starts_with('/') || endpoint.contains("://") {
            return Err(LcuError::Protocol("invalid endpoint".to_string()));
        }
        Ok(format!(
            "{}://127.0.0.1:{}{}",
            self.credentials.protocol, self.credentials.port, endpoint
        ))
    }

    async fn request_json(
        &self,
        method: Method,
        endpoint: &str,
        body: Option<&Value>,
    ) -> Result<Value, LcuError> {
        self.request_json_with_timeout(method, endpoint, body, Duration::from_millis(900))
            .await
    }

    async fn request_json_with_timeout(
        &self,
        method: Method,
        endpoint: &str,
        body: Option<&Value>,
        timeout: Duration,
    ) -> Result<Value, LcuError> {
        let mut request = self
            .http
            .request(method, self.url(endpoint)?)
            .basic_auth("riot", Some(&self.credentials.token))
            .header("Accept", "application/json")
            .header("User-Agent", "lol-skin-assistant-m1")
            .timeout(timeout);
        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await.map_err(|_| LcuError::Network)?;
        let status = response.status();
        if !status.is_success() {
            return Err(LcuError::Http {
                endpoint: endpoint.to_string(),
                status: status.as_u16(),
            });
        }
        let bytes = response.bytes().await.map_err(|_| LcuError::Network)?;
        if bytes.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| LcuError::Protocol(format!("malformed JSON from {endpoint}")))
    }

    pub(crate) async fn profile_json(&self, endpoint: &str) -> Result<Value, LcuError> {
        // History and inventory reads can take longer than a champion-select update.
        self.request_json_with_timeout(Method::GET, endpoint, None, Duration::from_secs(6))
            .await
    }

    async fn optional_json(&self, endpoint: &str) -> Result<Option<Value>, LcuError> {
        match self.request_json(Method::GET, endpoint, None).await {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.is_not_found() => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub async fn get_phase(&self) -> Result<String, LcuError> {
        let phase = self
            .request_json(Method::GET, GAMEFLOW_PHASE_ENDPOINT, None)
            .await?;
        phase
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| LcuError::Protocol("gameflow phase was not a string".to_string()))
    }

    pub async fn get_snapshot(&self) -> Result<AppSnapshot, LcuError> {
        let phase = self.get_phase().await?;
        if phase != "ChampSelect" {
            return Ok(AppSnapshot::inactive(phase));
        }

        let (session, carousel, selector, pickable, my_selection) = tokio::try_join!(
            self.optional_json(CHAMP_SELECT_SESSION_ENDPOINT),
            self.optional_json(SKIN_CAROUSEL_ENDPOINT),
            self.optional_json(SKIN_SELECTOR_INFO_ENDPOINT),
            self.optional_json(PICKABLE_SKIN_IDS_ENDPOINT),
            self.optional_json(MY_SELECTION_ENDPOINT),
        )?;
        let Some(session) = session else {
            return Ok(AppSnapshot::inactive(phase));
        };

        normalize_snapshot(
            phase,
            &session,
            carousel.as_ref(),
            selector.as_ref(),
            pickable.as_ref(),
            my_selection.as_ref(),
        )
    }

    pub async fn apply_skin(
        &self,
        skin_id: i64,
        expected_context_id: Option<&str>,
    ) -> Result<ApplyResult, String> {
        if skin_id < 0 {
            return Err("INVALID_SKIN_ID: 皮肤 ID 必须是非负整数".to_string());
        }

        let started = Instant::now();
        let deadline = started + Duration::from_millis(APPLY_DEADLINE_MS);
        let initial = self
            .get_snapshot();
        let initial = tokio::time::timeout_at(deadline, initial)
            .await
            .map_err(|_| "SNAPSHOT_UNAVAILABLE: LCU snapshot deadline exceeded".to_string())?
            .map_err(|error| format!("SNAPSHOT_UNAVAILABLE: {error}"))?;
        if !initial.active || initial.champion_id.is_none() {
            return Err("NOT_IN_CHAMP_SELECT: 当前不在可操作的英雄选择阶段".to_string());
        }
        if !initial.write_enabled {
            return Err(format!(
                "SKIN_SELECTION_DISABLED: {}",
                initial
                    .write_block_reason
                    .as_deref()
                    .unwrap_or("客户端暂不允许选择皮肤")
            ));
        }
        if let Some(expected) = expected_context_id {
            if initial.context_id.as_deref() != Some(expected) {
                return Err("SESSION_CHANGED: 英雄或选人会话已经变化".to_string());
            }
        }
        let target = initial.skins.iter().find(|skin| skin.id == skin_id);
        if !target.is_some_and(|skin| skin.available && !skin.is_chroma) {
            return Err("SKIN_NOT_AVAILABLE: 客户端未将这个普通皮肤标记为可用".to_string());
        }

        let send_result = tokio::time::timeout_at(
            deadline,
            self.request_json(
                Method::PATCH,
                MY_SELECTION_ENDPOINT,
                Some(&json!({ "selectedSkinId": skin_id })),
            ),
        )
        .await
        .unwrap_or(Err(LcuError::Network));
        let dispatch_ms = started.elapsed().as_millis() as u64;
        let definitive_rejection = send_result
            .as_ref()
            .err()
            .is_some_and(LcuError::is_definitive_rejection);
        let checkpoints: &[u64] = if definitive_rejection {
            &[0]
        } else {
            &[0, 35, 75, 125, 190, 280, 400, 550, 700, 850]
        };

        for checkpoint_ms in checkpoints {
            sleep_until(started + Duration::from_millis(*checkpoint_ms)).await;
            let confirmation = tokio::time::timeout_at(
                deadline,
                self.confirmation_context(),
            )
            .await;
            match confirmation {
                Err(_) => break,
                Ok(Err(_)) => {
                    // A read failure cannot justify sending the PATCH again.
                }
                Ok(Ok(confirmation)) => {
                    if confirmation.phase != "ChampSelect"
                        || confirmation.context_id != initial.context_id
                        || confirmation.champion_id != initial.champion_id
                    {
                        return Ok(ApplyResult {
                            status: "stale".to_string(),
                            skin_id,
                            champion_id: initial.champion_id,
                            reason: Some("selection-context-changed".to_string()),
                            dispatch_ms,
                            confirmation_ms: None,
                            total_ms: started.elapsed().as_millis() as u64,
                        });
                    }
                    if confirmation.selected_skin_id == Some(skin_id) {
                        let total_ms = started.elapsed().as_millis() as u64;
                        return Ok(ApplyResult {
                            status: "success".to_string(),
                            skin_id,
                            champion_id: initial.champion_id,
                            reason: None,
                            dispatch_ms,
                            confirmation_ms: Some(total_ms.saturating_sub(dispatch_ms)),
                            total_ms,
                        });
                    }
                }
            }
        }

        if let Err(error) = &send_result {
            if error.is_definitive_rejection() {
                return Ok(ApplyResult {
                    status: "failed".to_string(),
                    skin_id,
                    champion_id: initial.champion_id,
                    reason: Some(format!(
                        "http-{}",
                        error.status_code().unwrap_or_default()
                    )),
                    dispatch_ms,
                    confirmation_ms: None,
                    total_ms: started.elapsed().as_millis() as u64,
                });
            }
        }

        Ok(ApplyResult {
            status: "unknown".to_string(),
            skin_id,
            champion_id: initial.champion_id,
            reason: Some(if send_result.is_err() {
                "send-result-unknown".to_string()
            } else {
                "not-observed-within-deadline".to_string()
            }),
            dispatch_ms,
            confirmation_ms: None,
            total_ms: started.elapsed().as_millis() as u64,
        })
    }

    async fn confirmation_context(&self) -> Result<ConfirmationContext, LcuError> {
        let (phase, session, selector, my_selection) = tokio::try_join!(
            self.get_phase(),
            self.optional_json(CHAMP_SELECT_SESSION_ENDPOINT),
            self.optional_json(SKIN_SELECTOR_INFO_ENDPOINT),
            self.optional_json(MY_SELECTION_ENDPOINT),
        )?;
        if phase != "ChampSelect" {
            return Ok(ConfirmationContext {
                phase,
                context_id: None,
                champion_id: None,
                selected_skin_id: None,
            });
        }
        let Some(session) = session else {
            return Ok(ConfirmationContext {
                phase,
                context_id: None,
                champion_id: None,
                selected_skin_id: None,
            });
        };

        let local_player = local_player(&session);
        let champion_id = first_positive_id([
            selector.as_ref().and_then(|value| id_at(value, "championId")),
            selector
                .as_ref()
                .and_then(|value| id_at(value, "selectedChampionId")),
            local_player.and_then(|value| id_at(value, "championId")),
            local_player.and_then(|value| id_at(value, "championPickIntent")),
        ]);
        let selected_skin_id = first_non_negative_id([
            my_selection
                .as_ref()
                .and_then(|value| id_at(value, "selectedSkinId")),
            selector
                .as_ref()
                .and_then(|value| id_at(value, "selectedSkinId")),
            local_player.and_then(|value| id_at(value, "selectedSkinId")),
        ]);
        let fingerprint = session_fingerprint(&session);
        Ok(ConfirmationContext {
            phase,
            context_id: Some(format!(
                "{}:{}",
                fingerprint,
                champion_id
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            )),
            champion_id,
            selected_skin_id,
        })
    }

    pub async fn get_augment_catalog(&self) -> Result<Value, String> {
        self.request_json_with_timeout(
            Method::GET,
            "/lol-game-data/assets/v1/cherry-augments.json",
            None,
            Duration::from_secs(3),
        )
        .await
        .map_err(|error| error.to_string())
    }

    pub async fn get_image_data_url(&self, path: &str) -> Result<String, String> {
        if !path.starts_with("/lol-game-data/assets/")
            || path.contains("://")
            || path.contains("..")
        {
            return Err("不允许读取这个资源路径".to_string());
        }
        let response = self
            .http
            .get(self.url(path).map_err(|error| error.to_string())?)
            .basic_auth("riot", Some(&self.credentials.token))
            .header("Accept", "*/*")
            .timeout(IMAGE_REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|_| "无法从客户端读取皮肤图片".to_string())?;
        if response.status() != StatusCode::OK {
            return Err(format!("皮肤图片读取失败: HTTP {}", response.status()));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .filter(|value| value.starts_with("image/"))
            .map(str::to_string)
            .unwrap_or_else(|| {
                let extension = path
                    .rsplit_once('.')
                    .map(|(_, extension)| extension.to_ascii_lowercase());
                match extension.as_deref() {
                    Some("png") => "image/png",
                    Some("webp") => "image/webp",
                    Some("gif") => "image/gif",
                    Some("avif") => "image/avif",
                    _ => "image/jpeg",
                }
                .to_string()
            });
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "皮肤图片读取中断".to_string())?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err("皮肤图片超过大小限制".to_string());
        }
        Ok(format!("data:{content_type};base64,{}", STANDARD.encode(bytes)))
    }
}

struct ConfirmationContext {
    phase: String,
    context_id: Option<String>,
    champion_id: Option<i64>,
    selected_skin_id: Option<i64>,
}

fn normalize_snapshot(
    phase: String,
    session: &Value,
    carousel: Option<&Value>,
    selector: Option<&Value>,
    pickable: Option<&Value>,
    my_selection: Option<&Value>,
) -> Result<AppSnapshot, LcuError> {
    let local_player = local_player(session);
    let champion_id = first_positive_id([
        selector.and_then(|value| id_at(value, "championId")),
        selector.and_then(|value| id_at(value, "selectedChampionId")),
        local_player.and_then(|value| id_at(value, "championId")),
        local_player.and_then(|value| id_at(value, "championPickIntent")),
    ]);
    let selected_skin_id = first_non_negative_id([
        my_selection.and_then(|value| id_at(value, "selectedSkinId")),
        selector.and_then(|value| id_at(value, "selectedSkinId")),
        local_player.and_then(|value| id_at(value, "selectedSkinId")),
    ]);
    let champion_name = selector
        .and_then(|value| string_at(value, "championName"))
        .or_else(|| selector.and_then(|value| string_at(value, "selectedChampionName")))
        .or_else(|| local_player.and_then(|value| string_at(value, "championName")));
    let selector_disabled = selector.is_some_and(|value| bool_at(value, "skinSelectionDisabled"));
    let selector_hidden = selector
        .and_then(|value| value.get("showSkinSelector"))
        .and_then(Value::as_bool)
        == Some(false);
    let write_block_reason = if champion_id.is_none() {
        Some("champion-not-selected".to_string())
    } else if selector_disabled {
        Some("client-disabled-skin-selection".to_string())
    } else if selector_hidden {
        Some("skin-selector-hidden".to_string())
    } else {
        None
    };

    let pickable_ids = match pickable {
        Some(Value::Array(values)) => Some(
            values
                .iter()
                .filter_map(id_value)
                .collect::<std::collections::HashSet<_>>(),
        ),
        Some(_) => {
            return Err(LcuError::Protocol(
                "pickable skin IDs were not an array".to_string(),
            ))
        }
        None => None,
    };
    let mut skins = BTreeMap::new();
    if let Some(Value::Array(values)) = carousel {
        for raw in values {
            let Some(id) = first_non_negative_id([
                id_at(raw, "id"),
                id_at(raw, "skinId"),
                id_at(raw, "productId"),
            ]) else {
                continue;
            };
            let skin_champion_id = id_at(raw, "championId")
                .or_else(|| raw.get("champion").and_then(|value| id_at(value, "id")));
            if champion_id.is_some()
                && skin_champion_id.is_some()
                && skin_champion_id != champion_id
            {
                continue;
            }
            let resolved_champion_id = skin_champion_id.or(champion_id).unwrap_or_default();
            let is_base = bool_at(raw, "isBase") || id == resolved_champion_id * 1000;
            let locked = bool_at(raw, "disabled")
                || bool_at(raw, "isDisabled")
                || bool_at(raw, "isLocked");
            let explicitly_owned = bool_at(raw, "isOwned")
                || bool_at(raw, "owned")
                || nested_bool(raw, &["ownership", "owned"])
                || bool_at(raw, "isUnlocked")
                || bool_at(raw, "unlocked")
                || bool_at(raw, "isGrantedFromBoost")
                || bool_at(raw, "isRental")
                || nested_bool(raw, &["ownership", "rental", "rented"]);
            let availability = if locked {
                "locked"
            } else if is_base || selected_skin_id == Some(id) {
                "available"
            } else if pickable_ids.as_ref().is_some_and(|ids| !ids.is_empty()) {
                if pickable_ids.as_ref().is_some_and(|ids| ids.contains(&id)) {
                    "available"
                } else {
                    "locked"
                }
            } else if explicitly_owned {
                "available"
            } else {
                "unknown"
            };
            let tile_image_path = string_at(raw, "tilePath");
            let splash_image_path = string_at(raw, "uncenteredSplashPath")
                .or_else(|| string_at(raw, "splashPath"));
            skins.insert(
                id,
                Skin {
                    id,
                    champion_id: resolved_champion_id,
                    name: raw
                        .get("name")
                        .or_else(|| raw.get("displayName"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("皮肤 {id}")),
                    availability: availability.to_string(),
                    available: availability == "available",
                    selected: selected_skin_id == Some(id),
                    is_base,
                    is_chroma: bool_at(raw, "isChroma")
                        || raw.get("chromaPath").is_some_and(|value| !value.is_null()),
                    parent_skin_id: id_at(raw, "parentSkinId"),
                    tile_image_path,
                    splash_image_path,
                },
            );
        }
    }

    let fingerprint = session_fingerprint(session);
    Ok(AppSnapshot {
        connection: ConnectionState::Ready,
        phase,
        active: true,
        context_id: Some(format!(
            "{}:{}",
            fingerprint,
            champion_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        )),
        champion_id,
        champion_name,
        selected_skin_id,
        write_enabled: write_block_reason.is_none(),
        write_block_reason,
        skins: skins.into_values().collect(),
        revision: 0,
        updated_at_ms: now_ms(),
    })
}

fn local_player(session: &Value) -> Option<&Value> {
    let cell_id = id_at(session, "localPlayerCellId")?;
    session
        .get("myTeam")?
        .as_array()?
        .iter()
        .find(|member| id_at(member, "cellId") == Some(cell_id))
}

fn session_fingerprint(session: &Value) -> String {
    let local_cell = id_at(session, "localPlayerCellId").unwrap_or(-1);
    let stable = ["gameId", "gameSessionId", "id"]
        .into_iter()
        .find_map(|key| session.get(key).filter(|value| !value.is_null()))
        .map(Value::to_string)
        .or_else(|| {
            session
                .get("chatDetails")
                .and_then(|value| value.get("multiUserChatId"))
                .map(Value::to_string)
        })
        .unwrap_or_else(|| format!("cell:{local_cell}"));
    let digest = Sha256::digest(stable.as_bytes());
    let hex = format!("{:x}", digest);
    hex.chars().take(16).collect()
}

fn id_value(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
        .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
        .filter(|number| *number >= 0)
}

fn id_at(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(id_value)
}

fn string_at(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn first_positive_id<const N: usize>(values: [Option<i64>; N]) -> Option<i64> {
    values.into_iter().flatten().find(|value| *value > 0)
}

fn first_non_negative_id<const N: usize>(values: [Option<i64>; N]) -> Option<i64> {
    values.into_iter().flatten().find(|value| *value >= 0)
}

fn bool_at(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool) == Some(true)
}

fn nested_bool(value: &Value, path: &[&str]) -> bool {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(Value::as_bool)
        == Some(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skin_assets_keep_tile_and_prefer_uncentered_splash() {
        let snapshot = normalize_snapshot(
            "ChampSelect".to_string(),
            &json!({
                "gameId": "game-1",
                "localPlayerCellId": 1,
                "myTeam": [{ "cellId": 1, "championId": 67 }]
            }),
            Some(&json!([
                {
                    "id": 67064,
                    "championId": 67,
                    "tilePath": "/skins/vayne/tile.png",
                    "splashPath": "/skins/vayne/splash.jpg",
                    "uncenteredSplashPath": "/skins/vayne/uncentered.jpg"
                },
                {
                    "id": 67065,
                    "championId": 67,
                    "splashPath": "/skins/vayne/alternate.jpg"
                }
            ])),
            Some(&json!({ "championId": 67, "showSkinSelector": true })),
            Some(&json!([67064, 67065])),
            None,
        )
        .expect("snapshot");

        let skin = snapshot
            .skins
            .iter()
            .find(|skin| skin.id == 67064)
            .expect("skin with both asset types");
        assert_eq!(skin.tile_image_path.as_deref(), Some("/skins/vayne/tile.png"));
        assert_eq!(
            skin.splash_image_path.as_deref(),
            Some("/skins/vayne/uncentered.jpg")
        );

        let fallback_skin = snapshot
            .skins
            .iter()
            .find(|skin| skin.id == 67065)
            .expect("skin with splash fallback");
        assert_eq!(
            fallback_skin.splash_image_path.as_deref(),
            Some("/skins/vayne/alternate.jpg")
        );
    }

    #[test]
    fn base_skin_stays_available_when_pickable_ids_omit_it() {
        let snapshot = normalize_snapshot(
            "ChampSelect".to_string(),
            &json!({
                "gameId": "game-1",
                "localPlayerCellId": 3,
                "myTeam": [{ "cellId": 3, "championId": 67, "selectedSkinId": 67064 }]
            }),
            Some(&json!([
                { "id": 67000, "championId": 67, "name": "Vayne" },
                { "id": 67064, "championId": 67, "name": "Owned", "isOwned": true }
            ])),
            Some(&json!({
                "championId": 67,
                "selectedSkinId": 67064,
                "showSkinSelector": true,
                "skinSelectionDisabled": false
            })),
            Some(&json!([67064])),
            Some(&json!({ "selectedSkinId": 67064 })),
        )
        .expect("snapshot");

        let base = snapshot
            .skins
            .iter()
            .find(|skin| skin.id == 67000)
            .expect("base skin");
        assert!(base.is_base);
        assert!(base.available);
    }

    #[test]
    fn chromas_are_identified_for_m1_filtering() {
        let snapshot = normalize_snapshot(
            "ChampSelect".to_string(),
            &json!({
                "gameId": "game-1",
                "localPlayerCellId": 1,
                "myTeam": [{ "cellId": 1, "championId": 67 }]
            }),
            Some(&json!([{ "id": 67099, "championId": 67, "isChroma": true }])),
            Some(&json!({ "championId": 67, "showSkinSelector": true })),
            Some(&json!([67099])),
            None,
        )
        .expect("snapshot");
        assert!(snapshot.skins[0].is_chroma);
    }
}
