use crate::{
    db::{Database, EncounteredGame, SavedPlayer},
    lcu::LcuClient,
    match_history::{
        champion_name_map, compute_recent_stats, extract_history_games, is_valid_puuid, number,
        parse_player_matches, parse_ranked_entries, parse_summoner_overview, queue_name_map, text,
        PlayerMatchSummary,
    },
    models::now_ms,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::Arc,
};
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OngoingMatchChip {
    pub game_id: u64,
    pub champion_id: u64,
    pub result: String,
    pub kills: u64,
    pub deaths: u64,
    pub assists: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OngoingPlayer {
    pub puuid: String,
    pub game_name: String,
    pub tag_line: String,
    pub icon_path: Option<String>,
    pub champion_id: Option<u64>,
    pub champion_name: Option<String>,
    pub position: Option<String>,
    pub is_self: bool,
    pub rank_label: String,
    pub win_rate: Option<u64>,
    pub wins: usize,
    pub losses: usize,
    pub avg_kda: Option<f64>,
    pub streak: i32,
    pub score: Option<u64>,
    pub premade_group: Option<String>,
    pub tags: Vec<String>,
    pub saved: Option<SavedPlayer>,
    pub encountered_count: usize,
    pub recent_games: Vec<OngoingMatchChip>,
    pub privacy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OngoingGameSnapshot {
    pub active: bool,
    pub phase: String,
    pub stage_label: String,
    pub game_id: Option<u64>,
    pub queue_id: Option<u64>,
    pub self_puuid: String,
    pub can_send_chat: bool,
    pub my_team: Vec<OngoingPlayer>,
    pub enemy_team: Vec<OngoingPlayer>,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone)]
struct RosterMember {
    puuid: String,
    fallback_name: String,
    champion_id: Option<u64>,
    position: Option<String>,
}

fn position_label(raw: Option<&str>) -> Option<String> {
    match raw.map(|s| s.to_ascii_uppercase()).as_deref() {
        Some("TOP") => Some("上路".to_string()),
        Some("JUNGLE") => Some("打野".to_string()),
        Some("MIDDLE") => Some("中路".to_string()),
        Some("BOTTOM") => Some("下路".to_string()),
        Some("UTILITY") => Some("辅助".to_string()),
        _ => None,
    }
}

/// Infers premade team groups (e.g. "A", "B") among `team_puuids` from their recent match co-occurrence.
/// Ported conceptually from LeagueAkari's team-up-calc graph + union-find algorithm (MIT License).
pub(crate) fn infer_premade_groups(
    team_puuids: &[String],
    co_games: &[(u64, u64, Vec<String>)], // (game_id, team_id, participant_puuids)
    threshold: usize,
) -> HashMap<String, String> {
    let team_set: HashSet<&str> = team_puuids.iter().map(String::as_str).collect();
    if team_set.len() < 2 {
        return HashMap::new();
    }

    // Deduplicate by (game_id, team_id) and count pairwise shared matches within this team
    let mut seen_game_team = HashSet::new();
    let mut pair_counts: HashMap<(&str, &str), usize> = HashMap::new();

    for (game_id, team_id, participants) in co_games {
        if !seen_game_team.insert((*game_id, *team_id)) {
            continue;
        }
        let mut present: Vec<&str> = participants
            .iter()
            .map(String::as_str)
            .filter(|p| team_set.contains(p))
            .collect();
        present.sort_unstable();
        present.dedup();
        if present.len() < 2 {
            continue;
        }
        for i in 0..present.len() {
            for j in (i + 1)..present.len() {
                *pair_counts.entry((present[i], present[j])).or_default() += 1;
            }
        }
    }

    // Union-Find over players linked by >= threshold shared games
    let mut parent: HashMap<&str, &str> = team_puuids
        .iter()
        .map(|p| (p.as_str(), p.as_str()))
        .collect();

    fn find<'a>(parent: &mut HashMap<&'a str, &'a str>, x: &'a str) -> &'a str {
        let p = parent[x];
        if p == x {
            x
        } else {
            let root = find(parent, p);
            parent.insert(x, root);
            root
        }
    }

    for ((a, b), count) in &pair_counts {
        if *count >= threshold {
            let ra = find(&mut parent, a);
            let rb = find(&mut parent, b);
            if ra != rb {
                parent.insert(rb, ra);
            }
        }
    }

    let mut groups: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    let index_of: HashMap<&str, usize> = team_puuids
        .iter()
        .enumerate()
        .map(|(i, p)| (p.as_str(), i))
        .collect();
    let mut root_min_index: HashMap<&str, usize> = HashMap::new();
    for p in team_puuids {
        let root = find(&mut parent, p.as_str());
        let idx = index_of[p.as_str()];
        root_min_index
            .entry(root)
            .and_modify(|cur| *cur = (*cur).min(idx))
            .or_insert(idx);
    }
    for p in team_puuids {
        let root = find(&mut parent, p.as_str());
        groups.entry(root_min_index[root]).or_default().push(p.clone());
    }

    let labels = ["A", "B", "C", "D"];
    let mut assigned = HashMap::new();
    let mut label_idx = 0usize;
    for members in groups.into_values() {
        if members.len() >= 2 && label_idx < labels.len() {
            let label = labels[label_idx].to_string();
            label_idx += 1;
            for puuid in members {
                assigned.insert(puuid, label.clone());
            }
        }
    }
    assigned
}

