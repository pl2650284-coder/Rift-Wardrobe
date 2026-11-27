use crate::{lcu::LcuClient, models::now_ms};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    time::{Duration, Instant},
};

const MAX_LOGS: usize = 50;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PositionChampions {
    #[serde(default)]
    pub default: Vec<i64>,
    #[serde(default)]
    pub top: Vec<i64>,
    #[serde(default)]
    pub jungle: Vec<i64>,
    #[serde(default)]
    pub middle: Vec<i64>,
    #[serde(default)]
    pub bottom: Vec<i64>,
    #[serde(default)]
    pub utility: Vec<i64>,
}

impl PositionChampions {
    pub fn list_for(&self, position: Option<&str>) -> &[i64] {
        let specific = match position.map(|s| s.to_ascii_lowercase()).as_deref() {
            Some("top") => &self.top,
            Some("jungle") => &self.jungle,
            Some("middle") => &self.middle,
            Some("bottom") => &self.bottom,
            Some("utility") => &self.utility,
            _ => &self.default,
        };
        if specific.is_empty() {
            &self.default
        } else {
            specific
        }
    }
}

fn default_strategy() -> String {
    "show-and-lock-in".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoSelectConfig {
    #[serde(default)]
    pub pick_enabled: bool,
    #[serde(default = "default_strategy")]
    pub pick_strategy: String,
    #[serde(default)]
    pub pick_delay_seconds: u8,
    #[serde(default)]
    pub show_intent: bool,
    #[serde(default)]
    pub ignore_teammate_intent: bool,
    #[serde(default)]
    pub pick_champions: PositionChampions,

    #[serde(default)]
    pub ban_enabled: bool,
    #[serde(default = "default_strategy")]
    pub ban_strategy: String,
    #[serde(default)]
    pub ban_delay_seconds: u8,
    #[serde(default = "default_true")]
    pub ban_avoid_teammate_intent: bool,
    #[serde(default)]
    pub ban_champions: PositionChampions,

    #[serde(default)]
    pub bench_enabled: bool,
    #[serde(default)]
    pub bench_delay_seconds: u8,
    #[serde(default)]
    pub bench_champions: Vec<i64>,
    #[serde(default)]
    pub bench_auto_accept_trade: bool,
}

impl Default for AutoSelectConfig {
    fn default() -> Self {
        Self {
            pick_enabled: false,
            pick_strategy: default_strategy(),
            pick_delay_seconds: 0,
            show_intent: false,
            ignore_teammate_intent: false,
            pick_champions: PositionChampions::default(),
            ban_enabled: false,
            ban_strategy: default_strategy(),
            ban_delay_seconds: 0,
            ban_avoid_teammate_intent: true,
            ban_champions: PositionChampions::default(),
            bench_enabled: false,
            bench_delay_seconds: 1,
            bench_champions: Vec::new(),
            bench_auto_accept_trade: false,
        }
    }
}

impl AutoSelectConfig {
    pub fn sanitize(&mut self) {
        self.pick_delay_seconds = self.pick_delay_seconds.min(10);
        self.ban_delay_seconds = self.ban_delay_seconds.min(10);
        self.bench_delay_seconds = self.bench_delay_seconds.min(5);
        if !matches!(
            self.pick_strategy.as_str(),
            "show-and-lock-in" | "just-show" | "lock-in-immediately"
        ) {
            self.pick_strategy = default_strategy();
        }
        if !matches!(
            self.ban_strategy.as_str(),
            "show-and-lock-in" | "just-show" | "lock-in-immediately"
        ) {
            self.ban_strategy = default_strategy();
        }
        let dedup = |list: &mut Vec<i64>| {
            let mut seen = HashSet::new();
            list.retain(|id| *id > 0 && seen.insert(*id));
            list.truncate(20);
        };
        dedup(&mut self.pick_champions.default);
        dedup(&mut self.pick_champions.top);
        dedup(&mut self.pick_champions.jungle);
        dedup(&mut self.pick_champions.middle);
        dedup(&mut self.pick_champions.bottom);
        dedup(&mut self.pick_champions.utility);
        dedup(&mut self.ban_champions.default);
        dedup(&mut self.ban_champions.top);
        dedup(&mut self.ban_champions.jungle);
        dedup(&mut self.ban_champions.middle);
        dedup(&mut self.ban_champions.bottom);
        dedup(&mut self.ban_champions.utility);
        dedup(&mut self.bench_champions);
    }

    pub fn any_enabled(&self) -> bool {
        self.pick_enabled || self.ban_enabled || self.bench_enabled
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSelectLog {
    pub id: String,
    pub timestamp_ms: u64,
    pub action: String,
    pub detail: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSelectSnapshot {
    pub config: AutoSelectConfig,
    pub paused_this_game: bool,
    pub revision: u64,
    pub logs: Vec<AutoSelectLog>,
}

#[derive(Default)]
pub struct AutoSelect {
    config: AutoSelectConfig,
    path: Option<PathBuf>,
    paused_this_game: bool,
    revision: u64,
    logs: Vec<AutoSelectLog>,

    // Per-session ephemeral guards (reset automatically when leaving ChampSelect)
    intent_sent_actions: HashSet<i64>,
    shown_actions: HashSet<i64>,
    completed_actions: HashSet<i64>,
    action_first_seen: HashMap<i64, Instant>,
    bench_seen_at: HashMap<i64, Instant>,
    last_bench_swap_at: Option<Instant>,
    handled_trades: HashSet<i64>,
}

impl AutoSelect {
    pub fn load(path: PathBuf) -> Self {
        let mut engine = Self {
            path: Some(path.clone()),
            ..Self::default()
        };
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(mut cfg) = serde_json::from_slice::<AutoSelectConfig>(&bytes) {
                cfg.sanitize();
                engine.config = cfg;
            }
        }
        engine
    }

    pub fn snapshot(&self) -> AutoSelectSnapshot {
        AutoSelectSnapshot {
            config: self.config.clone(),
            paused_this_game: self.paused_this_game,
            revision: self.revision,
            logs: self.logs.clone(),
        }
    }

    pub fn update_config(
        &mut self,
        mut next: AutoSelectConfig,
    ) -> Result<AutoSelectSnapshot, String> {
        next.sanitize();
        if let Some(path) = &self.path {
            let parent = path.parent().ok_or("自动选禁配置目录无效")?;
            fs::create_dir_all(parent).map_err(|_| "无法创建配置目录")?;
            let bytes =
                serde_json::to_vec_pretty(&next).map_err(|_| "无法序列化自动选禁配置")?;
            let tmp = path.with_extension("tmp");
            fs::write(&tmp, bytes).map_err(|_| "无法写入自动选禁配置")?;
            fs::rename(&tmp, path).map_err(|_| "无法保存自动选禁配置")?;
        }
        self.config = next;
        self.revision += 1;
        Ok(self.snapshot())
    }

    pub fn set_paused_this_game(&mut self, paused: bool) -> AutoSelectSnapshot {
        if self.paused_this_game != paused {
            self.paused_this_game = paused;
            self.log(
                "自动选禁",
                if paused {
                    "已暂停本局自动选禁与候补席秒抢"
                } else {
                    "已恢复本局自动选禁"
                },
                "success",
            );
        }
        self.snapshot()
    }

    pub fn reset_session(&mut self) {
        self.paused_this_game = false;
        self.intent_sent_actions.clear();
        self.shown_actions.clear();
        self.completed_actions.clear();
        self.action_first_seen.clear();
        self.bench_seen_at.clear();
        self.last_bench_swap_at = None;
        self.handled_trades.clear();
    }

    fn log(&mut self, action: &str, detail: &str, status: &str) {
        self.revision += 1;
        let ts = now_ms();
        self.logs.insert(
            0,
            AutoSelectLog {
                id: format!("autoselect-{ts}-{}", self.revision),
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
        if phase != "ChampSelect" {
            if self.paused_this_game
                || !self.action_first_seen.is_empty()
                || !self.bench_seen_at.is_empty()
                || !self.handled_trades.is_empty()
            {
                self.reset_session();
                self.revision += 1;
            }
            return self.revision != prev_rev;
        }
        if self.paused_this_game || !self.config.any_enabled() {
            return false;
        }
        let Ok(Some(session)) = client.get_champ_select_session().await else {
            return false;
        };

        let local_cell_id = val_i64(&session, "localPlayerCellId").unwrap_or(-1);
        if local_cell_id < 0 {
            return false;
        }

        let my_team = session
            .get("myTeam")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let their_team = session
            .get("theirTeam")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let local_member = my_team
            .iter()
            .find(|m| val_i64(m, "cellId") == Some(local_cell_id));
        let assigned_position = local_member
            .and_then(|m| m.get("assignedPosition").and_then(Value::as_str))
            .map(str::trim)
            .filter(|s| !s.is_empty());

        let bench_enabled_in_session = session
            .get("benchEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        if bench_enabled_in_session && self.config.bench_enabled {
            self.tick_bench(client, &session, local_member).await;
            return self.revision != prev_rev;
        }

        // Collect currently picked, banned, and teammate-intended champions
        let mut unavailable_for_pick = HashSet::new();
        let mut teammate_intents = HashSet::new();
        let mut already_banned = HashSet::new();

        for m in my_team.iter().chain(their_team.iter()) {
            let cid = val_i64(m, "championId").unwrap_or(0);
            if cid > 0 {
                unavailable_for_pick.insert(cid);
            }
            if val_i64(m, "cellId") != Some(local_cell_id) {
                let intent = val_i64(m, "championPickIntent").unwrap_or(0);
                if intent > 0 {
                    teammate_intents.insert(intent);
                }
            }
        }
        if let Some(bans) = session.get("bans") {
            for key in ["myTeamBans", "theirTeamBans"] {
                for id in bans
                    .get(key)
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v.as_i64())
                {
                    if id > 0 {
                        unavailable_for_pick.insert(id);
                        already_banned.insert(id);
                    }
                }
            }
        }

        let actions = flatten_actions(&session);
        for act in &actions {
            if act.completed && act.champion_id > 0 {
                if act.kind == "ban" {
                    already_banned.insert(act.champion_id);
                    unavailable_for_pick.insert(act.champion_id);
                } else if act.kind == "pick" {
                    unavailable_for_pick.insert(act.champion_id);
                }
            }
        }

        let my_active_action = actions
            .iter()
            .find(|a| a.actor_cell_id == local_cell_id && a.is_in_progress && !a.completed);

        // 1. Pre-pick intent (when planning or waiting for our pick turn)
        if self.config.pick_enabled && self.config.show_intent && my_active_action.is_none() {
            if let Some(first_pick) = actions
                .iter()
                .find(|a| a.actor_cell_id == local_cell_id && a.kind == "pick" && !a.completed)
            {
                if !self.intent_sent_actions.contains(&first_pick.id) && first_pick.champion_id == 0
                {
                    let pickable: HashSet<i64> = client
                        .get_pickable_champion_ids()
                        .await
                        .unwrap_or_default()
                        .into_iter()
                        .collect();
                    let list = self.config.pick_champions.list_for(assigned_position);
                    if let Some(cid) = choose_pick_candidate(
                        list,
                        &pickable,
                        &unavailable_for_pick,
                        &teammate_intents,
                        self.config.ignore_teammate_intent,
                    ) {
                        self.intent_sent_actions.insert(first_pick.id);
                        if client
                            .champ_select_action(first_pick.id, cid, None)
                            .await
                            .is_ok()
                        {
                            self.log("自动预选", &format!("已预选英雄 #{cid}"), "success");
                        }
                    }
                }
            }
        }

        // 2. Active pick / ban action
        if let Some(act) = my_active_action {
            if self.completed_actions.contains(&act.id) {
                return self.revision != prev_rev;
            }
            let first_seen = *self
                .action_first_seen
                .entry(act.id)
                .or_insert_with(Instant::now);

            if act.kind == "pick" && self.config.pick_enabled {
                let pickable: HashSet<i64> = client
                    .get_pickable_champion_ids()
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                let list = self.config.pick_champions.list_for(assigned_position);
                if let Some(cid) = choose_pick_candidate(
                    list,
                    &pickable,
                    &unavailable_for_pick,
                    &teammate_intents,
                    self.config.ignore_teammate_intent,
                ) {
                    self.execute_action(
                        client,
                        act,
                        cid,
                        &self.config.pick_strategy.clone(),
                        self.config.pick_delay_seconds,
                        first_seen,
                        "自动选人",
                    )
                    .await;
                }
            } else if act.kind == "ban" && self.config.ban_enabled {
                let bannable: HashSet<i64> = client
                    .get_bannable_champion_ids()
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                let list = self.config.ban_champions.list_for(assigned_position);
                if let Some(cid) = choose_ban_candidate(
                    list,
                    &bannable,
                    &already_banned,
                    &teammate_intents,
                    self.config.ban_avoid_teammate_intent,
                ) {
                    self.execute_action(
                        client,
                        act,
                        cid,
                        &self.config.ban_strategy.clone(),
                        self.config.ban_delay_seconds,
                        first_seen,
                        "自动禁人",
                    )
                    .await;
                }
            }
        }

        self.revision != prev_rev
    }

    async fn execute_action(
        &mut self,
        client: &LcuClient,
        act: &SessionAction,
        champion_id: i64,
        strategy: &str,
        delay_seconds: u8,
        first_seen: Instant,
        label: &str,
    ) {
        let elapsed = first_seen.elapsed();
        let delay = Duration::from_secs(delay_seconds as u64);

        match strategy {
            "just-show" => {
                if !self.shown_actions.contains(&act.id) {
                    self.shown_actions.insert(act.id);
                    match client
                        .champ_select_action(act.id, champion_id, Some(false))
                        .await
                    {
                        Ok(()) => self.log(label, &format!("已亮出英雄 #{champion_id}"), "success"),
                        Err(e) => self.log(label, &format!("亮出失败：{e}"), "error"),
                    }
                }
            }
            "lock-in-immediately" => {
                if elapsed >= delay {
                    self.completed_actions.insert(act.id);
                    match client
                        .champ_select_action(act.id, champion_id, Some(true))
                        .await
                    {
                        Ok(()) => self.log(label, &format!("已锁定英雄 #{champion_id}"), "success"),
                        Err(e) => self.log(label, &format!("锁定失败：{e}"), "error"),
                    }
                }
            }
            _ => {
                // show-and-lock-in: show immediately, lock after delay
                if !self.shown_actions.contains(&act.id) && act.champion_id != champion_id {
                    self.shown_actions.insert(act.id);
                    let _ = client
                        .champ_select_action(act.id, champion_id, Some(false))
                        .await;
                }
                if elapsed >= delay {
                    self.completed_actions.insert(act.id);
                    match client
                        .champ_select_action(act.id, champion_id, Some(true))
                        .await
                    {
                        Ok(()) => self.log(label, &format!("已锁定英雄 #{champion_id}"), "success"),
                        Err(e) => self.log(label, &format!("锁定失败：{e}"), "error"),
                    }
                }
            }
        }
    }

    async fn tick_bench(
        &mut self,
        client: &LcuClient,
        session: &Value,
        local_member: Option<&Value>,
    ) {
        let current_champ_id = local_member
            .and_then(|m| val_i64(m, "championId"))
            .unwrap_or(0);

        // 1. Auto-handle incoming trades if enabled
        if self.config.bench_auto_accept_trade {
            if let Some(trades) = session.get("trades").and_then(Value::as_array) {
                for trade in trades {
                    let state = trade.get("state").and_then(Value::as_str).unwrap_or("");
                    let Some(trade_id) = val_i64(trade, "id") else {
                        continue;
                    };
                    if state != "RECEIVED" || self.handled_trades.contains(&trade_id) {
                        continue;
                    }
                    let Some(cell_id) = val_i64(trade, "cellId") else {
                        continue;
                    };
                    let offered_champ = session
                        .get("myTeam")
                        .and_then(Value::as_array)
                        .and_then(|team| {
                            team.iter()
                                .find(|m| val_i64(m, "cellId") == Some(cell_id))
                                .and_then(|m| val_i64(m, "championId"))
                        })
                        .unwrap_or(0);
                    if offered_champ > 0
                        && is_higher_priority(&self.config.bench_champions, offered_champ, current_champ_id)
                    {
                        self.handled_trades.insert(trade_id);
                        if client.respond_champion_swap(trade_id, true).await.is_ok() {
                            self.log(
                                "候补席交换",
                                &format!("已自动接受高优先级英雄 #{offered_champ} 的交换请求"),
                                "success",
                            );
                        }
                    }
                }
            }
        }

        // 2. Bench grab
        let bench_ids: Vec<i64> = session
            .get("benchChampions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|c| val_i64(c, "championId").filter(|id| *id > 0))
            .collect();

        let bench_set: HashSet<i64> = bench_ids.iter().copied().collect();
        self.bench_seen_at.retain(|cid, _| bench_set.contains(cid));
        let now = Instant::now();
        for cid in &bench_ids {
            self.bench_seen_at.entry(*cid).or_insert(now);
        }

        if let Some(last) = self.last_bench_swap_at {
            if last.elapsed() < Duration::from_secs(2) {
                return;
            }
        }

        if let Some(target) =
            choose_bench_candidate(&self.config.bench_champions, &bench_ids, current_champ_id)
        {
            let delay = Duration::from_secs(self.config.bench_delay_seconds as u64);
            if self
                .bench_seen_at
                .get(&target)
                .is_some_and(|seen| seen.elapsed() >= delay)
            {
                self.last_bench_swap_at = Some(now);
                match client.bench_swap(target).await {
                    Ok(()) => self.log("候补席秒抢", &format!("已从候补席换入英雄 #{target}"), "success"),
                    Err(e) => self.log("候补席秒抢", &format!("换入失败：{e}"), "error"),
                }
            }
        }
    }
}

struct SessionAction {
    id: i64,
    actor_cell_id: i64,
    champion_id: i64,
    kind: String,
    is_in_progress: bool,
    completed: bool,
}

fn flatten_actions(session: &Value) -> Vec<SessionAction> {
    let mut out = Vec::new();
    for group in session
        .get("actions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for act in group.as_array().into_iter().flatten() {
            let Some(id) = val_i64(act, "id") else {
                continue;
            };
            out.push(SessionAction {
                id,
                actor_cell_id: val_i64(act, "actorCellId").unwrap_or(-1),
                champion_id: val_i64(act, "championId").unwrap_or(0),
                kind: act
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                is_in_progress: act
                    .get("isInProgress")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                completed: act
                    .get("completed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            });
        }
    }
    out
}

fn val_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|item| {
        item.as_i64()
            .or_else(|| item.as_u64().and_then(|n| i64::try_from(n).ok()))
    })
}

pub(crate) fn choose_pick_candidate(
    priority: &[i64],
    pickable: &HashSet<i64>,
    unavailable: &HashSet<i64>,
    teammate_intents: &HashSet<i64>,
    ignore_teammate_intent: bool,
) -> Option<i64> {
    priority.iter().copied().find(|cid| {
        *cid > 0
            && (pickable.is_empty() || pickable.contains(cid))
            && !unavailable.contains(cid)
            && (ignore_teammate_intent || !teammate_intents.contains(cid))
    })
}

pub(crate) fn choose_ban_candidate(
    priority: &[i64],
    bannable: &HashSet<i64>,
    already_banned: &HashSet<i64>,
    teammate_intents: &HashSet<i64>,
    avoid_teammate_intent: bool,
) -> Option<i64> {
    priority.iter().copied().find(|cid| {
        *cid > 0
            && (bannable.is_empty() || bannable.contains(cid))
            && !already_banned.contains(cid)
            && (!avoid_teammate_intent || !teammate_intents.contains(cid))
    })
}

pub(crate) fn is_higher_priority(priority: &[i64], candidate: i64, current: i64) -> bool {
    let Some(cand_idx) = priority.iter().position(|&id| id == candidate) else {
        return false;
    };
    match priority.iter().position(|&id| id == current) {
        Some(cur_idx) => cand_idx < cur_idx,
        None => true,
    }
}

pub(crate) fn choose_bench_candidate(
    priority: &[i64],
    bench_ids: &[i64],
    current_champ_id: i64,
) -> Option<i64> {
    let bench_set: HashSet<i64> = bench_ids.iter().copied().collect();
    priority
        .iter()
        .copied()
        .find(|cid| bench_set.contains(cid) && is_higher_priority(priority, *cid, current_champ_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_candidate_respects_priority_availability_and_teammate_intent() {
        let pickable = HashSet::from([67, 22, 81]);
        let unavailable = HashSet::from([67]);
        let intents = HashSet::from([22]);
        assert_eq!(
            choose_pick_candidate(&[67, 22, 81], &pickable, &unavailable, &intents, false),
            Some(81)
        );
        assert_eq!(
            choose_pick_candidate(&[67, 22, 81], &pickable, &unavailable, &intents, true),
            Some(22)
        );
    }

    #[test]
    fn ban_candidate_avoids_teammate_intent_when_enabled() {
        let bannable = HashSet::from([157, 238]);
        let already_banned = HashSet::new();
        let intents = HashSet::from([157]);
        assert_eq!(
            choose_ban_candidate(&[157, 238], &bannable, &already_banned, &intents, true),
            Some(238)
        );
        assert_eq!(
            choose_ban_candidate(&[157, 238], &bannable, &already_banned, &intents, false),
            Some(157)
        );
    }

    #[test]
    fn bench_candidate_only_swaps_to_strictly_higher_priority() {
        let priority = vec![67, 22, 81];
        assert_eq!(choose_bench_candidate(&priority, &[81, 22], 103), Some(22));
        assert_eq!(choose_bench_candidate(&priority, &[81], 22), None);
        assert_eq!(choose_bench_candidate(&priority, &[67, 81], 22), Some(67));
    }
}
