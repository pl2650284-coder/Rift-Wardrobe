use crate::{lcu::LcuClient, models::now_ms};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

const CURRENT_SUMMONER: &str = "/lol-summoner/v1/current-summoner";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerProfile {
    pub summoner: ProfileSummoner,
    pub rank: Option<ProfileRank>,
    pub matches: Option<Vec<ProfileMatch>>,
    pub assets: ProfileAssets,
    pub warnings: Vec<String>,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummoner {
    pub name: String,
    pub tag: String,
    pub region: String,
    pub level: u64,
    pub icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRank {
    pub queue: String,
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
pub struct ProfileMatch {
    pub id: String,
    pub champion_id: u64,
    pub champion: String,
    pub result: String,
    pub mode: String,
    pub role: Option<String>,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
    pub cs: u64,
    pub duration_seconds: u64,
    pub played_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAssets {
    pub champions_owned: Option<usize>,
    pub champions_total: Option<usize>,
    pub skins_owned: Option<usize>,
    pub skins_total: Option<usize>,
}

#[derive(Default)]
struct ProfileResponses {
    ranked: Option<Value>,
    history: Option<Value>,
    champions: Option<Value>,
    owned_champions: Option<Value>,
    skins: Option<Value>,
    queues: Option<Value>,
    region: Option<Value>,
}

impl LcuClient {
    pub async fn get_profile(&self) -> Result<PlayerProfile, String> {
        let summoner = self.profile_json(CURRENT_SUMMONER).await.map_err(|_| {
            "SUMMONER_UNAVAILABLE: 无法读取召唤师信息，请确认客户端已登录".to_string()
        })?;
        let (puuid, summoner_id) = identity(&summoner)?;
        let history_endpoint =
            format!("/lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=19");
        let skins_endpoint = format!("/lol-champions/v1/inventories/{summoner_id}/skins-minimal");
        let (ranked, history, champions, owned_champions, skins, queues, region) = tokio::join!(
            self.profile_json("/lol-ranked/v1/current-ranked-stats"),
            self.profile_json(&history_endpoint),
            self.profile_json("/lol-game-data/assets/v1/champion-summary.json"),
            self.profile_json("/lol-champions/v1/owned-champions-minimal"),
            self.profile_json(&skins_endpoint),
            self.profile_json("/lol-game-queues/v1/queues"),
            self.profile_json("/riotclient/region-locale"),
        );

        // Current-account endpoints must still belong to the same login after all reads.
        let latest = self
            .profile_json(CURRENT_SUMMONER)
            .await
            .map_err(|_| "SUMMONER_UNAVAILABLE: 客户端登录状态已变化，请稍后刷新".to_string())?;
        if identity(&latest)? != (puuid, summoner_id) {
            return Err("ACCOUNT_CHANGED: 登录账号已切换，请重新读取个人信息".to_string());
        }

        normalize_profile(
            &latest,
            ProfileResponses {
                ranked: ranked.ok(),
                history: history.ok(),
                champions: champions.ok(),
                owned_champions: owned_champions.ok(),
                skins: skins.ok(),
                queues: queues.ok(),
                region: region.ok(),
            },
        )
    }
}

fn identity(summoner: &Value) -> Result<(String, u64), String> {
    let puuid = text(summoner, "puuid").filter(|value| {
        value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    });
    match (puuid, number(summoner, "summonerId").filter(|id| *id > 0)) {
        (Some(puuid), Some(id)) => Ok((puuid.to_string(), id)),
        _ => Err("SUMMONER_UNAVAILABLE: 请先在英雄联盟客户端登录并选择召唤师".to_string()),
    }
}

fn normalize_profile(
    summoner: &Value,
    responses: ProfileResponses,
) -> Result<PlayerProfile, String> {
    identity(summoner)?;
    let mut warnings = Vec::new();
    let rank = responses.ranked.as_ref().and_then(normalize_rank);
    if rank.is_none() {
        warnings.push("排位信息暂时无法读取".to_string());
    }
    let champions = responses.champions.as_ref().and_then(Value::as_array);
    let owned_champions = responses.owned_champions.as_ref().and_then(Value::as_array);
    let champion_names: HashMap<u64, &str> = owned_champions
        .into_iter()
        .flatten()
        .chain(champions.into_iter().flatten())
        .filter_map(|champion| Some((number(champion, "id")?, text(champion, "name")?)))
        .collect();
    let queues: HashMap<u64, &str> = responses
        .queues
        .as_ref()
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|queue| Some((number(queue, "id")?, text(queue, "name")?)))
        .collect();
    let matches = responses
        .history
        .as_ref()
        .and_then(history_games)
        .map(|games| normalize_matches(games, summoner, &champion_names, &queues));
    if matches.is_none() {
        warnings.push("对局记录暂时无法读取".to_string());
    }
    let champions_owned = owned_champions.map(|values| count_ids(values, permanently_owned));
    let champions_total = champions.map(|values| count_ids(values, |_| true));
    if champions_owned.is_none() || champions_total.is_none() {
        warnings.push("英雄资产暂时无法完整读取".to_string());
    }
    let skins = responses.skins.as_ref().and_then(Value::as_array);
    let skins_total = skins.map(|values| count_ids(values, normal_skin));
    let skins_owned =
        skins.map(|values| count_ids(values, |skin| normal_skin(skin) && permanently_owned(skin)));
    if skins.is_none() {
        warnings.push("皮肤资产暂时无法读取".to_string());
    }
    let platform = responses
        .history
        .as_ref()
        .and_then(|value| text(value, "platformId"))
        .or_else(|| {
            responses
                .region
                .as_ref()
                .and_then(|value| text(value, "region"))
        });

    Ok(PlayerProfile {
        summoner: ProfileSummoner {
            name: text(summoner, "gameName")
                .or_else(|| text(summoner, "displayName"))
                .unwrap_or("召唤师")
                .to_string(),
            tag: text(summoner, "tagLine").unwrap_or_default().to_string(),
            region: region_name(platform).to_string(),
            level: number(summoner, "summonerLevel").unwrap_or_default(),
            icon_path: number(summoner, "profileIconId")
                .map(|id| format!("/lol-game-data/assets/v1/profile-icons/{id}.jpg")),
        },
        rank,
        matches,
        assets: ProfileAssets {
            champions_owned,
            champions_total,
            skins_owned,
            skins_total,
        },
        warnings,
        updated_at_ms: now_ms(),
    })
}

fn normalize_rank(ranked: &Value) -> Option<ProfileRank> {
    let queue_types = ["RANKED_SOLO_5x5", "RANKED_FLEX_SR", "JADE_RANKED_SOLO_5x5"];
    let entries: Vec<(&str, &Value)> = queue_types
        .iter()
        .filter_map(|kind| {
            ranked
                .get("queueMap")
                .and_then(|queues| queues.get(*kind))
                .filter(|queue| queue.is_object())
                .or_else(|| {
                    ranked
                        .get("queues")?
                        .as_array()?
                        .iter()
                        .find(|queue| text(queue, "queueType") == Some(*kind))
                })
                .map(|queue| (*kind, queue))
        })
        .collect();
    let (kind, queue) = entries
        .iter()
        .find(|(_, queue)| is_ranked(queue))
        .or_else(|| entries.first())
        .copied()
        .or_else(|| {
            (ranked.get("queueMap").is_some_and(Value::is_object)
                || ranked.get("queues").is_some_and(Value::is_array))
            .then_some(("RANKED_SOLO_5x5", &Value::Null))
        })?;
    let wins = number(queue, "wins").unwrap_or_default();
    let losses = number(queue, "losses").unwrap_or_default();
    let tier = text(queue, "tier").unwrap_or("NONE");
    let division = if matches!(
        tier,
        "MASTER" | "GRANDMASTER" | "CHALLENGER" | "NONE" | "UNRANKED"
    ) {
        ""
    } else {
        text(queue, "division").unwrap_or_default()
    };
    Some(ProfileRank {
        queue: if kind == "RANKED_FLEX_SR" {
            "灵活排位"
        } else {
            "单双排"
        }
        .to_string(),
        tier: match tier {
            "IRON" => "黑铁",
            "BRONZE" => "青铜",
            "SILVER" => "白银",
            "GOLD" => "黄金",
            "PLATINUM" => "铂金",
            "EMERALD" => "翡翠",
            "DIAMOND" => "钻石",
            "MASTER" => "超凡大师",
            "GRANDMASTER" => "傲世宗师",
            "CHALLENGER" => "最强王者",
            "NONE" | "UNRANKED" => "未定级",
            _ => tier,
        }
        .to_string(),
        division: division.to_string(),
        ranked: is_ranked(queue),
        points: number(queue, "leaguePoints").unwrap_or_default(),
        wins,
        losses,
        win_rate: (wins + losses > 0)
            .then(|| ((wins as f64 / (wins + losses) as f64) * 100.0).round() as u64),
    })
}

fn is_ranked(queue: &Value) -> bool {
    text(queue, "tier").is_some_and(|tier| !matches!(tier, "NONE" | "UNRANKED"))
}

fn history_games(history: &Value) -> Option<&Vec<Value>> {
    history
        .pointer("/games/games")
        .and_then(Value::as_array)
        .or_else(|| history.get("games").and_then(Value::as_array))
}

fn normalize_matches(
    games: &[Value],
    summoner: &Value,
    champion_names: &HashMap<u64, &str>,
    queues: &HashMap<u64, &str>,
) -> Vec<ProfileMatch> {
    let mut seen = HashSet::new();
    let mut matches: Vec<ProfileMatch> = games
        .iter()
        .filter_map(|game| {
            let id = number(game, "gameId")?;
            let platform = text(game, "platformId").unwrap_or_default();
            let id = format!("{platform}:{id}");
            let duration = number(game, "gameDuration").filter(|seconds| *seconds > 0)?;
            let identity =
                game.get("participantIdentities")?
                    .as_array()?
                    .iter()
                    .find(|identity| {
                        identity
                            .get("player")
                            .is_some_and(|player| same_player(player, summoner))
                    })?;
            let participant_id = number(identity, "participantId")?;
            let participant = game
                .get("participants")?
                .as_array()?
                .iter()
                .find(|player| number(player, "participantId") == Some(participant_id))?;
            let stats = participant.get("stats")?;
            let won = stats.get("win")?.as_bool()?;
            let champion_id = number(participant, "championId").filter(|id| *id > 0)?;
            let played_at_ms = number(game, "gameCreation").filter(|time| *time > 0)?;
            if !seen.insert(id.clone()) {
                return None;
            }
            let result = if duration < 300 && flag(stats, "gameEndedInEarlySurrender") {
                "remake"
            } else if won {
                "win"
            } else {
                "loss"
            };
            let mode = number(game, "queueId")
                .and_then(|id| queues.get(&id).copied())
                .or_else(|| match text(game, "gameMode") {
                    Some("CLASSIC") => Some("召唤师峡谷"),
                    Some("ARAM") => Some("极地大乱斗"),
                    Some("KIWI") => Some("海克斯大乱斗"),
                    Some("CHERRY") => Some("斗魂竞技场"),
                    Some(other) => Some(other),
                    None => None,
                })
                .unwrap_or("未知模式");
            Some(ProfileMatch {
                id,
                champion_id,
                champion: champion_names
                    .get(&champion_id)
                    .map(|name| (*name).to_string())
                    .unwrap_or_else(|| format!("英雄 {champion_id}")),
                result: result.to_string(),
                mode: mode.to_string(),
                role: match_role(game, participant).map(str::to_string),
                kills: number(stats, "kills").unwrap_or_default(),
                deaths: number(stats, "deaths").unwrap_or_default(),
                assists: number(stats, "assists").unwrap_or_default(),
                cs: number(stats, "totalMinionsKilled").unwrap_or_default()
                    + number(stats, "neutralMinionsKilled").unwrap_or_default(),
                duration_seconds: duration,
                played_at_ms,
            })
        })
        .collect();
    matches.sort_by_key(|game| std::cmp::Reverse(game.played_at_ms));
    matches.truncate(20);
    matches
}

fn same_player(player: &Value, summoner: &Value) -> bool {
    if let Some(puuid) = text(player, "puuid") {
        return Some(puuid) == text(summoner, "puuid");
    }
    ["summonerId", "accountId"].iter().any(|key| {
        number(player, key).is_some_and(|id| id > 0 && Some(id) == number(summoner, key))
    })
}

fn match_role(game: &Value, participant: &Value) -> Option<&'static str> {
    if number(game, "mapId") != Some(11) || text(game, "gameMode") != Some("CLASSIC") {
        return None;
    }
    let position =
        text(participant, "teamPosition").or_else(|| text(participant, "individualPosition"));
    match position {
        Some("TOP") => return Some("上路"),
        Some("JUNGLE") => return Some("打野"),
        Some("MIDDLE") => return Some("中路"),
        Some("BOTTOM") => return Some("下路"),
        Some("UTILITY") => return Some("辅助"),
        _ => {}
    }
    let timeline = participant.get("timeline")?;
    match text(timeline, "lane")? {
        "TOP" => Some("上路"),
        "JUNGLE" => Some("打野"),
        "MID" | "MIDDLE" => Some("中路"),
        "BOT" | "BOTTOM" => match text(timeline, "role") {
            Some("DUO_SUPPORT" | "SUPPORT") => Some("辅助"),
            Some("DUO_CARRY" | "CARRY" | "SOLO") => Some("下路"),
            _ => None,
        },
        _ => None,
    }
}

fn normal_skin(skin: &Value) -> bool {
    let base_id = number(skin, "championId").and_then(|id| id.checked_mul(1000));
    !flag(skin, "isBase")
        && base_id != number(skin, "id")
        && !flag(skin, "isChroma")
        && text(skin, "chromaPath").is_none()
}

fn permanently_owned(value: &Value) -> bool {
    value.get("ownership").is_some_and(|ownership| {
        flag(ownership, "owned")
            && !flag(ownership, "loyaltyReward")
            && !flag(ownership, "xboxGPReward")
            && !ownership
                .get("rental")
                .is_some_and(|rental| flag(rental, "rented"))
    })
}

fn count_ids(values: &[Value], include: impl Fn(&Value) -> bool) -> usize {
    values
        .iter()
        .filter(|value| include(value))
        .filter_map(|value| number(value, "id").filter(|id| *id > 0))
        .collect::<HashSet<_>>()
        .len()
}

fn number(value: &Value, key: &str) -> Option<u64> {
    let value = value.get(key)?;
    value.as_u64().or_else(|| value.as_str()?.parse().ok())
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn flag(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool) == Some(true)
}

fn region_name(platform: Option<&str>) -> &str {
    match platform {
        Some("HN1") => "艾欧尼亚",
        Some("HN2") => "祖安",
        Some("HN3") => "诺克萨斯",
        Some("HN4") => "班德尔城",
        Some("HN5") => "皮尔特沃夫",
        Some("HN6") => "战争学院",
        Some("HN7") => "巨神峰",
        Some("HN8") => "雷瑟守备",
        Some("HN9") => "裁决之地",
        Some("HN10") => "黑色玫瑰",
        Some("HN11") => "暗影岛",
        Some("HN12") => "钢铁烈阳",
        Some("HN13") => "水晶之痕",
        Some("HN14") => "均衡教派",
        Some("HN15") => "影流",
        Some("HN16") => "守望之海",
        Some("HN17") => "征服之海",
        Some("HN18") => "卡拉曼达",
        Some("HN19") => "皮城警备",
        Some("WT1") => "比尔吉沃特",
        Some("WT2") => "德玛西亚",
        Some("WT3") => "弗雷尔卓德",
        Some("WT4") => "无畏先锋",
        Some("WT5") => "恕瑞玛",
        Some("WT6") => "扭曲丛林",
        Some("WT7") => "巨龙之巢",
        Some("EDU1") => "教育网专区",
        Some("BGP1") => "男爵领域",
        Some("BGP2") => "峡谷之巅",
        Some("TENCENT" | "CN") => "腾讯国服",
        Some(other) => other,
        None => "区服暂不可用",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::{self, Credentials};
    use serde_json::json;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn summoner() -> Value {
        json!({
            "puuid": "account-a", "summonerId": "42", "accountId": 24,
            "gameName": "当前召唤师", "displayName": "旧名字", "tagLine": "CN1",
            "summonerLevel": 186, "profileIconId": 123
        })
    }

    fn ranked() -> Value {
        json!({ "queueMap": {
            "RANKED_TFT": { "tier": "CHALLENGER", "wins": 90, "losses": 10 },
            "RANKED_SOLO_5x5": { "tier": "BRONZE", "division": "II", "leaguePoints": 74, "wins": 3, "losses": 2 }
        } })
    }

    fn game(id: u64, created: u64) -> Value {
        json!({
            "gameId": id, "gameCreation": created, "gameDuration": 1259,
            "platformId": "HN1", "gameMode": "CLASSIC", "mapId": 11, "queueId": 420,
            "participantIdentities": [
                { "participantId": 1, "player": { "puuid": "someone-else" } },
                { "participantId": 5, "player": { "puuid": "account-a", "summonerId": 42 } }
            ],
            "participants": [
                { "participantId": 1, "championId": 22, "stats": { "win": false, "kills": 99 } },
                { "participantId": 5, "championId": 67,
                  "timeline": { "lane": "BOTTOM", "role": "DUO_CARRY" },
                  "stats": { "win": true, "kills": 7, "deaths": 2, "assists": 4,
                    "totalMinionsKilled": 120, "neutralMinionsKilled": 24 } }
            ]
        })
    }

    #[test]
    fn riot_id_and_solo_rank_are_read_without_using_tft_stats() {
        let profile = normalize_profile(
            &summoner(),
            ProfileResponses {
                ranked: Some(ranked()),
                history: Some(json!({ "platformId": "HN1", "games": { "games": [] } })),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(profile.summoner.name, "当前召唤师");
        assert_eq!(profile.summoner.tag, "CN1");
        assert_eq!(profile.summoner.region, "艾欧尼亚");
        assert_eq!(
            profile.summoner.icon_path.as_deref(),
            Some("/lol-game-data/assets/v1/profile-icons/123.jpg")
        );
        let rank = profile.rank.unwrap();
        assert_eq!(rank.tier, "青铜");
        assert_eq!(rank.division, "II");
        assert_eq!(rank.points, 74);
        assert_eq!(rank.win_rate, Some(60));
        assert_eq!(rank.queue, "单双排");
    }

    #[test]
    fn queues_array_supports_flex_and_empty_queues_mean_unranked() {
        let rank = normalize_rank(&json!({ "queues": [
            { "queueType": "RANKED_SOLO_5x5", "tier": "NONE" },
            { "queueType": "RANKED_FLEX_SR", "tier": "MASTER", "division": "I", "wins": 2, "losses": 1 }
        ] })).unwrap();
        assert_eq!(rank.queue, "灵活排位");
        assert_eq!(rank.tier, "超凡大师");
        assert_eq!(rank.division, "");
        assert_eq!(rank.win_rate, Some(67));
        let unranked = normalize_rank(&json!({ "queues": [] })).unwrap();
        assert!(!unranked.ranked);
        assert_eq!(unranked.tier, "未定级");
        assert_eq!(unranked.win_rate, None);
        assert!(normalize_rank(&json!({ "unexpected": true })).is_none());
    }

    #[test]
    fn inventory_counts_exclude_defaults_chromas_temporary_access_and_duplicates() {
        let profile = normalize_profile(&summoner(), ProfileResponses {
            champions: Some(json!([{ "id": -1 }, { "id": 67 }, { "id": 22 }, { "id": 67 }])),
            owned_champions: Some(json!([
                { "id": 67, "ownership": { "owned": true } },
                { "id": 67, "ownership": { "owned": true } },
                { "id": 22, "freeToPlay": true, "ownership": { "owned": false } },
                { "id": 23, "ownership": { "owned": true, "xboxGPReward": true } }
            ])),
            skins: Some(json!([
                { "id": 67000, "championId": 67, "ownership": { "owned": true } },
                { "id": 67001, "championId": 67, "ownership": { "owned": true } },
                { "id": 67001, "championId": 67, "ownership": { "owned": true } },
                { "id": 67002, "championId": 67, "chromaPath": "/chroma.png", "ownership": { "owned": true } },
                { "id": 67003, "championId": 67, "ownership": { "owned": false } },
                { "id": 67004, "championId": 67, "ownership": { "owned": true, "rental": { "rented": true } } },
                { "id": 67005, "championId": 67, "isBase": true, "ownership": { "owned": true } }
            ])),
            ..Default::default()
        }).unwrap();
        assert_eq!(profile.assets.champions_owned, Some(1));
        assert_eq!(profile.assets.champions_total, Some(2));
        assert_eq!(profile.assets.skins_owned, Some(1));
        assert_eq!(profile.assets.skins_total, Some(3));
    }

    #[test]
    fn match_history_selects_the_current_player_sorts_and_deduplicates() {
        let games = vec![game(1, 1000), game(2, 2000), game(2, 2000)];
        let names = HashMap::from([(67, "薇恩")]);
        let queues = HashMap::from([(420, "排位赛 单排/双排")]);
        let matches = normalize_matches(&games, &summoner(), &names, &queues);
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].id, "HN1:2");
        assert_eq!(matches[0].champion, "薇恩");
        assert_eq!(matches[0].kills, 7);
        assert_eq!(matches[0].cs, 144);
        assert_eq!(matches[0].role.as_deref(), Some("下路"));
        assert_eq!(matches[0].mode, "排位赛 单排/双排");
        let mut other_account = summoner();
        other_account["puuid"] = json!("other-account");
        assert!(normalize_matches(&games, &other_account, &names, &queues).is_empty());
    }

    #[test]
    fn aram_has_no_lane_and_remakes_are_marked_separately() {
        let mut aram = game(1, 1000);
        aram["gameMode"] = json!("KIWI");
        aram["mapId"] = json!(12);
        aram["queueId"] = json!(2400);
        let mut remake = game(2, 2000);
        remake["gameDuration"] = json!(180);
        remake["participants"][1]["stats"]["gameEndedInEarlySurrender"] = json!(true);
        let matches = normalize_matches(
            &[aram, remake],
            &summoner(),
            &HashMap::new(),
            &HashMap::new(),
        );
        assert_eq!(matches[0].result, "remake");
        assert_eq!(matches[1].role, None);
        assert_eq!(matches[1].mode, "海克斯大乱斗");
    }

    #[test]
    fn missing_sections_are_unavailable_instead_of_empty_or_zero() {
        let profile = normalize_profile(&summoner(), ProfileResponses::default()).unwrap();
        assert!(profile.rank.is_none());
        assert!(profile.matches.is_none());
        assert_eq!(profile.assets.skins_owned, None);
        assert_eq!(profile.warnings.len(), 4);
        assert!(history_games(&json!({ "games": { "games": [] } }))
            .unwrap()
            .is_empty());
        assert!(history_games(&json!({ "games": null })).is_none());
        assert!(identity(&json!({ "puuid": "account-a", "summonerId": 0 })).is_err());
        assert!(identity(&json!({ "puuid": "../other", "summonerId": 42 })).is_err());
    }

    fn mock_client(
        account_changes: bool,
        rank_unavailable: bool,
    ) -> (LcuClient, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            let mut account_reads = 0;
            for _ in 0..9 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0u8; 2048];
                while !bytes.windows(4).any(|part| part == b"\r\n\r\n") {
                    let length = stream.read(&mut buffer).unwrap();
                    assert!(length > 0 && bytes.len() < 8192);
                    bytes.extend_from_slice(&buffer[..length]);
                }
                let request = String::from_utf8(bytes).unwrap();
                let request = request.lines().next().unwrap();
                let endpoint = request.split_whitespace().nth(1).unwrap();
                requests.push(request.to_string());
                let mut status = 200;
                let value = match endpoint {
                    CURRENT_SUMMONER => {
                        account_reads += 1;
                        let mut value = summoner();
                        if account_changes && account_reads == 2 {
                            value["puuid"] = json!("account-b");
                        }
                        value
                    }
                    "/lol-ranked/v1/current-ranked-stats" => {
                        if rank_unavailable {
                            status = 503;
                        }
                        ranked()
                    }
                    "/lol-game-data/assets/v1/champion-summary.json" => {
                        json!([{ "id": 67, "name": "薇恩" }])
                    }
                    "/lol-champions/v1/owned-champions-minimal" => {
                        json!([{ "id": 67, "ownership": { "owned": true } }])
                    }
                    "/lol-champions/v1/inventories/42/skins-minimal" => json!([]),
                    "/lol-game-queues/v1/queues" => json!([]),
                    "/riotclient/region-locale" => json!({ "region": "TENCENT" }),
                    path if path
                        .starts_with("/lol-match-history/v1/products/lol/account-a/matches?") =>
                    {
                        json!({ "platformId": "HN1", "games": { "games": [game(1, 1000)] } })
                    }
                    _ => panic!("unexpected profile endpoint: {endpoint}"),
                };
                let body = value.to_string();
                let response = format!("HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                stream.write_all(response.as_bytes()).unwrap();
            }
            requests
        });
        let client = LcuClient::new(Credentials {
            port,
            token: "test-token".to_string(),
            protocol: "http".to_string(),
            process_id: None,
            source_kind: "test".to_string(),
            install_dir: None,
        })
        .unwrap();
        (client, server)
    }

    #[tokio::test]
    async fn profile_read_keeps_other_sections_when_rank_is_unavailable() {
        let (client, server) = mock_client(false, true);
        let profile = client.get_profile().await.unwrap();
        assert!(profile.rank.is_none());
        assert_eq!(profile.matches.unwrap().len(), 1);
        assert_eq!(profile.assets.skins_owned, Some(0));
        assert_eq!(profile.warnings, vec!["排位信息暂时无法读取"]);
        let requests = server.join().unwrap();
        assert!(requests.iter().all(|request| request.starts_with("GET ")));
        assert_eq!(
            requests
                .iter()
                .filter(|request| request.contains(CURRENT_SUMMONER))
                .count(),
            2
        );
    }

    #[tokio::test]
    async fn changing_accounts_during_a_read_rejects_mixed_profile_data() {
        let (client, server) = mock_client(true, false);
        assert!(client
            .get_profile()
            .await
            .unwrap_err()
            .starts_with("ACCOUNT_CHANGED:"));
        server.join().unwrap();
    }

    #[tokio::test]
    #[ignore = "requires a logged-in local League client"]
    async fn live_profile_read() {
        let client = LcuClient::new(discovery::discover().expect("local League client")).unwrap();
        let profile = client.get_profile().await.expect("current account profile");
        assert!(!profile.summoner.name.is_empty());
        assert!(profile.rank.is_some());
        assert!(profile.matches.is_some());
        assert!(profile.assets.champions_owned.is_some());
        assert!(profile.assets.skins_owned.is_some());
        assert!(
            profile.warnings.is_empty(),
            "section warnings: {:?}",
            profile.warnings
        );
        if let Some(path) = &profile.summoner.icon_path {
            let image = client.get_image_data_url(path).await.expect("profile icon");
            assert!(image.starts_with("data:image/"));
        }
        println!("Live profile read passed: {} matches, champions {:?}/{:?}, skins {:?}/{:?}; avatar readable",
            profile.matches.unwrap().len(), profile.assets.champions_owned, profile.assets.champions_total,
            profile.assets.skins_owned, profile.assets.skins_total);
    }
}