fn extract_co_games(games: &[Value]) -> Vec<(u64, u64, Vec<String>)> {
    let mut out = Vec::new();
    for game in games {
        let Some(game_id) = number(game, "gameId") else {
            continue;
        };
        let pid_to_puuid: HashMap<u64, String> = game
            .get("participantIdentities")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|ident| {
                let pid = number(ident, "participantId")?;
                let puuid = ident.get("player").and_then(|p| text(p, "puuid"))?;
                is_valid_puuid(puuid).then(|| (pid, puuid.to_string()))
            })
            .collect();
        let mut by_team: HashMap<u64, Vec<String>> = HashMap::new();
        for p in game
            .get("participants")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(pid) = number(p, "participantId") else {
                continue;
            };
            let Some(team_id) = number(p, "teamId") else {
                continue;
            };
            if let Some(puuid) = pid_to_puuid.get(&pid) {
                by_team.entry(team_id).or_default().push(puuid.clone());
            }
        }
        for (team_id, members) in by_team {
            if members.len() > 1 {
                out.push((game_id, team_id, members));
            }
        }
    }
    out
}

fn collect_champ_select_roster(session: &Value) -> (Vec<RosterMember>, Vec<RosterMember>, Option<u64>) {
    let parse_team = |key: &str| -> Vec<RosterMember> {
        session
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|m| {
                let puuid = text(m, "puuid").filter(|p| is_valid_puuid(p))?.to_string();
                let champion_id = number(m, "championId")
                    .filter(|id| *id > 0)
                    .or_else(|| number(m, "championPickIntent").filter(|id| *id > 0));
                let position = position_label(text(m, "assignedPosition"));
                let fallback_name = text(m, "gameName")
                    .or_else(|| text(m, "summonerName"))
                    .unwrap_or("队友")
                    .to_string();
                Some(RosterMember {
                    puuid,
                    fallback_name,
                    champion_id,
                    position,
                })
            })
            .collect()
    };
    let game_id = number(session, "gameId").filter(|id| *id > 0);
    (parse_team("myTeam"), parse_team("theirTeam"), game_id)
}

fn collect_ingame_roster(
    session: &Value,
    self_puuid: &str,
) -> (Vec<RosterMember>, Vec<RosterMember>, Option<u64>, Option<u64>) {
    let Some(game_data) = session.get("gameData") else {
        return (Vec::new(), Vec::new(), None, None);
    };
    let champ_map: HashMap<String, u64> = game_data
        .get("playerChampionSelections")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|s| {
            let puuid = text(s, "puuid").filter(|p| is_valid_puuid(p))?.to_string();
            let cid = number(s, "championId").filter(|id| *id > 0)?;
            Some((puuid, cid))
        })
        .collect();

    let parse_team = |key: &str| -> Vec<RosterMember> {
        game_data
            .get(key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|m| {
                let puuid = text(m, "puuid").filter(|p| is_valid_puuid(p))?.to_string();
                let champion_id = number(m, "championId")
                    .filter(|id| *id > 0)
                    .or_else(|| champ_map.get(&puuid).copied());
                let position = position_label(text(m, "selectedPosition"));
                let fallback_name = text(m, "summonerName")
                    .or_else(|| text(m, "gameName"))
                    .unwrap_or("玩家")
                    .to_string();
                Some(RosterMember {
                    puuid,
                    fallback_name,
                    champion_id,
                    position,
                })
            })
            .collect()
    };

    let t1 = parse_team("teamOne");
    let t2 = parse_team("teamTwo");
    let game_id = number(game_data, "gameId").filter(|id| *id > 0);
    let queue_id = game_data.pointer("/queue/id").and_then(|v| v.as_u64());
    let self_in_t2 = t2.iter().any(|m| m.puuid == self_puuid);
    if self_in_t2 {
        (t2, t1, game_id, queue_id)
    } else {
        (t1, t2, game_id, queue_id)
    }
}

