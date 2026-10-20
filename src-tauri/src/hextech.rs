use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

const API: &str = "https://mlol.qt.qq.com/go/battle_info/odp_proxy/";
const CDN: &str = "https://game.gtimg.cn/images/lol/act/img/";
const TTL: Duration = Duration::from_secs(15 * 60);
const RANK_PENDING: &str = "官网尚未发布该日英雄榜";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub icon_path: Option<String>,
    pub icon_url: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hero {
    #[serde(flatten)]
    pub asset: Asset,
    pub title: String,
    pub roles: Vec<String>,
    pub rank: u32,
    pub tier: String,
    pub win_rate: f64,
    pub pick_rate: f64,
    pub pick_change: Option<f64>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ranking {
    pub stats_date: String,
    pub heroes: Vec<Hero>,
    pub warnings: Vec<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rune {
    #[serde(flatten)]
    pub asset: Asset,
    pub quality: String,
    pub strength: Option<String>,
    pub rank: u32,
    pub pick_rate: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPlan {
    pub id: String,
    pub order: Vec<String>,
    pub pick_rate: f64,
    pub win_rate: f64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPriority {
    pub id: String,
    pub order: Vec<String>,
    pub pick_rate: f64,
    pub win_rate: f64,
    pub plans: Vec<SkillPlan>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Equipment {
    pub id: u32,
    pub items: Vec<Asset>,
    pub pick_rate: f64,
    pub win_rate: f64,
}
#[derive(Clone, Serialize)]
pub struct EquipmentSection {
    pub key: String,
    pub title: String,
    pub rows: Vec<Equipment>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Partner {
    pub hero: Asset,
    pub title: String,
    pub roles: Vec<String>,
    pub rank: u32,
    pub pick_rate: f64,
    pub win_rate: f64,
}
#[derive(Clone, Serialize)]
pub struct Spell {
    #[serde(flatten)]
    pub asset: Asset,
    pub key: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub hero_id: u32,
    pub stats_date: String,
    pub hero: Option<Hero>,
    pub spells: Vec<Spell>,
    pub runes: Vec<Rune>,
    pub skills: Vec<SkillPriority>,
    pub equipment: Vec<EquipmentSection>,
    pub partners: Vec<Partner>,
    pub warnings: Vec<String>,
}
#[derive(Clone, Default)]
struct Catalog {
    heroes: HashMap<u32, Value>,
    augments: HashMap<u32, Value>,
    items: HashMap<u32, Value>,
    warnings: Vec<String>,
}
struct Cached<T> {
    at: SystemTime,
    value: T,
}
impl<T: Clone> Cached<T> {
    fn fresh(&self, ttl: Duration) -> Option<T> {
        (self.at.elapsed().unwrap_or(ttl) < ttl).then(|| self.value.clone())
    }
}
#[derive(Default)]
struct Cache {
    catalog: Option<Cached<Catalog>>,
    ranks: HashMap<String, Cached<Ranking>>,
    details: HashMap<u32, Cached<Detail>>,
}
fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
}
fn http() -> &'static Client {
    static HTTP: OnceLock<Client> = OnceLock::new();
    HTTP.get_or_init(|| {
        Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(18))
            .build()
            .expect("create official stats client")
    })
}
pub(crate) async fn fetch(url: impl AsRef<str>) -> Result<Value, String> {
    http()
        .get(url.as_ref())
        .header("Referer", "https://101.qq.com/")
        .send()
        .await
        .map_err(|e| format!("官网连接失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("官网请求失败：{e}"))?
        .json()
        .await
        .map_err(|e| format!("官网数据格式无效：{e}"))
}
fn unpack(value: &Value) -> Result<Value, String> {
    if value.get("code").and_then(Value::as_i64) != Some(0) {
        return Err("官网统计接口返回错误".into());
    }
    let result = value.pointer("/data/result").ok_or("官网未返回统计结果")?;
    if let Some(text) = result.as_str() {
        serde_json::from_str(text).map_err(|_| "官网统计结果无法解析".into())
    } else if result.is_object() {
        Ok(result.clone())
    } else {
        Err("官网统计结果结构已变化".into())
    }
}
async fn api(endpoint: &str, query: impl AsRef<str>) -> Result<Value, String> {
    unpack(&fetch(format!("{API}{endpoint}?{}", query.as_ref())).await?)
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
fn id(value: &Value, key: &str) -> Option<u32> {
    text(value, key).parse().ok()
}
fn nested(value: &Value, key: &str) -> Result<Value, String> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(Value::Null),
        Some(Value::String(s)) if s.trim().is_empty() || s == "-1" => Ok(Value::Null),
        Some(Value::String(s)) => {
            serde_json::from_str(s).map_err(|_| format!("官网 {key} 无法解析"))
        }
        Some(v) => Ok(v.clone()),
    }
}
fn rows(value: &Value) -> Vec<&Value> {
    match value {
        Value::Object(o) => o.values().collect(),
        Value::Array(a) => a.iter().collect(),
        _ => vec![],
    }
}
fn rate(raw: &str, divisor: f64) -> Result<f64, String> {
    let value = raw.parse::<f64>().map_err(|_| "官网比例字段无效")? / divisor;
    if !value.is_finite() || !(0.0..=100.0).contains(&value) {
        return Err("官网比例超出范围".into());
    }
    Ok(value)
}
fn fraction(raw: &str) -> Result<f64, String> {
    rate(raw, 0.01)
}
fn basis(value: &Value, key: &str) -> Result<f64, String> {
    rate(&text(value, key), 100.0)
}
fn plain(value: &str) -> String {
    static TAGS: OnceLock<regex::Regex> = OnceLock::new();
    let value = value
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n");
    TAGS.get_or_init(|| regex::Regex::new("<[^>]*>").unwrap())
        .replace_all(&value, "")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}
fn fallback(id: u32, kind: &str) -> Asset {
    Asset {
        id,
        name: format!("{kind} #{id}"),
        description: String::new(),
        icon_path: None,
        icon_url: None,
    }
}
fn roles(value: &Value) -> Vec<String> {
    value
        .get("roles")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}
fn hero_asset(catalog: &Catalog, id: u32) -> Asset {
    let mut asset = fallback(id, "英雄");
    asset.icon_path = Some(format!("/lol-game-data/assets/v1/champion-icons/{id}.png"));
    if let Some(raw) = catalog.heroes.get(&id) {
        asset.name = text(raw, "name");
        asset.icon_url = Some(format!("{CDN}champion/{}.png", text(raw, "alias")));
    }
    asset
}
fn item_asset(catalog: &Catalog, id: u32) -> Asset {
    let mut asset = fallback(id, "装备");
    asset.icon_path = Some(format!("/lol-game-data/assets/v1/item-icons/{id}.png"));
    asset.icon_url = Some(format!("{CDN}item/{id}.png"));
    if let Some(raw) = catalog.items.get(&id) {
        asset.name = text(raw, "name");
        asset.description = plain(&text(raw, "description"));
    }
    asset
}
async fn catalog(force: bool) -> Result<Catalog, String> {
    if !force {
        if let Some(value) = cache()
            .lock()
            .await
            .catalog
            .as_ref()
            .and_then(|c| c.fresh(Duration::from_secs(6 * 3600)))
        {
            return Ok(value);
        }
    }
    let (heroes, augments, items) = tokio::join!(
        fetch(format!("{CDN}js/heroList/hero_list.js")),
        fetch(format!("{CDN}js/kiwi/kiwi_augments.json")),
        fetch(format!("{CDN}js/items/items.js"))
    );
    let heroes = heroes?;
    let mut result = Catalog::default();
    for raw in heroes
        .get("hero")
        .and_then(Value::as_array)
        .ok_or("官网英雄资料格式已变化")?
    {
        if let Some(id) = id(raw, "heroId") {
            result.heroes.insert(id, raw.clone());
        }
    }
    match augments {
        Ok(v) => {
            for raw in v.as_array().ok_or("官网符文资料格式已变化")? {
                if let Some(id) = id(raw, "augmentID") {
                    result.augments.insert(id, raw.clone());
                }
            }
        }
        Err(e) => result
            .warnings
            .push(format!("符文名称与图标暂时不可用：{e}")),
    }
    match items {
        Ok(v) => {
            for raw in v
                .get("items")
                .and_then(Value::as_array)
                .ok_or("官网装备资料格式已变化")?
            {
                if let Some(id) = id(raw, "itemId") {
                    result.items.insert(id, raw.clone());
                }
            }
        }
        Err(e) => result.warnings.push(format!("装备资料暂时不可用：{e}")),
    }
    // Failed metadata remains retryable on the next request.
    if result.warnings.is_empty() {
        cache().lock().await.catalog = Some(Cached {
            at: SystemTime::now(),
            value: result.clone(),
        });
    }
    Ok(result)
}
// The official site takes the best tier across each hero's role pools.
fn tier(rank: usize, total: usize) -> u32 {
    [0.04, 0.15, 0.30, 0.40]
        .iter()
        .position(|p| rank <= ((total as f64 * p).round() as usize).max(1))
        .unwrap_or(4) as u32
}
fn parse_ranking(
    raw: &Value,
    catalog: &Catalog,
    date: &str,
    previous: Option<&Ranking>,
) -> Result<Ranking, String> {
    let packed = raw
        .get("listcollect")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or(RANK_PENDING)?;
    let mut heroes = vec![];
    for row in packed.split('#').filter(|r| !r.is_empty()) {
        let p: Vec<_> = row.split('_').collect();
        if p.len() < 5 {
            return Err("官网英雄榜字段已变化".into());
        }
        let id = p[0].parse().map_err(|_| "官网英雄编号无效")?;
        let raw = catalog.heroes.get(&id).unwrap_or(&Value::Null);
        let pick_rate = fraction(p[4])?;
        heroes.push(Hero {
            asset: hero_asset(catalog, id),
            title: text(raw, "title"),
            roles: roles(raw),
            rank: p[1].parse().map_err(|_| "官网英雄排名无效")?,
            tier: String::new(),
            win_rate: fraction(p[3])?,
            pick_rate,
            pick_change: previous
                .and_then(|r| r.heroes.iter().find(|h| h.asset.id == id))
                .map(|h| pick_rate - h.pick_rate),
        });
    }
    heroes.sort_by_key(|h| h.rank);
    let pools: Vec<_> = ["tank", "fighter", "mage", "assassin", "marksman", "support"]
        .iter()
        .map(|role| {
            heroes
                .iter()
                .filter(|h| h.roles.iter().any(|r| r == role))
                .map(|h| h.asset.id)
                .collect::<Vec<_>>()
        })
        .collect();
    let count = heroes.len();
    for h in &mut heroes {
        let grade = pools
            .iter()
            .filter_map(|pool| {
                pool.iter()
                    .position(|id| *id == h.asset.id)
                    .map(|i| tier(i + 1, pool.len()))
            })
            .min()
            .unwrap_or_else(|| tier(h.rank as usize, count));
        h.tier = format!("T{grade}");
    }
    Ok(Ranking {
        stats_date: date.into(),
        heroes,
        warnings: catalog.warnings.clone(),
    })
}
async fn ranking_for(date: &str, catalog: &Catalog, force: bool) -> Result<Ranking, String> {
    if !force {
        if let Some(r) = cache()
            .lock()
            .await
            .ranks
            .get(date)
            .and_then(|c| c.fresh(TTL))
        {
            return Ok(r);
        }
    }
    let outer = fetch(format!("{API}fuwen_aram_hero_rank_v2?dtstatdate={date}")).await?;
    let raw = ranking_payload(&outer)?;
    let result = parse_ranking(&raw, catalog, date, None)?;
    let mut cache = cache().lock().await;
    if cache.ranks.len() >= 4 {
        cache.ranks.clear();
    }
    if result.warnings.is_empty() {
        cache.ranks.insert(
            date.into(),
            Cached {
                at: SystemTime::now(),
                value: result.clone(),
            },
        );
    }
    Ok(result)
}
pub(crate) fn date_ago(days: i64) -> String {
    // Gregorian civil date from Unix days, using the site's China time zone.
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    date_from_days((seconds + 8 * 3600) / 86400 - days)
}
fn date_from_days(days: i64) -> String {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    y += if m <= 2 { 1 } else { 0 };
    format!("{y:04}{m:02}{d:02}")
}
fn ranking_payload(outer: &Value) -> Result<Value, String> {
    if outer.get("code").and_then(Value::as_i64) == Some(0)
        && outer
            .pointer("/data/result")
            .and_then(Value::as_str)
            .is_some_and(|s| s.trim().is_empty())
    {
        return Err(RANK_PENDING.into());
    }
    unpack(outer)
}
fn previous_date(date: &str) -> Option<String> {
    if date.len() != 8 || !date.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let mut year = date[..4].parse::<i64>().ok()?;
    let month = date[4..6].parse::<i64>().ok()?;
    let day = date[6..].parse::<i64>().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    year -= if month <= 2 { 1 } else { 0 };
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
    (date_from_days(days) == date).then(|| date_from_days(days - 1))
}
pub async fn get_ranking(force: bool) -> Result<Ranking, String> {
    let catalog = catalog(force).await?;
    let mut latest = None;
    // Empty results at midnight mean unpublished data, not a transport failure.
    for days_ago in 1..=5 {
        match ranking_for(&date_ago(days_ago), &catalog, force).await {
            Ok(current) => {
                latest = Some((current, days_ago));
                break;
            }
            Err(error) if error == RANK_PENDING => continue,
            Err(error) => return Err(error),
        }
    }
    let (mut current, days_ago) = latest.ok_or(RANK_PENDING)?;
    if days_ago > 1 {
        current.warnings.push(format!(
            "最新统计尚未发布，已读取最近可用统计日 {}",
            current.stats_date
        ));
    }
    match ranking_for(&date_ago(days_ago + 1), &catalog, force).await {
        Ok(prev) => {
            for h in &mut current.heroes {
                h.pick_change = prev
                    .heroes
                    .iter()
                    .find(|p| p.asset.id == h.asset.id)
                    .map(|p| h.pick_rate - p.pick_rate);
            }
        }
        Err(_) => current
            .warnings
            .push("前一日榜单暂不可用，登场率变化未提供".into()),
    }
    Ok(current)
}
fn keys(raw: &str) -> Result<Vec<String>, String> {
    raw.split('&')
        .filter(|s| !s.is_empty())
        .map(|s| match s {
            "1" => Ok("Q".into()),
            "2" => Ok("W".into()),
            "3" => Ok("E".into()),
            "4" => Ok("R".into()),
            _ => Err("官网技能顺序编码已变化".into()),
        })
        .collect()
}
fn parse_detail(raw: &Value, hero_id: u32, catalog: &Catalog) -> Result<Detail, String> {
    let stats_date = text(raw, "dtstatdate");
    if stats_date.len() != 8 || !stats_date.bytes().all(|b| b.is_ascii_digit()) {
        return Err("官网尚未提供英雄详情统计日期".into());
    }
    let mut warnings = catalog.warnings.clone();
    let packed = text(raw, "augment_json_irank");
    let packed = if packed.is_empty() {
        text(raw, "augment_json")
    } else {
        packed
    };
    let mut all = HashMap::new();
    let mut qualified = HashMap::new();
    for group in packed.split('&').filter(|s| !s.is_empty()) {
        let (quality, body) = group.split_once(':').ok_or("官网符文分组已变化")?;
        for row in body.split('#').filter(|s| !s.is_empty()) {
            let p: Vec<_> = row.split('|').collect();
            if p.len() < 5 {
                return Err("官网符文榜字段已变化".into());
            }
            if p[1].parse::<u32>().ok() != Some(hero_id) {
                return Err("官网返回了其他英雄的符文数据".into());
            }
            let augment_id = p[2].parse::<u32>().map_err(|_| "官网符文编号无效")?;
            let strength = p
                .get(5)
                .filter(|s| ["S", "A", "B", "C"].contains(s))
                .map(|s| s.to_string());
            let mut asset = fallback(augment_id, "符文");
            let mut metadata_quality = String::new();
            if let Some(meta) = catalog.augments.get(&augment_id) {
                asset.name = text(meta, "name_cn");
                asset.description = plain(&text(meta, "tooltip"));
                let url = text(meta, "small_Icon");
                if let Some(file) = url.rsplit('/').next().filter(|_| !url.is_empty()) {
                    asset.icon_path = Some(format!(
                        "/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/{file}"
                    ));
                    asset.icon_url = Some(url);
                }
                metadata_quality = text(meta, "level");
            }
            let rune = Rune {
                asset,
                quality: if quality == "255" {
                    metadata_quality
                } else {
                    quality.into()
                },
                strength,
                rank: p[0].parse().map_err(|_| "官网符文排名无效")?,
                pick_rate: fraction(p[4])?,
            };
            if quality == "255" {
                all.insert(augment_id, rune);
            } else {
                qualified.insert(augment_id, rune);
            }
        }
    }
    // 255 is the full list; rarity groups fill quality without replacing its grade/rank.
    if all.is_empty() {
        all = qualified;
    } else {
        for (id, rune) in qualified {
            if let Some(item) = all.get_mut(&id) {
                item.quality = rune.quality;
            }
        }
    }
    let mut runes: Vec<_> = all.into_values().collect();
    runes.sort_by_key(|r| r.rank);
    if runes.is_empty() {
        warnings.push("官网暂无该英雄的符文数据".into());
    }
    if runes.iter().any(|r| r.strength.is_none()) {
        warnings.push("部分符文强度未提供".into());
    }
    let skill_json = nested(raw, "skill_json")?;
    let mut skills = vec![];
    if let Some(groups) = skill_json.as_object() {
        for (id, group) in groups {
            let mut plans = vec![];
            if let Some(raw_plans) = group.get("sks").and_then(Value::as_object) {
                for (id, p) in raw_plans {
                    plans.push(SkillPlan {
                        id: id.clone(),
                        order: keys(&text(p, "sk"))?,
                        pick_rate: basis(p, "sk_s")?,
                        win_rate: basis(p, "sk_w")?,
                    });
                }
            }
            skills.push(SkillPriority {
                id: id.clone(),
                order: keys(&text(group, "qwe"))?,
                pick_rate: basis(group, "qwe_s")?,
                win_rate: basis(group, "qwe_w")?,
                plans,
            });
        }
    }
    let mut equipment = vec![];
    for (key, title, field, basis_points) in [
        ("starting", "出门装", "itemout", false),
        ("shoes", "鞋", "itemshoes", false),
        ("core", "优先成装", "itemcore_json", true),
        ("remain", "其余成装", "itemone_json", true),
    ] {
        let mut items = vec![];
        if basis_points {
            let v = nested(raw, field)?;
            for (i, row) in rows(&v).iter().enumerate() {
                let ids = text(row, if key == "core" { "itemcore" } else { "itemone" });
                let assets = ids
                    .split(['&', ','])
                    .map(|id| id.parse::<u32>().map(|id| item_asset(catalog, id)))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| "官网装备编号无效")?;
                items.push(Equipment {
                    id: i as u32 + 1,
                    items: assets,
                    pick_rate: basis(row, "showrate")?,
                    win_rate: basis(row, "winrate")?,
                });
            }
        } else {
            let packed = text(raw, field);
            for (i, row) in packed
                .split('#')
                .filter(|s| !s.is_empty() && *s != "-1")
                .enumerate()
            {
                let p: Vec<_> = row.split('$').collect();
                if p.len() != 3 {
                    return Err("官网装备字段已变化".into());
                }
                let assets = p[0]
                    .split(',')
                    .map(|id| id.parse::<u32>().map(|id| item_asset(catalog, id)))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| "官网装备编号无效")?;
                items.push(Equipment {
                    id: i as u32 + 1,
                    items: assets,
                    pick_rate: fraction(p[1])?,
                    win_rate: fraction(p[2])?,
                });
            }
        }
        equipment.push(EquipmentSection {
            key: key.into(),
            title: title.into(),
            rows: items,
        });
    }
    let mut partners = vec![];
    for row in text(raw, "championid_json")
        .split('#')
        .filter(|s| !s.is_empty() && *s != "-1")
    {
        let p: Vec<_> = row.split('|').collect();
        if p.len() != 4 {
            return Err("官网最佳拍档字段已变化".into());
        }
        let id = p[0].parse().map_err(|_| "官网搭档编号无效")?;
        let meta = catalog.heroes.get(&id).unwrap_or(&Value::Null);
        partners.push(Partner {
            hero: hero_asset(catalog, id),
            title: text(meta, "title"),
            roles: roles(meta),
            rank: p[3].parse().map_err(|_| "官网搭档排名无效")?,
            win_rate: fraction(p[1])?,
            pick_rate: fraction(p[2])?,
        });
    }
    Ok(Detail {
        hero_id,
        stats_date,
        hero: None,
        spells: vec![],
        runes,
        skills,
        equipment,
        partners,
        warnings,
    })
}
fn parse_spells(raw: &Value) -> Vec<Spell> {
    let mut spells = vec![];
    for (i, key) in ["passive", "q", "w", "e", "r"].iter().enumerate() {
        if let Some(s) = raw
            .get("spells")
            .and_then(Value::as_array)
            .and_then(|a| a.iter().find(|v| text(v, "spellKey") == *key))
        {
            spells.push(Spell {
                key: if *key == "passive" {
                    "P".into()
                } else {
                    key.to_uppercase()
                },
                asset: Asset {
                    id: i as u32,
                    name: text(s, "name"),
                    description: plain(&text(s, "description")),
                    icon_path: None,
                    icon_url: Some(text(s, "abilityIconPath")),
                },
            });
        }
    }
    spells
}
pub async fn get_detail(hero_id: u32, force: bool) -> Result<Detail, String> {
    if hero_id == 0 || hero_id > 100000 {
        return Err("英雄编号无效".into());
    }
    if !force {
        if let Some(d) = cache()
            .lock()
            .await
            .details
            .get(&hero_id)
            .and_then(|c| c.fresh(TTL))
        {
            return Ok(d);
        }
    }
    let (catalog, raw, spells) = tokio::join!(
        catalog(force),
        api("fuwen_hero_rank", format!("championid={hero_id}")),
        fetch(format!("{CDN}js/hero/{hero_id}.js"))
    );
    let catalog = catalog?;
    let mut detail = parse_detail(&raw?, hero_id, &catalog)?;
    let previous_date = previous_date(&detail.stats_date).ok_or("官网统计日期无效")?;
    let (rank, prev) = tokio::join!(
        ranking_for(&detail.stats_date, &catalog, force),
        ranking_for(&previous_date, &catalog, false)
    );
    match rank {
        Ok(rank) => {
            detail.hero = rank.heroes.into_iter().find(|h| h.asset.id == hero_id);
            if let Some(hero) = detail.hero.as_mut() {
                if let Ok(prev) = prev {
                    if prev.stats_date == previous_date {
                        hero.pick_change = prev
                            .heroes
                            .iter()
                            .find(|h| h.asset.id == hero_id)
                            .map(|h| hero.pick_rate - h.pick_rate);
                    }
                }
            }
            if detail.hero.is_none() {
                detail.warnings.push("英雄概览暂无统计".into());
            }
        }
        Err(e) => detail.warnings.push(format!("英雄概览暂不可用：{e}")),
    }
    match spells {
        Ok(raw) => detail.spells = parse_spells(&raw),
        Err(e) => detail.warnings.push(format!("技能资料暂不可用：{e}")),
    }
    let mut cache = cache().lock().await;
    if cache.details.len() >= 24 {
        if let Some(id) = cache
            .details
            .iter()
            .min_by_key(|(_, c)| c.at)
            .map(|(id, _)| *id)
        {
            cache.details.remove(&id);
        }
    }
    // Partial responses stay retryable rather than hiding a recovered section for 15 minutes.
    if detail.warnings.is_empty() {
        cache.details.insert(
            hero_id,
            Cached {
                at: SystemTime::now(),
                value: detail.clone(),
            },
        );
    }
    Ok(detail)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Value, Catalog) {
        let value: Value =
            serde_json::from_str(include_str!("../../test/fixtures/hextech-official.json"))
                .unwrap();
        let mut catalog = Catalog::default();
        for raw in value["heroes"].as_array().unwrap() {
            catalog
                .heroes
                .insert(id(raw, "heroId").unwrap(), raw.clone());
        }
        for raw in value["augments"].as_array().unwrap() {
            catalog
                .augments
                .insert(id(raw, "augmentID").unwrap(), raw.clone());
        }
        for raw in value["items"].as_array().unwrap() {
            catalog
                .items
                .insert(id(raw, "itemId").unwrap(), raw.clone());
        }
        (value, catalog)
    }
    fn near(a: f64, b: f64) {
        assert!((a - b).abs() < 0.000001, "{a} != {b}");
    }
    #[test]
    fn full_rune_list_preserves_official_grades_and_rarity_independently() {
        let (value, catalog) = fixture();
        let d = parse_detail(&value["detail"], 120, &catalog).unwrap();
        assert_eq!(d.stats_date, "20261019");
        assert_eq!(d.runes.len(), 128);
        for (quality, count) in [("kSilver", 37), ("kGold", 44), ("kPrismatic", 47)] {
            assert_eq!(
                d.runes.iter().filter(|r| r.quality == quality).count(),
                count
            );
        }
        let first = &d.runes[0];
        assert_eq!(first.asset.id, 1029);
        assert_eq!(first.asset.name, "虚幻武器");
        assert_eq!(first.strength.as_deref(), Some("S"));
        assert_eq!(first.quality, "kGold");
        near(first.pick_rate, 24.65);
        let recursion = d.runes.iter().find(|r| r.asset.id == 1068).unwrap();
        assert_eq!(recursion.asset.name, "循环往复");
        assert!(recursion
            .asset
            .icon_path
            .as_deref()
            .unwrap()
            .ends_with("recursion_small.png"));
        assert!(serde_json::to_value(first)
            .unwrap()
            .get("winRate")
            .is_none());
    }
    #[test]
    fn mixed_percent_encodings_and_detail_partners_match_official_page() {
        let (value, catalog) = fixture();
        let d = parse_detail(&value["detail"], 120, &catalog).unwrap();
        let skill = d
            .skills
            .iter()
            .find(|s| s.order == ["Q", "E", "W"])
            .unwrap();
        near(skill.pick_rate, 36.97);
        near(skill.win_rate, 50.81);
        let plan = skill.plans.iter().find(|p| p.id == "1").unwrap();
        assert_eq!(plan.order.len(), 15);
        near(plan.pick_rate, 12.62);
        near(plan.win_rate, 50.74);
        near(d.equipment[0].rows[0].pick_rate, 6.64);
        near(d.equipment[0].rows[0].win_rate, 61.35);
        let core = d.equipment[2]
            .rows
            .iter()
            .find(|r| r.items.iter().map(|a| a.id).collect::<Vec<_>>() == [3161, 3004, 6333])
            .unwrap();
        near(core.win_rate, 54.43);
        near(core.pick_rate, 14.03);
        assert_eq!(d.partners.len(), 5);
        assert_eq!(d.partners[0].hero.id, 910);
        near(d.partners[0].win_rate, 63.29);
        near(d.partners[0].pick_rate, 1.42);
        assert_eq!(d.partners[4].hero.id, 887);
    }
    #[test]
    fn overview_and_spell_order_are_parsed_from_their_own_sources() {
        let (value, catalog) = fixture();
        let rank = parse_ranking(&value["ranking"], &catalog, "20261019", None).unwrap();
        let hero = rank.heroes.iter().find(|h| h.asset.id == 120).unwrap();
        assert_eq!(hero.rank, 1);
        assert_eq!(hero.tier, "T0");
        near(hero.win_rate, 55.78);
        near(hero.pick_rate, 11.78);
        assert!(hero.pick_change.is_none());
        let spells = parse_spells(&value);
        assert_eq!(
            spells.iter().map(|s| s.key.as_str()).collect::<Vec<_>>(),
            ["P", "Q", "W", "E", "R"]
        );
        assert_eq!(spells[1].asset.name, "暴走");
        assert_eq!(date_from_days(0), "19700101");
        assert_eq!(date_from_days(19782), "20240229");
    }
    #[test]
    fn missing_grades_stay_unknown_and_unknown_assets_keep_numeric_ids() {
        let (value, catalog) = fixture();
        let mut raw = value["detail"].clone();
        raw["augment_json_irank"] = Value::String("255:1|120|99999|255|0.1".into());
        let d = parse_detail(&raw, 120, &catalog).unwrap();
        assert_eq!(d.runes.len(), 1);
        assert_eq!(d.runes[0].asset.id, 99999);
        assert!(d.runes[0].strength.is_none());
        assert!(d.warnings.iter().any(|s| s.contains("强度")));
    }
    #[test]
    fn invalid_dates_wrong_heroes_and_out_of_range_rates_are_rejected() {
        let (value, catalog) = fixture();
        let mut raw = value["detail"].clone();
        raw["dtstatdate"] = Value::String("".into());
        assert!(parse_detail(&raw, 120, &catalog).is_err());
        assert!(parse_detail(&value["detail"], 22, &catalog).is_err());
        assert!(fraction("NaN").is_err());
        assert!(fraction("1.01").is_err());
        assert!(fraction("-1").is_err());
        assert!(unpack(&serde_json::json!({"code":1,"data":{"result":"{}"}})).is_err());
        assert!(unpack(&serde_json::json!({"code":0,"data":{"result":"broken"}})).is_err());
    }
    #[test]
    fn preceding_statistics_day_uses_the_response_date_across_midnight_and_leap_years() {
        assert_eq!(previous_date("20261019").as_deref(), Some("20261018"));
        assert_eq!(previous_date("20260301").as_deref(), Some("20260228"));
        assert_eq!(previous_date("20240301").as_deref(), Some("20240229"));
        assert_eq!(previous_date("20260101").as_deref(), Some("20251231"));
        assert!(previous_date("20260230").is_none());
        assert!(previous_date("invalid").is_none());
        assert_eq!(
            ranking_payload(&serde_json::json!({"code":0,"data":{"result":""}})).unwrap_err(),
            RANK_PENDING
        );
        assert_ne!(
            ranking_payload(&serde_json::json!({"code":1,"data":{"result":""}})).unwrap_err(),
            RANK_PENDING
        );
        assert_ne!(
            ranking_payload(&serde_json::json!({"code":0,"data":{"result":"broken"}})).unwrap_err(),
            RANK_PENDING
        );
    }
    #[tokio::test]
    #[ignore = "requires Tencent official APIs"]
    async fn live_official_hextech_contract() {
        let ranking = get_ranking(true).await.unwrap();
        assert!(ranking.heroes.len() > 100);
        let detail = get_detail(120, true).await.unwrap();
        assert!(!detail.runes.is_empty());
        assert_eq!(detail.equipment.len(), 4);
        assert!(!detail.skills.is_empty());
        assert!(!detail.partners.is_empty());
        assert!(detail.hero.is_some());
        assert_eq!(detail.spells.len(), 5);
        if let Ok(output) = std::env::var("HEXTECH_PROBE_OUTPUT") {
            std::fs::write(
                output,
                serde_json::to_vec_pretty(&serde_json::json!({"ranking":ranking,"detail":detail}))
                    .unwrap(),
            )
            .unwrap();
        }
    }
}
