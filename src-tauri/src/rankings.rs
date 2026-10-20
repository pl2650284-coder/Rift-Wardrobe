use crate::hextech;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::OnceLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const CDN: &str = "https://game.gtimg.cn/images/lol/act/img/";
const API: &str = "https://mlol.qt.qq.com/go/battle_info/odp_proxy/";
const TTL: Duration = Duration::from_secs(15 * 60);
const META_TTL: Duration = Duration::from_secs(6 * 3600);
const LANES: [&str; 6] = ["all", "top", "jungle", "mid", "bottom", "support"];
const TIERS: [(u32, &str); 17] = [
    (255, "所有段位"),
    (88, "峡谷之巅"),
    (10, "王者"),
    (9, "宗师"),
    (28, "大师+"),
    (8, "大师"),
    (27, "钻石+"),
    (7, "钻石"),
    (26, "翡翠+"),
    (6, "翡翠"),
    (25, "铂金+"),
    (5, "铂金"),
    (24, "黄金+"),
    (4, "黄金"),
    (3, "白银"),
    (2, "黄铜"),
    (1, "黑铁"),
];

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Rift,
    Aram,
    Classic,
}
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Query {
    pub mode: Mode,
    pub lane: Option<String>,
    pub tier: Option<u32>,
    pub version: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct OptionItem {
    pub value: String,
    pub label: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroRef {
    pub hero_id: u32,
    pub name: String,
    pub title: String,
    pub roles: Vec<String>,
    pub icon_path: Option<String>,
    pub icon_url: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    #[serde(flatten)]
    pub hero: HeroRef,
    pub key: String,
    pub rank: u32,
    pub tier: Option<String>,
    pub lane: Option<String>,
    pub lanes: Vec<String>,
    pub win_rate: f64,
    pub pick_rate: f64,
    pub ban_rate: Option<f64>,
    pub rank_change: Option<String>,
    pub counters: Vec<HeroRef>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: Mode,
    pub lane: String,
    pub tier: Option<u32>,
    pub version: Option<String>,
    pub stats_date: Option<String>,
    pub versions: Vec<OptionItem>,
    pub tiers: Vec<OptionItem>,
    pub rows: Vec<Row>,
    pub warnings: Vec<String>,
}
struct Entry<T> {
    at: Instant,
    value: T,
}
impl<T: Clone> Entry<T> {
    fn get(&self, ttl: Duration) -> Option<T> {
        (self.at.elapsed() < ttl).then(|| self.value.clone())
    }
}
#[derive(Default)]
struct Cache {
    metadata: HashMap<bool, Entry<HashMap<u32, Value>>>,
    versions: Option<Entry<Vec<OptionItem>>>,
    snapshots: HashMap<(Query, String), Entry<Snapshot>>,
}
fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
}
fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .map(|v| {
            v.as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| v.to_string())
        })
        .unwrap_or_default()
}
fn valid_version(s: &str) -> bool {
    let Some((major, minor)) = s.split_once('.') else {
        return false;
    };
    !major.is_empty()
        && !minor.is_empty()
        && major.len() <= 3
        && minor.len() <= 3
        && major
            .bytes()
            .chain(minor.bytes())
            .all(|b| b.is_ascii_digit())
}
fn normalize(mut query: Query) -> Result<Query, String> {
    let lane = query.lane.unwrap_or_else(|| "all".into());
    if !LANES.contains(&lane.as_str()) {
        return Err("不支持的位置筛选".into());
    }
    if query.mode == Mode::Aram && lane != "all" {
        return Err("极地大乱斗不支持分路筛选".into());
    }
    query.lane = Some(lane);
    match query.mode {
        Mode::Rift => {
            let tier = query.tier.unwrap_or(26);
            if !TIERS.iter().any(|(id, _)| *id == tier) {
                return Err("不支持的段位筛选".into());
            }
            query.tier = Some(tier);
            if query.version.as_deref().is_some_and(|s| !valid_version(s)) {
                return Err("版本参数无效".into());
            }
        }
        _ => {
            if query.tier.is_some() || query.version.is_some() {
                return Err("该模式没有段位或版本筛选".into());
            }
        }
    }
    Ok(query)
}
fn decode(outer: &Value) -> Result<Option<Value>, String> {
    if outer.get("code").and_then(Value::as_i64) != Some(0) {
        return Err("官网榜单接口返回错误".into());
    }
    match outer.pointer("/data/result") {
        Some(Value::String(s)) if s.trim().is_empty() => Ok(None),
        Some(Value::String(s)) => serde_json::from_str(s)
            .map(Some)
            .map_err(|_| "官网榜单结果无法解析".into()),
        Some(v) if v.is_object() => Ok(Some(v.clone())),
        _ => Err("官网榜单结果结构已变化".into()),
    }
}
async fn payload(endpoint: &str, query: &str) -> Result<Option<Value>, String> {
    decode(&hextech::fetch(format!("{API}{endpoint}?{query}")).await?)
}
fn parse_versions(raw: &Value) -> Result<Vec<OptionItem>, String> {
    if raw.get("code").and_then(Value::as_i64) != Some(0) {
        return Err("官网版本列表返回错误".into());
    }
    let mut seen = HashSet::new();
    let items = raw
        .get("data")
        .and_then(Value::as_array)
        .ok_or("官网版本列表格式已变化")?
        .iter()
        .filter_map(|v| {
            let value = text(v, "name");
            if !valid_version(&value) || !seen.insert(value.clone()) {
                return None;
            }
            Some(OptionItem {
                label: text(v, "title"),
                value,
            })
        })
        .collect::<Vec<_>>();
    if items.is_empty() {
        return Err("官网没有可用的版本列表".into());
    }
    Ok(items)
}
async fn versions(force: bool) -> Result<Vec<OptionItem>, String> {
    if !force {
        if let Some(v) = cache()
            .lock()
            .await
            .versions
            .as_ref()
            .and_then(|e| e.get(TTL))
        {
            return Ok(v);
        }
    }
    let raw =
        hextech::fetch("https://mlol.qt.qq.com/go/database/versionlist?zone=lol&from=h5").await?;
    let result = parse_versions(&raw)?;
    cache().lock().await.versions = Some(Entry {
        at: Instant::now(),
        value: result.clone(),
    });
    Ok(result)
}
async fn metadata(classic: bool, force: bool) -> Result<HashMap<u32, Value>, String> {
    if !force {
        if let Some(v) = cache()
            .lock()
            .await
            .metadata
            .get(&classic)
            .and_then(|e| e.get(META_TTL))
        {
            return Ok(v);
        }
    }
    let url = if classic {
        format!("{CDN}jade/js/heroes_index.js")
    } else {
        format!("{CDN}js/heroList/hero_list.js")
    };
    let raw = hextech::fetch(url).await?;
    let key = if classic { "heroes" } else { "hero" };
    let items = raw
        .get(key)
        .and_then(Value::as_array)
        .ok_or("官网英雄目录格式已变化")?;
    let result: HashMap<_, _> = items
        .iter()
        .filter_map(|v| {
            text(v, "heroId")
                .parse::<u32>()
                .ok()
                .map(|id| (id, v.clone()))
        })
        .collect();
    if result.is_empty() {
        return Err("官网英雄目录为空".into());
    }
    cache().lock().await.metadata.insert(
        classic,
        Entry {
            at: Instant::now(),
            value: result.clone(),
        },
    );
    Ok(result)
}
fn hero_ref(id: u32, catalog: &HashMap<u32, Value>, classic: bool) -> HeroRef {
    let raw = catalog.get(&id);
    let name = raw
        .map(|v| text(v, "name"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("英雄 #{id}"));
    HeroRef {
        hero_id: id,
        name,
        title: raw.map(|v| text(v, "title")).unwrap_or_default(),
        roles: raw
            .and_then(|v| v.get("roles"))
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        // Classic IDs and assets are independent of the current Rift roster.
        icon_path: (!classic).then(|| format!("/lol-game-data/assets/v1/champion-icons/{id}.png")),
        icon_url: if classic {
            Some(format!("{CDN}jade/championsHeadICON/{id}.png"))
        } else {
            raw.map(|v| format!("{CDN}champion/{}.png", text(v, "alias")))
        },
    }
}
fn number(raw: &str) -> Result<u32, String> {
    raw.parse::<u32>().map_err(|_| "官网榜单编号无效".into())
}
fn percent(raw: &str, factor: f64) -> Result<f64, String> {
    let v = raw.parse::<f64>().map_err(|_| "官网榜单比例无效")? * factor;
    if v.is_finite() && (0.0..=100.0).contains(&v) {
        Ok(v)
    } else {
        Err("官网榜单比例超出范围".into())
    }
}
fn date(raw: &Value) -> Result<Option<String>, String> {
    let s = text(raw, "dtstatdate");
    if s.is_empty() {
        return Ok(None);
    }
    if s.len() != 8 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return Err("官网统计日期无效".into());
    }
    Ok(Some(s))
}
fn lane(raw: &str) -> Result<String, String> {
    match raw.to_ascii_lowercase().as_str() {
        "all" => Ok("all".into()),
        "top" => Ok("top".into()),
        "jungle" => Ok("jungle".into()),
        "middle" | "mid" => Ok("mid".into()),
        "bottom" => Ok("bottom".into()),
        "support" => Ok("support".into()),
        _ => Err("官网榜单位置编码已变化".into()),
    }
}
fn tier(raw: &str) -> Result<Option<String>, String> {
    if raw.is_empty() {
        return Ok(None);
    }
    if ["T0", "T1", "T2", "T3", "T4"].contains(&raw) {
        Ok(Some(raw.into()))
    } else {
        Err("官网榜单评级编码已变化".into())
    }
}
fn packed<'a>(raw: &'a Value, key: &str) -> Result<&'a str, String> {
    raw.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("官网 {key} 字段已变化"))
}
fn parse_rows(
    mode: Mode,
    raw: &Value,
    catalog: &HashMap<u32, Value>,
    lane_map: Option<&Value>,
) -> Result<Vec<Row>, String> {
    let key = match mode {
        Mode::Rift => "datadetails",
        Mode::Aram => "listcollect",
        Mode::Classic => "tierscore_top_hero_list",
    };
    let mut seen = HashSet::new();
    let mut result = vec![];
    let mut classic_lanes = HashMap::new();
    if let Some(lanes) = lane_map {
        for entry in packed(lanes, "hero_lane_list")?
            .split('#')
            .filter(|s| !s.is_empty())
        {
            let (id, positions) = entry.split_once('_').ok_or("官网经典位置字段已变化")?;
            classic_lanes.insert(
                number(id)?,
                positions
                    .split(';')
                    .map(lane)
                    .collect::<Result<Vec<_>, _>>()?,
            );
        }
    }
    for record in packed(raw, key)?.split('#').filter(|s| !s.is_empty()) {
        let p: Vec<_> = record
            .split(if mode == Mode::Classic { '|' } else { '_' })
            .collect();
        let expected = match mode {
            Mode::Rift => 11,
            Mode::Aram => 5,
            Mode::Classic => 7,
        };
        if p.len() < expected {
            return Err("官网榜单字段数量已变化".into());
        }
        let (id, rank) = if mode == Mode::Aram {
            (number(p[0])?, number(p[1])?)
        } else {
            (number(p[1])?, number(p[0])?)
        };
        if rank == 0 || id == 0 {
            return Err("官网榜单排名或英雄编号无效".into());
        }
        let row_lane = if mode == Mode::Rift {
            Some(lane(p[3])?)
        } else {
            None
        };
        let key = format!("{id}:{}", row_lane.as_deref().unwrap_or("all"));
        if !seen.insert(key.clone()) {
            return Err("官网榜单包含重复的英雄位置记录".into());
        }
        let (win, pick, ban, grade, change) = match mode {
            Mode::Rift => (
                percent(p[4], 1.0)?,
                percent(p[5], 1.0)?,
                Some(percent(p[6], 1.0)?),
                tier(p[2])?,
                Some(p[8].to_owned()),
            ),
            Mode::Aram => (
                percent(p[3], 100.0)?,
                percent(p[4], 100.0)?,
                None,
                None,
                Some(p[2].to_owned()),
            ),
            Mode::Classic => (
                percent(p[2], 1.0)?,
                percent(p[3], 1.0)?,
                Some(percent(p[4], 1.0)?),
                tier(p[5])?,
                Some(p[6].to_owned()),
            ),
        };
        let counters = if mode == Mode::Rift && !p[7].is_empty() {
            p[7].split(',')
                .map(|v| number(v).map(|id| hero_ref(id, catalog, false)))
                .collect::<Result<Vec<_>, _>>()?
        } else {
            vec![]
        };
        result.push(Row {
            hero: hero_ref(id, catalog, mode == Mode::Classic),
            key,
            rank,
            tier: grade,
            lanes: if mode == Mode::Classic {
                classic_lanes.get(&id).cloned().unwrap_or_default()
            } else {
                row_lane.iter().cloned().collect()
            },
            lane: row_lane,
            win_rate: win,
            pick_rate: pick,
            ban_rate: ban,
            rank_change: change,
            counters,
        });
    }
    Ok(result)
}
fn new_snapshot(query: &Query) -> Snapshot {
    Snapshot {
        mode: query.mode,
        lane: query.lane.clone().unwrap_or_else(|| "all".into()),
        tier: query.tier,
        version: query.version.clone(),
        stats_date: None,
        versions: vec![],
        tiers: if query.mode == Mode::Rift {
            TIERS
                .iter()
                .map(|(id, label)| OptionItem {
                    value: id.to_string(),
                    label: (*label).into(),
                })
                .collect()
        } else {
            vec![]
        },
        rows: vec![],
        warnings: vec![],
    }
}
pub async fn get_ranking(query: Query, force: bool) -> Result<Snapshot, String> {
    let mut query = normalize(query)?;
    let implicit_version = query.version.is_none();
    let version_list = if query.mode == Mode::Rift {
        versions(force).await?
    } else {
        vec![]
    };
    if query.mode == Mode::Rift {
        let selected = query
            .version
            .clone()
            .unwrap_or_else(|| version_list[0].value.clone());
        if !version_list.iter().any(|v| v.value == selected) {
            return Err("官网版本列表中没有该版本".into());
        }
        query.version = Some(selected);
    }
    let key = (query.clone(), hextech::date_ago(1));
    if !force {
        if let Some(v) = cache()
            .lock()
            .await
            .snapshots
            .get(&key)
            .and_then(|e| e.get(TTL))
        {
            return Ok(v);
        }
    }
    let catalog = metadata(query.mode == Mode::Classic, force).await?;
    let mut snapshot = new_snapshot(&query);
    if query.mode == Mode::Rift {
        snapshot.versions = version_list.iter().take(2).cloned().collect();
        if !snapshot
            .versions
            .iter()
            .any(|v| Some(&v.value) == query.version.as_ref())
        {
            if let Some(v) = version_list
                .iter()
                .find(|v| Some(&v.value) == query.version.as_ref())
            {
                snapshot.versions.push(v.clone());
            }
        }
    }
    let position = query.lane.as_deref().unwrap_or("all");
    match query.mode {
        Mode::Rift => {
            let mut selected = query.version.clone().unwrap();
            for attempt in 0..2 {
                snapshot.rows.clear();
                snapshot.stats_date = None;
                let api_lane = if position == "mid" {
                    "MIDDLE".into()
                } else {
                    position.to_ascii_uppercase()
                };
                let params = format!(
                    "itier={}&version_id={selected}&lane={api_lane}&sort_metric=1&sort_order=2",
                    query.tier.unwrap()
                );
                let raw = payload("lol_101strategy", &params).await?;
                if let Some(raw) = raw {
                    snapshot.rows = parse_rows(Mode::Rift, &raw, &catalog, None)?;
                    snapshot.stats_date = date(&raw)?;
                    if !snapshot.rows.is_empty() {
                        snapshot.version = Some(selected.clone());
                        break;
                    }
                }
                if attempt == 0 && implicit_version && version_list.len() > 1 {
                    selected = version_list[1].value.clone();
                    snapshot.version = Some(selected.clone());
                    snapshot
                        .warnings
                        .push(format!("最新版本暂无榜单，已显示官网上一版本 {selected}"));
                } else {
                    break;
                }
            }
        }
        Mode::Aram => {
            for days_ago in 1..=5 {
                let date = hextech::date_ago(days_ago);
                if let Some(raw) =
                    payload("aram_hero_overview", &format!("dtstatdate={date}")).await?
                {
                    snapshot.rows = parse_rows(Mode::Aram, &raw, &catalog, None)?;
                    if !snapshot.rows.is_empty() {
                        if days_ago > 1 {
                            snapshot
                                .warnings
                                .push(format!("最新统计尚未发布，已读取最近可用统计日 {date}"));
                        }
                        snapshot.stats_date = Some(date);
                        break;
                    }
                }
            }
        }
        Mode::Classic => {
            let api_lane = if position == "mid" {
                "middle"
            } else {
                position
            };
            let lanes = payload("jade_hero_lane", "itype=255").await;
            let lane_data = match &lanes {
                Ok(Some(v)) => Some(v),
                _ => {
                    snapshot.warnings.push("经典模式位置资料暂不可用".into());
                    None
                }
            };
            for attempt in 0..=5 {
                snapshot.rows.clear();
                snapshot.stats_date = None;
                let mut params = format!("lane={api_lane}&itier=255");
                if attempt > 0 {
                    params.push_str(&format!("&day={}", hextech::date_ago(attempt)));
                }
                if let Some(raw) = payload("jade_hero_rank", &params).await? {
                    snapshot.rows = parse_rows(Mode::Classic, &raw, &catalog, lane_data)?;
                    snapshot.stats_date = date(&raw)?;
                    if !snapshot.rows.is_empty() {
                        if attempt > 0 {
                            snapshot
                                .warnings
                                .push("官网当日榜单尚未发布，已读取最近可用统计日".into());
                        }
                        break;
                    }
                }
            }
        }
    }
    if snapshot
        .rows
        .iter()
        .any(|r| !catalog.contains_key(&r.hero.hero_id))
    {
        snapshot
            .warnings
            .push("部分英雄资料暂缺，已保留官方英雄编号".into());
    }
    if !snapshot.rows.is_empty() && snapshot.stats_date.is_none() {
        return Err("官网未返回统计日期".into());
    }
    if snapshot.rows.is_empty() {
        snapshot
            .warnings
            .push("官网暂无该筛选条件的榜单数据".into());
    }
    // Keep combinations independent; failed and empty responses remain retryable.
    if !snapshot.rows.is_empty() && snapshot.warnings.is_empty() {
        let mut cache = cache().lock().await;
        if cache.snapshots.len() >= 32 {
            if let Some(oldest) = cache
                .snapshots
                .iter()
                .min_by_key(|(_, e)| e.at)
                .map(|(k, _)| k.clone())
            {
                cache.snapshots.remove(&oldest);
            }
        }
        cache.snapshots.insert(
            key,
            Entry {
                at: Instant::now(),
                value: snapshot.clone(),
            },
        );
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Value, HashMap<u32, Value>, HashMap<u32, Value>) {
        let v: Value =
            serde_json::from_str(include_str!("../../test/fixtures/official-rankings.json"))
                .unwrap();
        let map = |key: &str| {
            v[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| (text(r, "heroId").parse().unwrap(), r.clone()))
                .collect()
        };
        let modern = map("modern");
        let jade = map("jade");
        (v, modern, jade)
    }
    fn query(mode: Mode) -> Query {
        Query {
            mode,
            lane: None,
            tier: None,
            version: None,
        }
    }
    #[test]
    fn rift_keeps_each_hero_lane_and_percent_units_from_official_data() {
        let (v, modern, _) = fixture();
        let rows = parse_rows(Mode::Rift, &v["rift"], &modern, None).unwrap();
        assert_eq!(rows.len(), 218);
        assert_eq!(
            rows.iter()
                .map(|r| r.key.clone())
                .collect::<HashSet<_>>()
                .len(),
            218
        );
        let first = &rows[0];
        assert_eq!(first.hero.hero_id, 114);
        assert_eq!(first.lane.as_deref(), Some("top"));
        assert_eq!(first.tier.as_deref(), Some("T1"));
        assert_eq!(first.win_rate, 52.46);
        assert_eq!(first.pick_rate, 4.79);
        assert_eq!(first.ban_rate, Some(6.4));
        assert_eq!(
            first.counters.iter().map(|r| r.hero_id).collect::<Vec<_>>(),
            [19, 106, 85]
        );
        assert!(rows.iter().filter(|r| r.hero.hero_id == 112).count() > 1);
        let top = parse_rows(Mode::Rift, &v["riftTop"], &modern, None).unwrap();
        assert_eq!(top.len(), 50);
        assert!(top.iter().all(|r| r.lane.as_deref() == Some("top")));
        assert_eq!(
            date(&v["riftPrevious"]).unwrap().as_deref(),
            Some("20261011")
        );
    }
    #[test]
    fn aram_reads_fractional_rates_without_inventing_tiers_or_bans() {
        let (v, modern, _) = fixture();
        let rows = parse_rows(Mode::Aram, &v["aram"], &modern, None).unwrap();
        assert_eq!(rows.len(), 173);
        let first = &rows[0];
        assert_eq!(first.hero.hero_id, 22);
        assert_eq!(first.hero.name, "寒冰射手");
        assert!((first.win_rate - 53.77).abs() < 0.000001);
        assert!((first.pick_rate - 14.2).abs() < 0.000001);
        assert!(first.tier.is_none());
        assert!(first.ban_rate.is_none());
        assert!(first.lane.is_none());
        assert!(first.hero.roles.contains(&"marksman".into()));
    }
    #[test]
    fn classic_uses_its_own_60000_ids_names_images_and_server_lane_rankings() {
        let (v, _, jade) = fixture();
        let rows = parse_rows(Mode::Classic, &v["classic"], &jade, Some(&v["lanes"])).unwrap();
        assert_eq!(rows.len(), 77);
        let first = &rows[0];
        assert_eq!(first.hero.hero_id, 60011);
        assert_eq!(first.hero.name, "易");
        assert_eq!(first.hero.title, "无极剑圣");
        assert_eq!(first.tier.as_deref(), Some("T0"));
        assert_eq!(first.win_rate, 49.24);
        assert_eq!(first.pick_rate, 46.03);
        assert_eq!(first.ban_rate, Some(26.13));
        assert!(first.hero.icon_path.is_none());
        assert!(first
            .hero
            .icon_url
            .as_deref()
            .unwrap()
            .ends_with("jade/championsHeadICON/60011.png"));
        assert!(first.lanes.contains(&"jungle".into()));
        let top = parse_rows(Mode::Classic, &v["classicTop"], &jade, Some(&v["lanes"])).unwrap();
        assert_eq!(top.len(), 30);
        assert_eq!(top[0].hero.hero_id, 60114);
        assert_eq!(top[0].win_rate, 52.32);
    }
    #[test]
    fn official_versions_are_dynamic_and_filters_remain_mode_specific() {
        let (v, _, _) = fixture();
        let versions = parse_versions(&v["versions"]).unwrap();
        assert_eq!(
            versions
                .iter()
                .map(|o| o.value.as_str())
                .collect::<Vec<_>>(),
            ["16.20", "16.19"]
        );
        let rift = normalize(query(Mode::Rift)).unwrap();
        assert_eq!(rift.tier, Some(26));
        assert_eq!(rift.lane.as_deref(), Some("all"));
        let mut invalid = query(Mode::Classic);
        invalid.tier = Some(26);
        assert!(normalize(invalid).is_err());
        let mut invalid = query(Mode::Aram);
        invalid.lane = Some("top".into());
        assert!(normalize(invalid).is_err());
        let mut invalid = query(Mode::Rift);
        invalid.version = Some("16.20&itier=255".into());
        assert!(normalize(invalid).is_err());
        let mut invalid = query(Mode::Rift);
        invalid.tier = Some(999);
        assert!(normalize(invalid).is_err());
    }
    #[test]
    fn changed_schemas_duplicates_and_impossible_percentages_fail_explicitly() {
        let (v, modern, _) = fixture();
        assert!(parse_rows(Mode::Rift, &serde_json::json!({}), &modern, None).is_err());
        let first = v["rift"]["datadetails"]
            .as_str()
            .unwrap()
            .split('#')
            .next()
            .unwrap();
        assert!(parse_rows(
            Mode::Rift,
            &serde_json::json!({"datadetails":format!("{first}#{first}")}),
            &modern,
            None
        )
        .is_err());
        assert!(percent("NaN", 1.0).is_err());
        assert!(percent("-1", 1.0).is_err());
        assert!(percent("1.01", 100.0).is_err());
        assert!(decode(&serde_json::json!({"code":0,"data":{"result":""}}))
            .unwrap()
            .is_none());
        assert!(decode(&serde_json::json!({"code":1,"data":{"result":"{}"}})).is_err());
        assert!(decode(&serde_json::json!({"code":0,"data":{"result":"broken"}})).is_err());
        assert_eq!(
            new_snapshot(&normalize(query(Mode::Rift)).unwrap())
                .tiers
                .len(),
            17
        );
    }
    #[tokio::test]
    #[ignore = "requires live Tencent official APIs"]
    async fn live_three_mode_rankings() {
        let mut results = vec![];
        for mode in [Mode::Rift, Mode::Aram, Mode::Classic] {
            let snapshot = get_ranking(query(mode), true).await.unwrap();
            assert!(!snapshot.rows.is_empty());
            assert!(snapshot.stats_date.is_some());
            if mode == Mode::Rift {
                assert_eq!(snapshot.tier, Some(26));
                assert!(snapshot.versions.len() >= 2);
                assert_eq!(snapshot.tiers.len(), 17);
            }
            if mode == Mode::Classic {
                assert!(snapshot.rows.iter().all(|r| r.hero.hero_id >= 60000));
            }
            results.push(snapshot);
        }
        for (mode, lane, tier, version) in [
            (Mode::Rift, "top", Some(26), None),
            (Mode::Classic, "top", None, None),
            (Mode::Rift, "jungle", Some(255), Some("16.19".to_string())),
        ] {
            let snapshot = get_ranking(
                Query {
                    mode,
                    lane: Some(lane.into()),
                    tier,
                    version,
                },
                false,
            )
            .await
            .unwrap();
            assert!(!snapshot.rows.is_empty());
            assert_eq!(snapshot.lane, lane);
            if mode == Mode::Rift {
                assert!(snapshot
                    .rows
                    .iter()
                    .all(|r| r.lane.as_deref() == Some(lane)));
            }
            results.push(snapshot);
        }
        if let Ok(file) = std::env::var("RANKINGS_PROBE_OUTPUT") {
            std::fs::write(file, serde_json::to_vec_pretty(&results).unwrap()).unwrap();
        }
    }
}