fn collect_lobby_roster(lobby: &Value) -> (Vec<RosterMember>, Option<u64>) {
    let members = lobby
        .get("members")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let puuid = text(m, "puuid").filter(|p| is_valid_puuid(p))?.to_string();
            let fallback_name = text(m, "summonerName")
                .or_else(|| text(m, "gameName"))
                .unwrap_or("房间成员")
                .to_string();
            let position = position_label(text(m, "firstPositionPreference"));
            Some(RosterMember {
                puuid,
                fallback_name,
                champion_id: None,
                position,
            })
        })
        .collect();
    let queue_id = lobby.pointer("/gameConfig/queueId").and_then(|v| v.as_u64());
    (members, queue_id)
}

#[allow(dead_code)]
pub fn format_champ_select_summary(snapshot: &OngoingGameSnapshot) -> String {
    let lines: Vec<String> = snapshot
        .my_team
        .iter()
        .take(5)
        .map(|p| {
            let wr = p
                .win_rate
                .map(|v| format!("{v}%"))
                .unwrap_or_else(|| "--".to_string());
            let kda = p
                .avg_kda
                .map(|v| format!("{v:.1}"))
                .unwrap_or_else(|| "--".to_string());
            let streak = if p.streak >= 3 {
                format!(" {}连胜", p.streak)
            } else if p.streak <= -3 {
                format!(" {}连败", -p.streak)
            } else {
                String::new()
            };
            format!("{} 胜率{} KDA{}{}", p.game_name, wr, kda, streak)
        })
        .collect();
    lines.join(" | ")
}

async fn hydrate_member(
    client: Arc<LcuClient>,
    semaphore: Arc<Semaphore>,
    member: RosterMember,
    self_puuid: String,
    champion_names: Arc<HashMap<u64, String>>,
    queue_names: Arc<HashMap<u64, String>>,
    db: Option<Arc<Database>>,
) -> (OngoingPlayer, Vec<(u64, u64, Vec<String>)>) {
    let _permit = semaphore.acquire_owned().await.ok();

    let summoner_ep = format!("/lol-summoner/v2/summoners/puuid/{}", member.puuid);
    let ranked_ep = format!("/lol-ranked/v1/ranked-stats/{}", member.puuid);
    let history_ep = format!(
        "/lol-match-history/v1/products/lol/{}/matches?begIndex=0&endIndex=9",
        member.puuid
    );

    let (summoner_res, ranked_res, history_res) = tokio::join!(
        client.profile_json(&summoner_ep),
        client.profile_json(&ranked_ep),
        client.profile_json(&history_ep),
    );

    let overview = summoner_res.ok().as_ref().and_then(parse_summoner_overview);
    let game_name = overview
        .as_ref()
        .map(|o| o.game_name.clone())
        .unwrap_or_else(|| member.fallback_name.clone());
    let tag_line = overview
        .as_ref()
        .map(|o| o.tag_line.clone())
        .unwrap_or_default();
    let icon_path = overview.as_ref().and_then(|o| o.icon_path.clone());
    let privacy = overview
        .as_ref()
        .map(|o| o.privacy.clone())
        .unwrap_or_else(|| "PUBLIC".to_string());

    let ranks = ranked_res
        .ok()
        .as_ref()
        .map(parse_ranked_entries)
        .unwrap_or_default();
    let primary_rank = ranks
        .iter()
        .find(|r| r.ranked)
        .or_else(|| ranks.first());
    let rank_label = match primary_rank {
        Some(r) if r.ranked => format!("{} {}", r.tier, r.division).trim().to_string(),
        _ => "未定级".to_string(),
    };

    let (matches, co_games): (Vec<PlayerMatchSummary>, Vec<(u64, u64, Vec<String>)>) =
        match history_res.ok() {
            Some(val) => {
                let raw = extract_history_games(&val);
                let parsed = parse_player_matches(raw, &member.puuid, &champion_names, &queue_names);
                let co = extract_co_games(raw);
                (parsed, co)
            }
            None => (Vec::new(), Vec::new()),
        };

    let stats = compute_recent_stats(&matches);

    let (saved, encountered_count) = if let Some(db) = db {
        let puuid_c = member.puuid.clone();
        let self_c = self_puuid.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let saved = db.get_saved_player(&puuid_c, &self_c).ok().flatten();
            let enc = db
                .list_encountered_games(&self_c, &puuid_c, 50)
                .map(|v| v.len())
                .unwrap_or(0);
            (saved, enc)
        })
        .await
        .unwrap_or((None, 0))
    } else {
        (None, 0)
    };

    let mut tags = Vec::new();
    if let Some(s) = &saved {
        if !s.tag.is_empty() {
            tags.push(s.tag.clone());
        }
    }
    if stats.streak >= 3 {
        tags.push(format!("{}连胜", stats.streak));
    } else if stats.streak <= -3 {
        tags.push(format!("{}连败", -stats.streak));
    }
    if stats.sample_size >= 5 {
        if let Some(wr) = stats.win_rate {
            if wr >= 70 {
                tags.push("高胜率".to_string());
            }
        }
    }
    if encountered_count > 0 && member.puuid != self_puuid {
        tags.push(format!("遇过 {encountered_count} 次"));
    }

    let recent_games = matches
        .iter()
        .take(5)
        .map(|m| OngoingMatchChip {
            game_id: m.game_id,
            champion_id: m.champion_id,
            result: m.result.clone(),
            kills: m.kills,
            deaths: m.deaths,
            assists: m.assists,
        })
        .collect();

    let champion_name = member
        .champion_id
        .and_then(|cid| champion_names.get(&cid).cloned());

    let player = OngoingPlayer {
        is_self: !self_puuid.is_empty() && member.puuid == self_puuid,
        puuid: member.puuid,
        game_name,
        tag_line,
        icon_path,
        champion_id: member.champion_id,
        champion_name,
        position: member.position,
        rank_label,
        win_rate: stats.win_rate,
        wins: stats.wins,
        losses: stats.losses,
        avg_kda: stats.avg_kda,
        streak: stats.streak,
        score: stats.score,
        premade_group: None,
        tags,
        saved,
        encountered_count,
        recent_games,
        privacy,
    };

    (player, co_games)
}

