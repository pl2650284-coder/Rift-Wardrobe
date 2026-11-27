use crate::lcu::LcuClient;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendItem {
    pub id: String,
    pub puuid: String,
    pub game_name: String,
    pub tag_line: String,
    pub availability: String,
    pub group_name: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimRewardsResult {
    pub claimed_grants: usize,
    pub viewed_missions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsFileStatus {
    pub found: bool,
    pub readonly: bool,
    pub path: Option<String>,
}

pub(crate) fn resolve_persisted_settings_path(install_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        install_dir.join("..").join("Game").join("Config").join("PersistedSettings.json"),
        install_dir.join("Game").join("Config").join("PersistedSettings.json"),
        install_dir.join("Config").join("PersistedSettings.json"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

pub(crate) fn parse_friends(value: &Value) -> Vec<FriendItem> {
    let mut list: Vec<FriendItem> = value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item
                .get("id")
                .or_else(|| item.get("pid"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())?
                .to_string();
            let puuid = item
                .get("puuid")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let game_name = item
                .get("gameName")
                .or_else(|| item.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("好友")
                .to_string();
            let tag_line = item
                .get("gameTag")
                .or_else(|| item.get("tagLine"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let availability = item
                .get("availability")
                .and_then(Value::as_str)
                .unwrap_or("offline")
                .to_string();
            let group_name = item
                .get("groupName")
                .and_then(Value::as_str)
                .unwrap_or("默认分组")
                .to_string();
            let note = item
                .get("note")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            Some(FriendItem {
                id,
                puuid,
                game_name,
                tag_line,
                availability,
                group_name,
                note,
            })
        })
        .collect();
    list.sort_by(|a, b| a.game_name.cmp(&b.game_name));
    list
}

impl LcuClient {
    pub async fn create_queue_lobby(&self, queue_id: u64) -> Result<(), String> {
        if queue_id == 0 {
            return Err("无效的队列 ID".to_string());
        }
        self.post_json_slow("/lol-lobby/v2/lobby", &json!({ "queueId": queue_id }))
            .await
            .map(|_| ())
            .map_err(|_| format!("创建队列 {queue_id} 房间失败，当前模式可能未开放"))
    }

    pub async fn create_practice_5v5(&self, lobby_name: &str) -> Result<(), String> {
        let name = if lobby_name.trim().is_empty() {
            "峡印 5v5 训练房间"
        } else {
            lobby_name.trim()
        };
        let body = json!({
            "customGameLobby": {
                "configuration": {
                    "gameMode": "PRACTICETOOL",
                    "gameMutator": "",
                    "gameServerRegion": "",
                    "mapId": 11,
                    "mutators": { "id": 1 },
                    "spectatorPolicy": "AllAllowed",
                    "teamSize": 5
                },
                "lobbyName": name,
                "lobbyPassword": null
            },
            "isCustom": true
        });
        self.post_json_slow("/lol-lobby/v2/lobby", &body)
            .await
            .map(|_| ())
            .map_err(|_| "创建 5v5 训练房间失败".to_string())
    }

    pub async fn add_custom_bot(
        &self,
        champion_id: i64,
        difficulty: &str,
        team_id: &str,
    ) -> Result<(), String> {
        let diff = match difficulty {
            "RSINTRO" | "RSBEGINNER" | "RSINTERMEDIATE" | "EASY" | "MEDIUM" => difficulty,
            _ => "MEDIUM",
        };
        let team = if team_id == "200" { "200" } else { "100" };
        self.post_json_slow(
            "/lol-lobby/v1/lobby/custom/bots",
            &json!({
                "botDifficulty": diff,
                "championId": champion_id.max(1),
                "teamId": team
            }),
        )
        .await
        .map(|_| ())
        .map_err(|_| "添加电脑失败，请确认当前位于自定义房间中".to_string())
    }

    pub async fn spectate_player_by_query(&self, query: &str) -> Result<String, String> {
        let target = self.search_player(query).await?;
        self.post_json_slow(
            "/lol-spectator/v1/spectate/launch",
            &json!({
                "puuid": target.puuid,
                "spectatorKey": ""
            }),
        )
        .await
        .map_err(|_| format!("无法观战 {}，对方可能未在对局中或不支持观战", target.game_name))?;
        Ok(target.game_name)
    }

    pub async fn set_profile_background_skin(&self, skin_id: i64) -> Result<(), String> {
        if skin_id < 1000 {
            return Err("请输入有效的皮肤 ID（例如 67014）".to_string());
        }
        self.post_json_slow(
            "/lol-summoner/v1/current-summoner/summoner-profile",
            &json!({
                "key": "backgroundSkinId",
                "value": skin_id
            }),
        )
        .await
        .map(|_| ())
        .map_err(|_| "设置主页背景皮肤失败".to_string())
    }

    pub async fn set_fake_rank(
        &self,
        queue: &str,
        tier: &str,
        division: &str,
    ) -> Result<(), String> {
        let valid_queue = match queue {
            "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | "RANKED_TFT" => queue,
            _ => "RANKED_SOLO_5x5",
        };
        let valid_tier = match tier {
            "CHALLENGER" | "GRANDMASTER" | "MASTER" | "DIAMOND" | "EMERALD" | "PLATINUM"
            | "GOLD" | "SILVER" | "BRONZE" | "IRON" | "UNRANKED" => tier,
            _ => "CHALLENGER",
        };
        let valid_div = if matches!(
            valid_tier,
            "CHALLENGER" | "GRANDMASTER" | "MASTER" | "UNRANKED"
        ) {
            ""
        } else {
            match division {
                "I" | "II" | "III" | "IV" => division,
                _ => "I",
            }
        };
        self.put_json_slow(
            "/lol-chat/v1/me",
            &json!({
                "lol": {
                    "rankedLeagueQueue": valid_queue,
                    "rankedLeagueTier": valid_tier,
                    "rankedLeagueDivision": valid_div
                }
            }),
        )
        .await
        .map(|_| ())
        .map_err(|_| "修改伪装段位失败".to_string())
    }

    pub async fn set_chat_availability(&self, availability: &str) -> Result<(), String> {
        let valid = match availability {
            "chat" | "away" | "dnd" | "offline" | "mobile" => availability,
            _ => return Err("不支持的在线状态".to_string()),
        };
        self.put_json_slow("/lol-chat/v1/me", &json!({ "availability": valid }))
            .await
            .map(|_| ())
            .map_err(|_| "切换在线状态失败".to_string())
    }

    pub async fn set_chat_status_message(&self, message: &str) -> Result<(), String> {
        self.put_json_slow("/lol-chat/v1/me", &json!({ "statusMessage": message.trim() }))
            .await
            .map(|_| ())
            .map_err(|_| "修改状态签名失败".to_string())
    }

    pub async fn claim_all_rewards(&self) -> Result<ClaimRewardsResult, String> {
        let mut claimed_grants = 0usize;
        if let Some(Value::Array(grants)) = self
            .optional_slow_json("/lol-rewards/v1/grants?status=PENDING_SELECTION")
            .await
            .ok()
            .flatten()
        {
            for grant in grants {
                let Some(grant_id) = grant
                    .get("info")
                    .and_then(|i| i.get("id"))
                    .or_else(|| grant.get("id"))
                    .and_then(Value::as_str)
                else {
                    continue;
                };
                let reward_group_id = grant
                    .get("info")
                    .and_then(|i| i.get("rewardGroupId"))
                    .or_else(|| grant.get("rewardGroupId"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let selections: Vec<String> = grant
                    .get("rewardGroup")
                    .and_then(|rg| rg.get("rewards"))
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|r| r.get("id").and_then(Value::as_str).map(str::to_string))
                    .collect();
                if selections.len() == 1 {
                    let ep = format!("/lol-rewards/v1/grants/{grant_id}/select");
                    if self
                        .post_json_slow(
                            &ep,
                            &json!({
                                "grantId": grant_id,
                                "rewardGroupId": reward_group_id,
                                "selections": selections
                            }),
                        )
                        .await
                        .is_ok()
                    {
                        claimed_grants += 1;
                    }
                }
            }
        }

        let mut viewed_missions = 0usize;
        if let Some(Value::Array(missions)) = self
            .optional_slow_json("/lol-missions/v1/missions")
            .await
            .ok()
            .flatten()
        {
            let mission_ids: Vec<String> = missions
                .iter()
                .filter(|m| {
                    m.get("status").and_then(Value::as_str) == Some("COMPLETED")
                        && m.get("viewed").and_then(Value::as_bool) == Some(false)
                })
                .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string))
                .collect();
            if !mission_ids.is_empty()
                && self
                    .put_json_slow("/lol-missions/v1/player", &json!({ "missionIds": mission_ids }))
                    .await
                    .is_ok()
            {
                viewed_missions = mission_ids.len();
            }
        }

        Ok(ClaimRewardsResult {
            claimed_grants,
            viewed_missions,
        })
    }

    pub async fn list_friends(&self) -> Result<Vec<FriendItem>, String> {
        let val = self
            .profile_json("/lol-chat/v1/friends")
            .await
            .map_err(|_| "无法读取好友列表".to_string())?;
        Ok(parse_friends(&val))
    }

    pub async fn delete_friends(&self, ids: &[String]) -> Result<usize, String> {
        let mut deleted = 0usize;
        for id in ids {
            let trimmed = id.trim();
            if trimmed.is_empty() || trimmed.contains('/') || trimmed.contains("..") {
                continue;
            }
            let ep = format!("/lol-chat/v1/friends/{trimmed}");
            if self.delete_slow(&ep).await.is_ok() {
                deleted += 1;
            }
            tokio::time::sleep(Duration::from_millis(120)).await;
        }
        Ok(deleted)
    }

    pub async fn get_persisted_settings_status(&self) -> Result<SettingsFileStatus, String> {
        let dir_val = self
            .profile_json("/data-store/v1/install-dir")
            .await
            .map_err(|_| "无法读取客户端安装目录".to_string())?;
        let Some(dir_str) = dir_val.as_str().filter(|s| !s.is_empty()) else {
            return Ok(SettingsFileStatus {
                found: false,
                readonly: false,
                path: None,
            });
        };
        let Some(path) = resolve_persisted_settings_path(Path::new(dir_str)) else {
            return Ok(SettingsFileStatus {
                found: false,
                readonly: false,
                path: None,
            });
        };
        let meta = fs::metadata(&path).map_err(|_| "无法读取 PersistedSettings.json 状态".to_string())?;
        Ok(SettingsFileStatus {
            found: true,
            readonly: meta.permissions().readonly(),
            path: Some(path.display().to_string()),
        })
    }

    pub async fn set_persisted_settings_readonly(
        &self,
        readonly: bool,
    ) -> Result<SettingsFileStatus, String> {
        let status = self.get_persisted_settings_status().await?;
        let Some(path_str) = status.path else {
            return Err("未找到 PersistedSettings.json 文件".to_string());
        };
        let path = PathBuf::from(&path_str);
        let mut perms = fs::metadata(&path)
            .map_err(|_| "无法读取配置文件权限".to_string())?
            .permissions();
        perms.set_readonly(readonly);
        fs::set_permissions(&path, perms).map_err(|_| "修改配置文件只读状态失败，请检查文件权限".to_string())?;
        Ok(SettingsFileStatus {
            found: true,
            readonly,
            path: Some(path_str),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_friends_sorts_and_normalizes_fields() {
        let val = json!([
            { "id": "f2", "puuid": "p2", "gameName": "Beta", "gameTag": "222", "availability": "offline", "groupName": "朋友" },
            { "id": "f1", "puuid": "p1", "gameName": "Alpha", "gameTag": "111", "availability": "chat", "note": "上分" }
        ]);
        let friends = parse_friends(&val);
        assert_eq!(friends.len(), 2);
        assert_eq!(friends[0].game_name, "Alpha");
        assert_eq!(friends[0].note, "上分");
        assert_eq!(friends[1].group_name, "朋友");
    }
}
