use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const LIVE_CLIENT_DATA_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveRespawnInfo {
    pub is_dead: bool,
    pub respawn_timer: f64,
    pub champion_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSpellInfo {
    pub name: String,
    pub raw_key: String,
    pub base_cd: u32,
    pub effective_cd: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveEnemyPlayer {
    pub summoner_name: String,
    pub champion_name: String,
    pub is_dead: bool,
    pub respawn_timer: f64,
    pub has_ionian_boots: bool,
    pub has_cosmic_insight: bool,
    pub spell1: LiveSpellInfo,
    pub spell2: LiveSpellInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveGameTimerSnapshot {
    pub in_game: bool,
    pub game_time_seconds: f64,
    pub game_mode: String,
    pub self_respawn: Option<LiveRespawnInfo>,
    pub enemies: Vec<LiveEnemyPlayer>,
}

pub fn base_spell_cd(raw_name: &str, display_name: &str, game_mode: &str) -> (String, u32) {
    let key = raw_name.to_ascii_lowercase();
    let label = display_name.trim();
    if key.contains("flash") || label.contains("闪现") {
        ("闪现".into(), 300)
    } else if key.contains("teleport") || label.contains("传送") {
        ("传送".into(), 300)
    } else if key.contains("dot") || key.contains("ignite") || label.contains("引燃") || label.contains("点燃") {
        ("点燃".into(), 180)
    } else if key.contains("heal") || label.contains("治疗") {
        ("治疗".into(), 240)
    } else if key.contains("barrier") || label.contains("屏障") {
        ("屏障".into(), 180)
    } else if key.contains("exhaust") || label.contains("虚弱") {
        ("虚弱".into(), 240)
    } else if key.contains("haste") || key.contains("ghost") || label.contains("幽灵疾步") || label.contains("疾跑") {
        ("疾跑".into(), 240)
    } else if key.contains("boost") || key.contains("cleanse") || label.contains("净化") {
        ("净化".into(), 240)
    } else if key.contains("smite") || label.contains("惩戒") {
        ("惩戒".into(), 90)
    } else if key.contains("snowball") || key.contains("mark") || label.contains("标记") || label.contains("雪球") {
        ("雪球".into(), if game_mode == "ARAM" || game_mode == "KIWI" { 80 } else { 80 })
    } else if key.contains("mana") || label.contains("清晰") {
        ("清晰".into(), 240)
    } else {
        (
            if label.is_empty() {
                "技能".to_string()
            } else {
                label.to_string()
            },
            240,
        )
    }
}

pub fn compute_effective_cd(
    base_cd: u32,
    game_mode: &str,
    has_ionian_boots: bool,
    has_cosmic_insight: bool,
) -> u32 {
    let mut haste = 0.0_f64;
    if matches!(game_mode, "ARAM" | "KIWI") {
        haste += 70.0;
    }
    if has_ionian_boots {
        haste += 10.0;
    }
    if has_cosmic_insight {
        haste += 18.0;
    }
    ((base_cd as f64) * 100.0 / (100.0 + haste)).round().max(10.0) as u32
}

pub fn parse_live_game_data(data: &Value) -> LiveGameTimerSnapshot {
    let game_mode = data
        .pointer("/gameData/gameMode")
        .and_then(Value::as_str)
        .unwrap_or("CLASSIC")
        .to_string();
    let game_time_seconds = data
        .pointer("/gameData/gameTime")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let active_riot_id = data
        .pointer("/activePlayer/riotId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let active_summoner = data
        .pointer("/activePlayer/summonerName")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let all_players = data
        .get("allPlayers")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);

    let self_player = all_players.iter().find(|p| {
        let riot_id = p.get("riotId").and_then(Value::as_str).unwrap_or_default();
        let sname = p.get("summonerName").and_then(Value::as_str).unwrap_or_default();
        (!active_riot_id.is_empty() && riot_id == active_riot_id)
            || (!active_summoner.is_empty() && sname == active_summoner)
    });
    let self_team = self_player
        .and_then(|p| p.get("team").and_then(Value::as_str))
        .unwrap_or("ORDER");

    let self_respawn = self_player.map(|p| LiveRespawnInfo {
        is_dead: p.get("isDead").and_then(Value::as_bool).unwrap_or(false),
        respawn_timer: p.get("respawnTimer").and_then(Value::as_f64).unwrap_or(0.0),
        champion_name: p
            .get("championName")
            .and_then(Value::as_str)
            .unwrap_or("我方英雄")
            .to_string(),
    });

    let mut enemies = Vec::new();
    for p in all_players {
        let team = p.get("team").and_then(Value::as_str).unwrap_or_default();
        if team == self_team {
            continue;
        }
        let has_ionian_boots = p
            .get("items")
            .and_then(Value::as_array)
            .is_some_and(|items| {
                items
                    .iter()
                    .any(|it| it.get("itemID").and_then(Value::as_u64) == Some(3158))
            });
        // Inspiration secondary tree often carries Cosmic Insight; check if generalRunes or secondaryRuneTree exposes it
        let has_cosmic_insight = p
            .pointer("/runes/secondaryRuneTree/id")
            .and_then(Value::as_u64)
            == Some(8300)
            || p.pointer("/runes/primaryRuneTree/id")
                .and_then(Value::as_u64)
                == Some(8300);

        let parse_spell = |slot: &str| -> LiveSpellInfo {
            let raw = p
                .pointer(&format!("/summonerSpells/{slot}/rawDisplayName"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let display = p
                .pointer(&format!("/summonerSpells/{slot}/displayName"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let (name, base_cd) = base_spell_cd(raw, display, &game_mode);
            let effective_cd =
                compute_effective_cd(base_cd, &game_mode, has_ionian_boots, has_cosmic_insight);
            LiveSpellInfo {
                name,
                raw_key: raw.to_string(),
                base_cd,
                effective_cd,
            }
        };

        enemies.push(LiveEnemyPlayer {
            summoner_name: p
                .get("riotIdGameName")
                .or_else(|| p.get("summonerName"))
                .and_then(Value::as_str)
                .unwrap_or("敌方玩家")
                .to_string(),
            champion_name: p
                .get("championName")
                .and_then(Value::as_str)
                .unwrap_or("未知英雄")
                .to_string(),
            is_dead: p.get("isDead").and_then(Value::as_bool).unwrap_or(false),
            respawn_timer: p.get("respawnTimer").and_then(Value::as_f64).unwrap_or(0.0),
            has_ionian_boots,
            has_cosmic_insight,
            spell1: parse_spell("summonerSpellOne"),
            spell2: parse_spell("summonerSpellTwo"),
        });
    }

    LiveGameTimerSnapshot {
        in_game: true,
        game_time_seconds,
        game_mode,
        self_respawn,
        enemies,
    }
}

pub async fn fetch_live_game_timers() -> LiveGameTimerSnapshot {
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .connect_timeout(Duration::from_millis(350))
        .timeout(Duration::from_millis(700))
        .build()
    {
        Ok(c) => c,
        Err(_) => return offline_snapshot(),
    };
    let Ok(resp) = client.get(LIVE_CLIENT_DATA_URL).send().await else {
        return offline_snapshot();
    };
    if !resp.status().is_success() {
        return offline_snapshot();
    }
    let Ok(val) = resp.json::<Value>().await else {
        return offline_snapshot();
    };
    parse_live_game_data(&val)
}

fn offline_snapshot() -> LiveGameTimerSnapshot {
    LiveGameTimerSnapshot {
        in_game: false,
        game_time_seconds: 0.0,
        game_mode: String::new(),
        self_respawn: None,
        enemies: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn spell_cd_accounts_for_aram_ionian_and_cosmic_haste() {
        assert_eq!(compute_effective_cd(300, "CLASSIC", false, false), 300);
        assert_eq!(compute_effective_cd(300, "CLASSIC", true, true), 234);
        assert_eq!(compute_effective_cd(300, "ARAM", false, false), 176);
    }

    #[test]
    fn parse_live_game_data_extracts_self_respawn_and_enemies() {
        let payload = json!({
            "activePlayer": { "riotId": "我#1", "summonerName": "我" },
            "gameData": { "gameMode": "CLASSIC", "gameTime": 620.5 },
            "allPlayers": [
                { "riotId": "我#1", "championName": "薇恩", "team": "ORDER", "isDead": true, "respawnTimer": 24.5, "items": [], "summonerSpells": {} },
                {
                    "riotId": "敌#2", "riotIdGameName": "对手中单", "championName": "阿狸", "team": "CHAOS", "isDead": false, "respawnTimer": 0.0,
                    "items": [{ "itemID": 3158 }],
                    "runes": { "secondaryRuneTree": { "id": 8300 } },
                    "summonerSpells": {
                        "summonerSpellOne": { "displayName": "闪现", "rawDisplayName": "GeneratedTip_SummonerSpell_SummonerFlash_DisplayName" },
                        "summonerSpellTwo": { "displayName": "引燃", "rawDisplayName": "GeneratedTip_SummonerSpell_SummonerDot_DisplayName" }
                    }
                }
            ]
        });
        let snap = parse_live_game_data(&payload);
        assert!(snap.in_game);
        assert_eq!(snap.self_respawn.as_ref().unwrap().is_dead, true);
        assert_eq!(snap.enemies.len(), 1);
        assert_eq!(snap.enemies[0].spell1.name, "闪现");
        assert_eq!(snap.enemies[0].spell1.effective_cd, 234);
        assert_eq!(snap.enemies[0].spell2.name, "点燃");
    }
}