pub async fn build_ongoing_game(
    client: Arc<LcuClient>,
    semaphore: Arc<Semaphore>,
    db: Option<Arc<Database>>,
) -> Result<OngoingGameSnapshot, String> {
    let phase = client
        .get_phase()
        .await
        .map_err(|_| "无法读取客户端当前阶段".to_string())?;
    let self_puuid = client.get_self_puuid().await.unwrap_or_default();

    let (stage_label, my_roster, enemy_roster, game_id, queue_id) = match phase.as_str() {
        "ChampSelect" => {
            let session = client.get_champ_select_session().await.ok().flatten();
            let (my, enemy, gid) = session
                .as_ref()
                .map(collect_champ_select_roster)
                .unwrap_or_default();
            ("选人阶段", my, enemy, gid, None)
        }
        "InProgress" | "GameStart" | "Reconnect" | "WaitingForStats" | "PreEndOfGame"
        | "EndOfGame" => {
            let session = client.get_gameflow_session().await.ok().flatten();
            let (my, enemy, gid, qid) = session
                .as_ref()
                .map(|s| collect_ingame_roster(s, &self_puuid))
                .unwrap_or_default();
            ("对局中", my, enemy, gid, qid)
        }
        "Lobby" | "Matchmaking" | "ReadyCheck" => {
            let lobby = client.get_lobby().await.ok().flatten();
            let (my, qid) = lobby
                .as_ref()
                .map(collect_lobby_roster)
                .unwrap_or_default();
            ("房间中", my, Vec::new(), None, qid)
        }
        _ => {
            return Ok(OngoingGameSnapshot {
                active: false,
                phase,
                stage_label: "等待对局".to_string(),
                game_id: None,
                queue_id: None,
                self_puuid,
                can_send_chat: false,
                my_team: Vec::new(),
                enemy_team: Vec::new(),
                updated_at_ms: now_ms(),
            });
        }
    };

    if my_roster.is_empty() && enemy_roster.is_empty() {
        return Ok(OngoingGameSnapshot {
            active: false,
            phase,
            stage_label: stage_label.to_string(),
            game_id,
            queue_id,
            self_puuid,
            can_send_chat: false,
            my_team: Vec::new(),
            enemy_team: Vec::new(),
            updated_at_ms: now_ms(),
        });
    }

    let (champions, queues) = tokio::join!(
        client.profile_json("/lol-game-data/assets/v1/champion-summary.json"),
        client.profile_json("/lol-game-queues/v1/queues"),
    );
    let champion_names = Arc::new(champion_name_map(champions.ok().as_ref()));
    let queue_names = Arc::new(queue_name_map(queues.ok().as_ref()));

    let mut my_handles = Vec::with_capacity(my_roster.len());
    for m in my_roster {
        my_handles.push(tokio::spawn(hydrate_member(
            client.clone(),
            semaphore.clone(),
            m,
            self_puuid.clone(),
            champion_names.clone(),
            queue_names.clone(),
            db.clone(),
        )));
    }
    let mut enemy_handles = Vec::with_capacity(enemy_roster.len());
    for m in enemy_roster {
        enemy_handles.push(tokio::spawn(hydrate_member(
            client.clone(),
            semaphore.clone(),
            m,
            self_puuid.clone(),
            champion_names.clone(),
            queue_names.clone(),
            db.clone(),
        )));
    }

    let mut my_team = Vec::new();
    let mut my_co_games = Vec::new();
    for h in my_handles {
        if let Ok((p, co)) = h.await {
            my_team.push(p);
            my_co_games.extend(co);
        }
    }

    let mut enemy_team = Vec::new();
    let mut enemy_co_games = Vec::new();
    for h in enemy_handles {
        if let Ok((p, co)) = h.await {
            enemy_team.push(p);
            enemy_co_games.extend(co);
        }
    }

    let my_puuids: Vec<String> = my_team.iter().map(|p| p.puuid.clone()).collect();
    let my_premades = infer_premade_groups(&my_puuids, &my_co_games, 2);
    for p in &mut my_team {
        p.premade_group = my_premades.get(&p.puuid).cloned();
    }

    let enemy_puuids: Vec<String> = enemy_team.iter().map(|p| p.puuid.clone()).collect();
    let enemy_premades = infer_premade_groups(&enemy_puuids, &enemy_co_games, 2);
    for p in &mut enemy_team {
        p.premade_group = enemy_premades.get(&p.puuid).cloned();
    }

    // Record encountered games cleanly in SQLite when we have a real game_id
    if let (Some(gid), Some(db_arc)) = (game_id, db) {
        if !self_puuid.is_empty() {
            let now = now_ms();
            let qid_val = queue_id.unwrap_or_default() as i32;
            let mut records = Vec::new();
            for p in &my_team {
                if p.puuid != self_puuid {
                    records.push(EncounteredGame {
                        game_id: gid as i64,
                        puuid: p.puuid.clone(),
                        self_puuid: self_puuid.clone(),
                        queue_id: qid_val,
                        champion_id: p.champion_id.unwrap_or_default() as i32,
                        same_team: true,
                        result: String::new(),
                        played_at_ms: now,
                    });
                }
            }
            for p in &enemy_team {
                if p.puuid != self_puuid {
                    records.push(EncounteredGame {
                        game_id: gid as i64,
                        puuid: p.puuid.clone(),
                        self_puuid: self_puuid.clone(),
                        queue_id: qid_val,
                        champion_id: p.champion_id.unwrap_or_default() as i32,
                        same_team: false,
                        result: String::new(),
                        played_at_ms: now,
                    });
                }
            }
            if !records.is_empty() {
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    for rec in records {
                        let _ = db_arc.record_encountered_game(&rec);
                    }
                })
                .await;
            }
        }
    }

    let can_send_chat = phase == "ChampSelect" && !my_team.is_empty();

    Ok(OngoingGameSnapshot {
        active: true,
        phase,
        stage_label: stage_label.to_string(),
        game_id,
        queue_id,
        self_puuid,
        can_send_chat,
        my_team,
        enemy_team,
        updated_at_ms: now_ms(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infer_premade_groups_detects_duo_and_trio_cleanly() {
        let team = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d".to_string(),
            "e".to_string(),
        ];
        let co_games = vec![
            (1, 100, vec!["a".into(), "b".into()]),
            (2, 100, vec!["a".into(), "b".into()]),
            (3, 100, vec!["c".into(), "d".into(), "e".into()]),
            (4, 100, vec!["c".into(), "d".into()]),
            (5, 100, vec!["d".into(), "e".into()]),
            (6, 100, vec!["a".into(), "c".into()]), // only 1 game together -> below threshold 2
        ];
        let map = infer_premade_groups(&team, &co_games, 2);
        assert_eq!(map.get("a").map(String::as_str), Some("A"));
        assert_eq!(map.get("b").map(String::as_str), Some("A"));
        assert_eq!(map.get("c").map(String::as_str), Some("B"));
        assert_eq!(map.get("d").map(String::as_str), Some("B"));
        assert_eq!(map.get("e").map(String::as_str), Some("B"));
    }

    #[test]
    fn infer_premade_groups_ignores_single_overlap() {
        let team = vec!["a".to_string(), "b".to_string()];
        let co_games = vec![(10, 100, vec!["a".into(), "b".into()])];
        assert!(infer_premade_groups(&team, &co_games, 2).is_empty());
    }
}
