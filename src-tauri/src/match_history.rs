use crate::{
    db::{EncounteredGame, SavedPlayer},
    lcu::LcuClient,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummonerOverview {
    pub puuid: String,
    pub summoner_id: u64,
    pub game_name: String,
    pub tag_line: String,
    pub level: u64,
    pub icon_path: Option<String>,
    pub privacy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedEntry {
    pub queue_type: String,
    pub queue_label: String,
    pub tier: String,
    pub division: String,
    pub ranked: bool,
    pub points: u64,
    pub wins: u64,
    pub losses: u64,
    pub win_rate: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionMasteryItem {
    pub champion_id: u64,
    pub champion_name: String,
    pub level: u64,
    pub points: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMatchSummary {
    pub id: String,
    pub game_id: u64,
    pub champion_id: u64,
    pub champion: String,
    pub result: String,
    pub mode: String,
    pub queue_id: u64,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
    pub cs: u64,
    pub gold: u64,
    pub damage: u64,
    pub duration_seconds: u64,
    pub played_at_ms: u64,
    pub items: Vec<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerRecentStats {
    pub sample_size: usize,
    pub wins: usize,
    pub losses: usize,
    pub win_rate: Option<u64>,
    pub avg_kda: Option<f64>,
    pub avg_kills: f64,
    pub avg_deaths: f64,
    pub avg_assists: f64,
    pub streak: i32,
    pub score: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDetail {
    pub self_puuid: String,
    pub summoner: SummonerOverview,
    pub ranks: Vec<RankedEntry>,
    pub matches: Vec<PlayerMatchSummary>,
    pub mastery: Vec<ChampionMasteryItem>,
    pub stats: PlayerRecentStats,
    pub saved: Option<SavedPlayer>,
    pub encountered: Vec<EncounteredGame>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchParticipant {
    pub puuid: String,
    pub game_name: String,
    pub tag_line: String,
    pub team_id: u64,
    pub champion_id: u64,
    pub champion_name: String,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
    pub cs: u64,
    pub gold: u64,
    pub damage: u64,
    pub damage_taken: u64,
    pub vision_score: u64,
    pub win: bool,
    pub items: Vec<u64>,
    pub spell1_id: u64,
    pub spell2_id: u64,
    pub role: Option<String>,
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDetailTeam {
    pub team_id: u64,
    pub win: bool,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
    pub total_damage: u64,
    pub total_gold: u64,
    pub players: Vec<MatchParticipant>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchDetail {
    pub game_id: u64,
    pub mode: String,
    pub queue_id: u64,
    pub duration_seconds: u64,
    pub played_at_ms: u64,
    pub teams: Vec<MatchDetailTeam>,
}

pub(crate) fn is_valid_puuid(value: &str) -> bool {
    !value.is_empty()
        && value != "00000000-0000-0000-0000-000000000000"
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

pub(crate) fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

pub(crate) fn number(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|item| {
        item.as_u64()
            .or_else(|| item.as_i64().and_then(|n| u64::try_from(n).ok()))
            .or_else(|| item.as_str().and_then(|s| s.parse::<u64>().ok()))
    })
}

pub(crate) fn parse_summoner_overview(value: &Value) -> Option<SummonerOverview> {
    let puuid = text(value, "puuid").filter(|p| is_valid_puuid(p))?.to_string();
    let game_name = text(value, "gameName")
        .or_else(|| text(value, "displayName"))
        .or_else(|| text(value, "internalName"))
        .unwrap_or("未知召唤师")
        .to_string();
    let tag_line = text(value, "tagLine").unwrap_or_default().to_string();
    let icon_path = number(value, "profileIconId")
        .filter(|id| *id > 0)
        .map(|id| format!("/lol-game-data/assets/v1/profile-icons/{id}.jpg"));
    Some(SummonerOverview {
        puuid,
        summoner_id: number(value, "summonerId").unwrap_or_default(),
        game_name,
        tag_line,
        level: number(value, "summonerLevel").unwrap_or_default(),
        icon_path,
        privacy: text(value, "privacy").unwrap_or("PUBLIC").to_string(),
    })
}

pub(crate) fn tier_label(tier: &str) -> String {
    match tier {
        "IRON" => "黑铁",
        "BRONZE" => "青铜",
        "SILVER" => "白银",
        "GOLD" => "黄金",
        "PLATINUM" => "铂金",
        "EMERALD" => "翡翠",
        "DIAMOND" => "钻石",
        "MASTER" => "大师",
        "GRANDMASTER" => "宗师",
        "CHALLENGER" => "王者",
        "NONE" | "UNRANKED" | "" => "未定级",
        other => other,
    }
    .to_string()
}

pub(crate) fn parse_ranked_entries(ranked: &Value) -> Vec<RankedEntry> {
    let queue_specs = [
        ("RANKED_SOLO_5x5", "单双排"),
        ("RANKED_FLEX_SR", "灵活排位"),
        ("CHERRY", "斗魂竞技场"),
    ];
    let mut entries = Vec::new();
    for (queue_type, queue_label) in queue_specs {
        let queue = ranked
            .get("queueMap")
            .and_then(|map| map.get(queue_type))
            .filter(|q| q.is_object())
            .or_else(|| {
                ranked
                    .get("queues")
                    .and_then(Value::as_array)
                    .and_then(|list| {
                        list.iter()
                            .find(|q| text(q, "queueType") == Some(queue_type))
                    })
            });
        let Some(queue) = queue else {
            continue;
        };
        let tier_raw = text(queue, "tier").unwrap_or("NONE");
        let is_ranked = !matches!(tier_raw, "NONE" | "UNRANKED" | "");
        let division = if matches!(
            tier_raw,
            "MASTER" | "GRANDMASTER" | "CHALLENGER" | "NONE" | "UNRANKED" | ""
        ) {
            ""
        } else {
            text(queue, "division").unwrap_or_default()
        };
        let wins = number(queue, "wins").unwrap_or_default();
        let losses = number(queue, "losses").unwrap_or_default();
        let win_rate = (wins + losses > 0)
            .then(|| ((wins as f64 / (wins + losses) as f64) * 100.0).round() as u64);
        if queue_type == "CHERRY" && !is_ranked && wins + losses == 0 {
            continue;
        }
        entries.push(RankedEntry {
            queue_type: queue_type.to_string(),
            queue_label: queue_label.to_string(),
            tier: tier_label(tier_raw),
            division: division.to_string(),
            ranked: is_ranked,
            points: number(queue, "leaguePoints").unwrap_or_default(),
            wins,
            losses,
            win_rate,
        });
    }
    entries
}

pub(crate) fn champion_name_map(summary: Option<&Value>) -> HashMap<u64, String> {
    summary
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| Some((number(item, "id")?, text(item, "name")?.to_string())))
        .collect()
}

pub(crate) fn queue_name_map(queues: Option<&Value>) -> HashMap<u64, String> {
    queues
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| Some((number(item, "id")?, text(item, "name")?.to_string())))
        .collect()
}

pub(crate) fn mode_label(game: &Value, queues: &HashMap<u64, String>) -> String {
    if let Some(qid) = number(game, "queueId") {
        if let Some(name) = queues.get(&qid) {
            return name.clone();
        }
        match qid {
            420 => return "单双排位".to_string(),
            440 => return "灵活排位".to_string(),
            430 | 400 | 490 => return "匹配模式".to_string(),
            450 => return "极地大乱斗".to_string(),
            2400 => return "海克斯大乱斗".to_string(),
            1700 => return "斗魂竞技场".to_string(),
            _ => {}
        }
    }
    match text(game, "gameMode") {
        Some("CLASSIC") => "召唤师峡谷",
        Some("ARAM") => "极地大乱斗",
        Some("KIWI") => "海克斯大乱斗",
        Some("CHERRY") => "斗魂竞技场",
        Some(other) => other,
        None => "未知模式",
    }
    .to_string()
}

pub(crate) fn extract_history_games(history: &Value) -> &[Value] {
    history
        .pointer("/games/games")
        .and_then(Value::as_array)
        .or_else(|| history.get("games").and_then(Value::as_array))
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

pub(crate) fn parse_player_matches(
    games: &[Value],
    target_puuid: &str,
    champion_names: &HashMap<u64, String>,
    queues: &HashMap<u64, String>,
) -> Vec<PlayerMatchSummary> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for game in games {
        let Some(game_id) = number(game, "gameId") else {
            continue;
        };
        if !seen.insert(game_id) {
            continue;
        }
        let duration = number(game, "gameDuration").unwrap_or_default();
        if duration == 0 {
            continue;
        }
        let Some(identities) = game.get("participantIdentities").and_then(Value::as_array) else {
            continue;
        };
        let Some(participants) = game.get("participants").and_then(Value::as_array) else {
            continue;
        };
        let participant_id = identities
            .iter()
            .find(|ident| {
                ident
                    .get("player")
                    .and_then(|p| text(p, "puuid"))
                    .is_some_and(|p| p == target_puuid)
            })
            .and_then(|ident| number(ident, "participantId"));
        let participant = participant_id
            .and_then(|pid| {
                participants
                    .iter()
                    .find(|p| number(p, "participantId") == Some(pid))
            })
            .or_else(|| (participants.len() == 1).then(|| &participants[0]));
        let Some(participant) = participant else {
            continue;
        };
        let Some(stats) = participant.get("stats") else {
            continue;
        };
        let won = stats.get("win").and_then(Value::as_bool).unwrap_or(false);
        let early_surrender = stats
            .get("gameEndedInEarlySurrender")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let result = if duration < 300 && early_surrender {
            "remake"
        } else if won {
            "win"
        } else {
            "loss"
        };
        let champion_id = number(participant, "championId").unwrap_or_default();
        let champion = champion_names
            .get(&champion_id)
            .cloned()
            .unwrap_or_else(|| format!("英雄 {champion_id}"));
        let items = (0..=6)
            .map(|idx| number(stats, &format!("item{idx}")).unwrap_or_default())
            .filter(|id| *id > 0)
            .collect();
        let platform = text(game, "platformId").unwrap_or_default();
        out.push(PlayerMatchSummary {
            id: format!("{platform}:{game_id}"),
            game_id,
            champion_id,
            champion,
            result: result.to_string(),
            mode: mode_label(game, queues),
            queue_id: number(game, "queueId").unwrap_or_default(),
            kills: number(stats, "kills").unwrap_or_default(),
            deaths: number(stats, "deaths").unwrap_or_default(),
            assists: number(stats, "assists").unwrap_or_default(),
            cs: number(stats, "totalMinionsKilled").unwrap_or_default()
                + number(stats, "neutralMinionsKilled").unwrap_or_default(),
            gold: number(stats, "goldEarned").unwrap_or_default(),
            damage: number(stats, "totalDamageDealtToChampions").unwrap_or_default(),
            duration_seconds: duration,
            played_at_ms: number(game, "gameCreation").unwrap_or_default(),
            items,
        });
    }
    out.sort_by_key(|m| std::cmp::Reverse(m.played_at_ms));
    out
}

pub(crate) fn compute_recent_stats(matches: &[PlayerMatchSummary]) -> PlayerRecentStats {
    let valid: Vec<&PlayerMatchSummary> = matches
        .iter()
        .filter(|m| m.result != "remake")
        .collect();
    if valid.is_empty() {
        return PlayerRecentStats {
            sample_size: 0,
            wins: 0,
            losses: 0,
            win_rate: None,
            avg_kda: None,
            avg_kills: 0.0,
            avg_deaths: 0.0,
            avg_assists: 0.0,
            streak: 0,
            score: None,
        };
    }
    let sample_size = valid.len();
    let wins = valid.iter().filter(|m| m.result == "win").count();
    let losses = sample_size - wins;
    let win_rate = ((wins as f64 / sample_size as f64) * 100.0).round() as u64;

    let total_k: u64 = valid.iter().map(|m| m.kills).sum();
    let total_d: u64 = valid.iter().map(|m| m.deaths).sum();
    let total_a: u64 = valid.iter().map(|m| m.assists).sum();
    let avg_kills = (total_k as f64 / sample_size as f64 * 10.0).round() / 10.0;
    let avg_deaths = (total_d as f64 / sample_size as f64 * 10.0).round() / 10.0;
    let avg_assists = (total_a as f64 / sample_size as f64 * 10.0).round() / 10.0;

    let kda_raw = (total_k + total_a) as f64 / total_d.max(1) as f64;
    let avg_kda = (kda_raw * 10.0).round() / 10.0;

    // Streak from newest game
    let first_win = valid[0].result == "win";
    let mut streak_count = 0i32;
    for m in &valid {
        if (m.result == "win") == first_win {
            streak_count += 1;
        } else {
            break;
        }
    }
    let streak = if first_win { streak_count } else { -streak_count };

    // Composite 0..100 performance score (win rate + KDA + streak momentum)
    let wr_part = (wins as f64 / sample_size as f64) * 52.0;
    let kda_part = (kda_raw.min(6.0) / 6.0) * 42.0;
    let streak_part = (streak.clamp(-5, 5) as f64) * 1.2;
    let score = (wr_part + kda_part + streak_part).clamp(20.0, 99.0).round() as u64;

    PlayerRecentStats {
        sample_size,
        wins,
        losses,
        win_rate: Some(win_rate),
        avg_kda: Some(avg_kda),
        avg_kills,
        avg_deaths,
        avg_assists,
        streak,
        score: Some(score),
    }
}

pub(crate) fn parse_mastery(
    value: Option<&Value>,
    champion_names: &HashMap<u64, String>,
) -> Vec<ChampionMasteryItem> {
    let mut items: Vec<ChampionMasteryItem> = value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let champion_id = number(item, "championId").filter(|id| *id > 0)?;
            Some(ChampionMasteryItem {
                champion_id,
                champion_name: champion_names
                    .get(&champion_id)
                    .cloned()
                    .unwrap_or_else(|| format!("英雄 {champion_id}")),
                level: number(item, "championLevel").unwrap_or_default(),
                points: number(item, "championPoints").unwrap_or_default(),
            })
        })
        .collect();
    items.sort_by_key(|m| std::cmp::Reverse(m.points));
    items.truncate(8);
    items
}

pub(crate) fn parse_match_detail(
    game: &Value,
    self_puuid: &str,
    champion_names: &HashMap<u64, String>,
    queues: &HashMap<u64, String>,
) -> Result<MatchDetail, String> {
    let game_id = number(game, "gameId").ok_or_else(|| "对局数据缺少 gameId".to_string())?;
    let identities: HashMap<u64, &Value> = game
        .get("participantIdentities")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| Some((number(item, "participantId")?, item.get("player")?)))
        .collect();

    let mut team_players: HashMap<u64, Vec<MatchParticipant>> = HashMap::new();
    for p in game
        .get("participants")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let pid = number(p, "participantId").unwrap_or_default();
        let player = identities.get(&pid).copied();
        let puuid = player
            .and_then(|v| text(v, "puuid"))
            .unwrap_or_default()
            .to_string();
        let game_name = player
            .and_then(|v| text(v, "gameName").or_else(|| text(v, "summonerName")))
            .unwrap_or("未知玩家")
            .to_string();
        let tag_line = player
            .and_then(|v| text(v, "tagLine"))
            .unwrap_or_default()
            .to_string();
        let team_id = number(p, "teamId").unwrap_or(100);
        let champion_id = number(p, "championId").unwrap_or_default();
        let champion_name = champion_names
            .get(&champion_id)
            .cloned()
            .unwrap_or_else(|| format!("英雄 {champion_id}"));
        let stats = p.get("stats").unwrap_or(&Value::Null);
        let items = (0..=6)
            .map(|idx| number(stats, &format!("item{idx}")).unwrap_or_default())
            .filter(|id| *id > 0)
            .collect();
        let role = text(p, "teamPosition")
            .or_else(|| text(p, "individualPosition"))
            .and_then(|pos| match pos {
                "TOP" => Some("上路"),
                "JUNGLE" => Some("打野"),
                "MIDDLE" => Some("中路"),
                "BOTTOM" => Some("下路"),
                "UTILITY" => Some("辅助"),
                _ => None,
            })
            .map(str::to_string);
        let participant = MatchParticipant {
            is_self: !self_puuid.is_empty() && puuid == self_puuid,
            puuid,
            game_name,
            tag_line,
            team_id,
            champion_id,
            champion_name,
            kills: number(stats, "kills").unwrap_or_default(),
            deaths: number(stats, "deaths").unwrap_or_default(),
            assists: number(stats, "assists").unwrap_or_default(),
            cs: number(stats, "totalMinionsKilled").unwrap_or_default()
                + number(stats, "neutralMinionsKilled").unwrap_or_default(),
            gold: number(stats, "goldEarned").unwrap_or_default(),
            damage: number(stats, "totalDamageDealtToChampions").unwrap_or_default(),
            damage_taken: number(stats, "totalDamageTaken").unwrap_or_default(),
            vision_score: number(stats, "visionScore").unwrap_or_default(),
            win: stats.get("win").and_then(Value::as_bool).unwrap_or(false),
            items,
            spell1_id: number(p, "spell1Id").unwrap_or_default(),
            spell2_id: number(p, "spell2Id").unwrap_or_default(),
            role,
        };
        team_players.entry(team_id).or_default().push(participant);
    }

    let mut team_ids: Vec<u64> = team_players.keys().copied().collect();
    team_ids.sort_unstable();
    let teams = team_ids
        .into_iter()
        .map(|team_id| {
            let players = team_players.remove(&team_id).unwrap_or_default();
            let win = players.first().is_some_and(|p| p.win);
            let kills = players.iter().map(|p| p.kills).sum();
            let deaths = players.iter().map(|p| p.deaths).sum();
            let assists = players.iter().map(|p| p.assists).sum();
            let total_damage = players.iter().map(|p| p.damage).sum();
            let total_gold = players.iter().map(|p| p.gold).sum();
            MatchDetailTeam {
                team_id,
                win,
                kills,
                deaths,
                assists,
                total_damage,
                total_gold,
                players,
            }
        })
        .collect();

    Ok(MatchDetail {
        game_id,
        mode: mode_label(game, queues),
        queue_id: number(game, "queueId").unwrap_or_default(),
        duration_seconds: number(game, "gameDuration").unwrap_or_default(),
        played_at_ms: number(game, "gameCreation").unwrap_or_default(),
        teams,
    })
}

fn encode_query_component(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 3);
    for byte in input.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

impl LcuClient {
    pub async fn get_self_puuid(&self) -> Result<String, String> {
        let current = self
            .profile_json("/lol-summoner/v1/current-summoner")
            .await
            .map_err(|_| "无法读取当前登录召唤师".to_string())?;
        text(&current, "puuid")
            .filter(|p| is_valid_puuid(p))
            .map(str::to_string)
            .ok_or_else(|| "当前召唤师信息不完整".to_string())
    }

    pub async fn search_player(&self, raw_query: &str) -> Result<SummonerOverview, String> {
        let query = raw_query.trim().replace('＃', "#");
        if query.is_empty() {
            return Err("请输入玩家名（例如 玩家名#12345）".to_string());
        }
        if let Some((name, tag)) = query.split_once('#') {
            let game_name = name.trim();
            let tag_line = tag.trim();
            if game_name.is_empty() || tag_line.is_empty() {
                return Err("请填写完整的 名字#编号".to_string());
            }
            let body = json!([{ "gameName": game_name, "tagLine": tag_line }]);
            let response = self
                .post_json_slow("/lol-summoner/v1/summoners/aliases", &body)
                .await
                .map_err(|_| "未找到该召唤师，请检查名字与编号".to_string())?;
            let first = response
                .as_array()
                .and_then(|list| list.first())
                .ok_or_else(|| "未找到该召唤师（仅支持当前大区）".to_string())?;
            return parse_summoner_overview(first)
                .ok_or_else(|| "召唤师数据格式不受支持".to_string());
        }

        if query.len() >= 32 && query.contains('-') && is_valid_puuid(&query) {
            let endpoint = format!("/lol-summoner/v2/summoners/puuid/{query}");
            let response = self
                .profile_json(&endpoint)
                .await
                .map_err(|_| "未找到该 PUUID 对应的召唤师".to_string())?;
            return parse_summoner_overview(&response)
                .ok_or_else(|| "召唤师数据格式不受支持".to_string());
        }

        let endpoint = format!(
            "/lol-summoner/v1/summoners?name={}",
            encode_query_component(&query)
        );
        let response = self
            .profile_json(&endpoint)
            .await
            .map_err(|_| "未找到该召唤师，请尝试输入完整 名字#编号".to_string())?;
        parse_summoner_overview(&response).ok_or_else(|| "召唤师数据格式不受支持".to_string())
    }

    pub async fn get_player_detail_raw(
        &self,
        puuid: &str,
        beg_index: usize,
        end_index: usize,
    ) -> Result<PlayerDetail, String> {
        if !is_valid_puuid(puuid) {
            return Err("无效的玩家标识".to_string());
        }
        let end_index = end_index.min(beg_index + 39);
        let summoner_ep = format!("/lol-summoner/v2/summoners/puuid/{puuid}");
        let ranked_ep = format!("/lol-ranked/v1/ranked-stats/{puuid}");
        let history_ep = format!(
            "/lol-match-history/v1/products/lol/{puuid}/matches?begIndex={beg_index}&endIndex={end_index}"
        );
        let mastery_ep = format!("/lol-champion-mastery/v1/{puuid}/champion-mastery");

        let (self_puuid, summoner, ranked, history, mastery, champions, queues) = tokio::join!(
            self.get_self_puuid(),
            self.profile_json(&summoner_ep),
            self.profile_json(&ranked_ep),
            self.profile_json(&history_ep),
            self.profile_json(&mastery_ep),
            self.profile_json("/lol-game-data/assets/v1/champion-summary.json"),
            self.profile_json("/lol-game-queues/v1/queues"),
        );

        let summoner_val = summoner.map_err(|_| "无法读取该玩家信息".to_string())?;
        let summoner_overview =
            parse_summoner_overview(&summoner_val).ok_or_else(|| "玩家数据异常".to_string())?;
        let champion_names = champion_name_map(champions.ok().as_ref());
        let queue_names = queue_name_map(queues.ok().as_ref());

        let mut warnings = Vec::new();
        let ranks = match ranked {
            Ok(val) => parse_ranked_entries(&val),
            Err(_) => {
                warnings.push("排位信息暂不可用".to_string());
                Vec::new()
            }
        };
        let matches = match history {
            Ok(val) => parse_player_matches(
                extract_history_games(&val),
                &summoner_overview.puuid,
                &champion_names,
                &queue_names,
            ),
            Err(_) => {
                warnings.push("近期战绩暂不可用或对方已隐藏".to_string());
                Vec::new()
            }
        };
        let mastery_list = parse_mastery(mastery.ok().as_ref(), &champion_names);
        let stats = compute_recent_stats(&matches);

        Ok(PlayerDetail {
            self_puuid: self_puuid.unwrap_or_default(),
            summoner: summoner_overview,
            ranks,
            matches,
            mastery: mastery_list,
            stats,
            saved: None,
            encountered: Vec::new(),
            warnings,
        })
    }

    pub async fn get_match_detail(&self, game_id: u64) -> Result<MatchDetail, String> {
        if game_id == 0 {
            return Err("无效的对局 ID".to_string());
        }
        let game_ep = format!("/lol-match-history/v1/games/{game_id}");
        let (self_puuid, game, champions, queues) = tokio::join!(
            self.get_self_puuid(),
            self.profile_json(&game_ep),
            self.profile_json("/lol-game-data/assets/v1/champion-summary.json"),
            self.profile_json("/lol-game-queues/v1/queues"),
        );
        let game = game.map_err(|_| "无法读取该场对局的详细战绩".to_string())?;
        let champion_names = champion_name_map(champions.ok().as_ref());
        let queue_names = queue_name_map(queues.ok().as_ref());
        parse_match_detail(
            &game,
            self_puuid.as_deref().unwrap_or_default(),
            &champion_names,
            &queue_names,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_match(game_id: u64, result: &str, kills: u64, deaths: u64, assists: u64) -> PlayerMatchSummary {
        PlayerMatchSummary {
            id: format!("HN1:{game_id}"),
            game_id,
            champion_id: 67,
            champion: "薇恩".to_string(),
            result: result.to_string(),
            mode: "单双排位".to_string(),
            queue_id: 420,
            kills,
            deaths,
            assists,
            cs: 200,
            gold: 12000,
            damage: 25000,
            duration_seconds: 1800,
            played_at_ms: game_id * 1000,
            items: vec![3153, 3124],
        }
    }

    #[test]
    fn recent_stats_ignore_remakes_and_compute_streak_and_score() {
        let stats = compute_recent_stats(&[
            sample_match(4, "remake", 0, 0, 0),
            sample_match(3, "win", 10, 2, 6),
            sample_match(2, "win", 8, 2, 4),
            sample_match(1, "loss", 2, 6, 4),
        ]);
        assert_eq!(stats.sample_size, 3);
        assert_eq!(stats.wins, 2);
        assert_eq!(stats.losses, 1);
        assert_eq!(stats.win_rate, Some(67));
        assert_eq!(stats.streak, 2);
        assert!(stats.score.unwrap_or_default() >= 60);
    }

    #[test]
    fn match_detail_splits_two_teams_and_marks_self() {
        let game = json!({
            "gameId": 1001,
            "queueId": 420,
            "gameDuration": 1600,
            "gameCreation": 1700000000000u64,
            "participantIdentities": [
                { "participantId": 1, "player": { "puuid": "p-self", "gameName": "我方ADC", "tagLine": "111" } },
                { "participantId": 2, "player": { "puuid": "p-enemy", "gameName": "敌方中单", "tagLine": "222" } }
            ],
            "participants": [
                {
                    "participantId": 1, "teamId": 100, "championId": 67, "spell1Id": 4, "spell2Id": 7,
                    "teamPosition": "BOTTOM",
                    "stats": { "win": true, "kills": 9, "deaths": 1, "assists": 5, "totalMinionsKilled": 210, "neutralMinionsKilled": 10, "goldEarned": 14000, "totalDamageDealtToChampions": 32000, "totalDamageTaken": 11000, "visionScore": 22, "item0": 3153, "item1": 0 }
                },
                {
                    "participantId": 2, "teamId": 200, "championId": 103, "spell1Id": 4, "spell2Id": 14,
                    "teamPosition": "MIDDLE",
                    "stats": { "win": false, "kills": 3, "deaths": 6, "assists": 2, "totalMinionsKilled": 170, "neutralMinionsKilled": 0, "goldEarned": 9800, "totalDamageDealtToChampions": 18000, "totalDamageTaken": 16000, "visionScore": 14, "item0": 3089 }
                }
            ]
        });
        let champions = HashMap::from([(67, "薇恩".to_string()), (103, "阿狸".to_string())]);
        let detail = parse_match_detail(&game, "p-self", &champions, &HashMap::new()).expect("detail");
        assert_eq!(detail.teams.len(), 2);
        assert!(detail.teams[0].win);
        assert!(detail.teams[0].players[0].is_self);
        assert_eq!(detail.teams[0].players[0].cs, 220);
        assert_eq!(detail.teams[0].players[0].items, vec![3153]);
        assert!(!detail.teams[1].win);
        assert_eq!(detail.teams[1].players[0].champion_name, "阿狸");
    }
}
