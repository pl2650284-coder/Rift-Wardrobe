use crate::{lcu::LcuClient, models::now_ms};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    time::{Duration, Instant},
};

const MAX_LOGS: usize = 50;

fn default_honor_strategy() -> String {
    "random-teammate".to_string()
}

fn default_matchmaking_delay() -> u8 {
    3
}

fn default_min_members() -> u8 {
    1
}

fn default_invitation_mode() -> String {
    "off".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoGameflowConfig {
    #[serde(default)]
    pub auto_honor_enabled: bool,
    #[serde(default = "default_honor_strategy")]
    pub auto_honor_strategy: String,
    #[serde(default)]
    pub auto_play_again_enabled: bool,
    #[serde(default)]
    pub auto_matchmaking_enabled: bool,
    #[serde(default = "default_matchmaking_delay")]
    pub auto_matchmaking_delay_seconds: u8,
    #[serde(default = "default_min_members")]
    pub auto_matchmaking_min_members: u8,
    #[serde(default)]
    pub auto_reconnect_enabled: bool,
    #[serde(default = "default_invitation_mode")]
    pub auto_invitation_mode: String,
}

impl Default for AutoGameflowConfig {
    fn default() -> Self {
        Self {
            auto_honor_enabled: false,
            auto_honor_strategy: default_honor_strategy(),
            auto_play_again_enabled: false,
            auto_matchmaking_enabled: false,
            auto_matchmaking_delay_seconds: default_matchmaking_delay(),
            auto_matchmaking_min_members: default_min_members(),
            auto_reconnect_enabled: false,
            auto_invitation_mode: default_invitation_mode(),
        }
    }
}

impl AutoGameflowConfig {
    pub fn sanitize(&mut self) {
        self.auto_matchmaking_delay_seconds = self.auto_matchmaking_delay_seconds.clamp(1, 15);
        self.auto_matchmaking_min_members = self.auto_matchmaking_min_members.clamp(1, 5);
        if !matches!(
            self.auto_honor_strategy.as_str(),
            "random-teammate" | "opt-out"
        ) {
            self.auto_honor_strategy = default_honor_strategy();
        }
        if !matches!(
            self.auto_invitation_mode.as_str(),
            "off" | "accept-all" | "decline-all"
        ) {
            self.auto_invitation_mode = default_invitation_mode();
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoGameflowLog {
    pub id: String,
    pub timestamp_ms: u64,
    pub action: String,
    pub detail: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoGameflowSnapshot {
    pub config: AutoGameflowConfig,
    pub revision: u64,
    pub logs: Vec<AutoGameflowLog>,
}

#[derive(Default)]
pub struct AutoGameflow {
    config: AutoGameflowConfig,
    path: Option<PathBuf>,
    revision: u64,
    logs: Vec<AutoGameflowLog>,

    honored_game_id: Option<u64>,
    play_again_triggered: bool,
    lobby_ready_since: Option<Instant>,
    matchmaking_triggered: bool,
    last_reconnect_at: Option<Instant>,
    handled_invitations: HashSet<String>,
}

impl AutoGameflow {
    pub fn load(path: PathBuf) -> Self {
        let mut engine = Self {
            path: Some(path.clone()),
            ..Self::default()
        };
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(mut cfg) = serde_json::from_slice::<AutoGameflowConfig>(&bytes) {
                cfg.sanitize();
                engine.config = cfg;
            }
        }
        engine
    }

    pub fn snapshot(&self) -> AutoGameflowSnapshot {
        AutoGameflowSnapshot {
            config: self.config.clone(),
            revision: self.revision,
            logs: self.logs.clone(),
        }
    }

    pub fn update_config(
        &mut self,
        mut next: AutoGameflowConfig,
    ) -> Result<AutoGameflowSnapshot, String> {
        next.sanitize();
        if let Some(path) = &self.path {
            let parent = path.parent().ok_or("流程自动化配置目录无效")?;
            fs::create_dir_all(parent).map_err(|_| "无法创建配置目录")?;
            let bytes =
                serde_json::to_vec_pretty(&next).map_err(|_| "无法序列化流程自动化配置")?;
            let tmp = path.with_extension("tmp");
            fs::write(&tmp, bytes).map_err(|_| "无法写入流程自动化配置")?;
            fs::rename(&tmp, path).map_err(|_| "无法保存流程自动化配置")?;
        }
        self.config = next;
        self.revision += 1;
        Ok(self.snapshot())
    }

    fn log(&mut self, action: &str, detail: &str, status: &str) {
        self.revision += 1;
        let ts = now_ms();
        self.logs.insert(
            0,
            AutoGameflowLog {
                id: format!("gameflow-{ts}-{}", self.revision),
                timestamp_ms: ts,
                action: action.to_string(),
                detail: detail.to_string(),
                status: status.to_string(),
            },
        );
        self.logs.truncate(MAX_LOGS);
    }

    pub async fn tick(&mut self, client: &LcuClient, phase: &str) -> bool {
        let prev_rev = self.revision;

        if phase != "EndOfGame" {
            self.play_again_triggered = false;
        }
        if phase != "Lobby" {
            self.lobby_ready_since = None;
            self.matchmaking_triggered = false;
        }

        match phase {
            "PreEndOfGame" if self.config.auto_honor_enabled => {
                self.tick_honor(client).await;
            }
            "EndOfGame" if self.config.auto_play_again_enabled && !self.play_again_triggered => {
                self.play_again_triggered = true;
                match client.play_again().await {
                    Ok(()) => self.log("自动再来一局", "已自动返回结算房间", "success"),
                    Err(e) => self.log("自动再来一局", &format!("返回房间失败：{e}"), "error"),
                }
            }
            "Lobby" if self.config.auto_matchmaking_enabled && !self.matchmaking_triggered => {
                self.tick_matchmaking(client).await;
            }
            "Reconnect" if self.config.auto_reconnect_enabled => {
                let can_retry = self
                    .last_reconnect_at
                    .is_none_or(|t| t.elapsed() >= Duration::from_secs(10));
                if can_retry {
                    self.last_reconnect_at = Some(Instant::now());
                    match client.reconnect_game().await {
                        Ok(()) => self.log("自动重连", "已触发客户端重新连接对局", "success"),
                        Err(e) => self.log("自动重连", &format!("重连失败：{e}"), "error"),
                    }
                }
            }
            _ => {}
        }

        if self.config.auto_invitation_mode != "off"
            && matches!(phase, "None" | "Lobby" | "EndOfGame")
        {
            self.tick_invitations(client).await;
        }

        self.revision != prev_rev
    }

    async fn tick_honor(&mut self, client: &LcuClient) {
        let Ok(Some(ballot)) = client.get_honor_ballot().await else {
            return;
        };
        let Some(game_id) = ballot.get("gameId").and_then(Value::as_u64).filter(|id| *id > 0) else {
            return;
        };
        if self.honored_game_id == Some(game_id) {
            return;
        }
        self.honored_game_id = Some(game_id);

        if self.config.auto_honor_strategy == "opt-out" {
            match client.honor_player(game_id, "OPT_OUT", 0, "").await {
                Ok(()) => self.log("自动点赞", "已跳过本局点赞", "success"),
                Err(e) => self.log("自动点赞", &format!("跳过点赞失败：{e}"), "error"),
            }
            return;
        }

        let eligible = extract_eligible_honor_targets(&ballot);
        let chosen = {
            let mut rng = rand::thread_rng();
            let categories = ["COOL", "SHOTCALLER", "HEART"];
            eligible.choose(&mut rng).cloned().map(|target| {
                let category = categories.choose(&mut rng).copied().unwrap_or("HEART");
                (target, category)
            })
        };
        if let Some(((summoner_id, puuid, name), category)) = chosen {
            match client
                .honor_player(game_id, category, summoner_id, &puuid)
                .await
            {
                Ok(()) => self.log("自动点赞", &format!("已为队友 {name} 点赞"), "success"),
                Err(e) => self.log("自动点赞", &format!("点赞失败：{e}"), "error"),
            }
        }
    }

    async fn tick_matchmaking(&mut self, client: &LcuClient) {
        let Ok(Some(lobby)) = client.get_lobby().await else {
            self.lobby_ready_since = None;
            return;
        };
        if !can_auto_start_matchmaking(&lobby, self.config.auto_matchmaking_min_members as usize) {
            self.lobby_ready_since = None;
            return;
        }
        let since = *self.lobby_ready_since.get_or_insert_with(Instant::now);
        if since.elapsed() < Duration::from_secs(self.config.auto_matchmaking_delay_seconds as u64)
        {
            return;
        }
        self.matchmaking_triggered = true;
        match client.start_matchmaking().await {
            Ok(()) => self.log("自动匹配", "房间已满足条件，已自动开始寻找对局", "success"),
            Err(e) => self.log("自动匹配", &format!("开始匹配失败：{e}"), "error"),
        }
    }

    async fn tick_invitations(&mut self, client: &LcuClient) {
        let Ok(invitations) = client.get_received_invitations().await else {
            return;
        };
        let accept = self.config.auto_invitation_mode == "accept-all";
        for inv in invitations {
            let Some(id) = inv
                .get("invitationId")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            let state = inv.get("state").and_then(Value::as_str).unwrap_or("");
            let can_accept = inv
                .get("canAcceptInvitation")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            if state != "Pending" || (accept && !can_accept) || self.handled_invitations.contains(id)
            {
                continue;
            }
            self.handled_invitations.insert(id.to_string());
            match client.respond_invitation(id, accept).await {
                Ok(()) => self.log(
                    "组队邀请",
                    if accept { "已自动接受组队邀请" } else { "已自动拒绝组队邀请" },
                    "success",
                ),
                Err(e) => self.log("组队邀请", &format!("处理邀请失败：{e}"), "error"),
            }
        }
    }
}

pub(crate) fn extract_eligible_honor_targets(ballot: &Value) -> Vec<(u64, String, String)> {
    ballot
        .get("eligibleAllies")
        .or_else(|| ballot.get("eligiblePlayers"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|p| {
            let summoner_id = p.get("summonerId").and_then(Value::as_u64).unwrap_or(0);
            let puuid = p
                .get("puuid")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if summoner_id == 0 && puuid.is_empty() {
                return None;
            }
            let name = p
                .get("summonerName")
                .or_else(|| p.get("gameName"))
                .and_then(Value::as_str)
                .unwrap_or("队友")
                .to_string();
            Some((summoner_id, puuid, name))
        })
        .collect()
}

pub(crate) fn can_auto_start_matchmaking(lobby: &Value, min_members: usize) -> bool {
    let is_custom = lobby
        .pointer("/gameConfig/isCustom")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if is_custom {
        return false;
    }
    let can_start = lobby
        .get("canStartActivity")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !can_start {
        return false;
    }
    let is_leader = lobby
        .pointer("/localMember/isLeader")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !is_leader {
        return false;
    }
    let members_count = lobby
        .get("members")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if members_count < min_members {
        return false;
    }
    let has_pending_invite = lobby
        .get("invitations")
        .and_then(Value::as_array)
        .is_some_and(|list| {
            list.iter()
                .any(|inv| inv.get("state").and_then(Value::as_str) == Some("Pending"))
        });
    !has_pending_invite
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matchmaking_requires_leader_non_custom_min_members_and_no_pending_invites() {
        let ready_lobby = json!({
            "canStartActivity": true,
            "localMember": { "isLeader": true },
            "gameConfig": { "isCustom": false },
            "members": [{ "puuid": "a" }, { "puuid": "b" }],
            "invitations": [{ "state": "Accepted" }]
        });
        assert!(can_auto_start_matchmaking(&ready_lobby, 2));
        assert!(!can_auto_start_matchmaking(&ready_lobby, 3));

        let with_pending = json!({
            "canStartActivity": true,
            "localMember": { "isLeader": true },
            "gameConfig": { "isCustom": false },
            "members": [{ "puuid": "a" }],
            "invitations": [{ "state": "Pending" }]
        });
        assert!(!can_auto_start_matchmaking(&with_pending, 1));
    }

    #[test]
    fn honor_targets_parse_eligible_allies() {
        let ballot = json!({
            "gameId": 123,
            "eligibleAllies": [
                { "summonerId": 11, "puuid": "p1", "summonerName": "队友甲" },
                { "summonerId": 22, "puuid": "p2", "summonerName": "队友乙" }
            ]
        });
        let targets = extract_eligible_honor_targets(&ballot);
        assert_eq!(targets.len(), 2);
        assert_eq!(targets[0].2, "队友甲");
    }
}
