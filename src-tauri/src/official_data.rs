use crate::models::now_ms;
use reqwest::Client;
use serde::Serialize;
use serde_json::{Map, Value};
use std::{collections::HashMap, time::Duration};

const VERSIONS_URL: &str = "https://ddragon.leagueoflegends.com/api/versions.json";
const DRAGON_CHAMPIONS_URL: &str =
    "https://ddragon.leagueoflegends.com/cdn/{patch}/data/zh_CN/champion.json";
const MAYHEM_CHAMPIONS_URL: &str = "https://arammayhem.com/data/v1/latest/champions.json";
const MAYHEM_AUGMENTS_URL: &str = "https://arammayhem.com/data/v1/latest/augments.json";
const MAYHEM_COMBOS_URL: &str = "https://arammayhem.com/data/v1/latest/combos.json";
const OFFICIAL_AUGMENTS_URL: &str = "https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsChampion {
    pub id: i64,
    pub icon_path: String,
    pub icon_url: String,
    #[serde(skip)]
    dragon_key: String,
    pub name: String,
    pub short_name: String,
    pub role: String,
    pub tier: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub ban_rate: Option<f64>,
    pub kda: Option<f64>,
    pub trend: String,
    pub color: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsAugment {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    pub name: String,
    pub description: String,
    pub win_rate: Option<f64>,
    pub pick_rate: Option<f64>,
    pub sample_size: Option<u64>,
    pub tier: String,
    pub color: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsCombo {
    pub champion_id: i64,
    pub augment_ids: Vec<String>,
    pub types: Vec<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsDataSnapshot {
    pub champions: Vec<NewsChampion>,
    pub augments: Vec<NewsAugment>,
    pub combos: Vec<NewsCombo>,
    pub meta: NewsDataMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsDataMeta {
    pub patch: Option<String>,
    pub updated_at_ms: u64,
    pub official_source: String,
    pub stats_source: Option<String>,
    pub warnings: Vec<String>,
    pub source: String,
}

pub async fn get_news_data() -> Result<NewsDataSnapshot, String> {
    let http = Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(12))
        // Public game data should not inherit the sandbox's dead loopback proxy.
        .no_proxy()
        .user_agent("lol-skin-assistant/0.2 (+Riot Data Dragon)")
        .build()
        .map_err(|error| format!("无法创建官方数据连接: {error}"))?;

    let mut warnings =
        vec!["Riot 官方公开接口未提供海克斯胜率，胜率字段不会被推测或填充。".to_string()];
    let mut patch = None;
    let mut champions = Vec::new();

    match fetch_json(&http, VERSIONS_URL).await {
        Ok(versions) => {
            let current_patch = versions
                .as_array()
                .and_then(|values| values.first())
                .and_then(Value::as_str)
                .map(str::to_string);
            match current_patch {
                Some(current_patch) => {
                    let champion_url = DRAGON_CHAMPIONS_URL.replace("{patch}", &current_patch);
                    patch = Some(current_patch);
                    match fetch_json(&http, &champion_url).await {
                        Ok(champion_data) => match parse_dragon_champions(&champion_data) {
                            Ok(parsed) => champions = parsed,
                            Err(error) => warnings.push(error),
                        },
                        Err(error) => warnings.push(format!("Riot 英雄资料暂时无法读取: {error}")),
                    }
                }
                None => warnings.push("Riot Data Dragon 未返回有效版本".to_string()),
            }
        }
        Err(error) => warnings.push(format!("Riot Data Dragon 暂时无法连接: {error}")),
    }

    let mut augments = Vec::new();
    let mut combos = Vec::new();
    let mut stats_source = None;

    let (mayhem_champions, mayhem_augments, mayhem_combos, official_augments) = tokio::join!(
        fetch_json(&http, MAYHEM_CHAMPIONS_URL),
        fetch_json(&http, MAYHEM_AUGMENTS_URL),
        fetch_json(&http, MAYHEM_COMBOS_URL),
        fetch_json(&http, OFFICIAL_AUGMENTS_URL),
    );

    match mayhem_champions {
        Ok(value) => {
            merge_mayhem_champion_rates(&mut champions, &value);
            stats_source = Some("ARAM Mayhem（第三方有限样本）".to_string());
        }
        Err(error) => warnings.push(format!("海克斯大乱斗英雄选取率暂时无法读取: {error}")),
    }
    match mayhem_augments {
        Ok(value) => {
            augments = parse_mayhem_augments(&value);
            if stats_source.is_none() {
                stats_source = Some("ARAM Mayhem（第三方有限样本）".to_string());
            }
        }
        Err(error) => warnings.push(format!("海克斯选取率暂时无法读取: {error}")),
    }
    match mayhem_combos {
        Ok(value) => combos = parse_mayhem_combos(&value, &champions),
        Err(error) => warnings.push(format!("英雄与海克斯组合暂时无法读取: {error}")),
    }

    if let Err(error) = &official_augments {
        warnings.push(format!("官网海克斯资料暂时无法读取: {error}"));
    }
    merge_augment_assets(&mut augments, None, official_augments.as_ref().ok());

    let has_stats = augments.iter().any(|augment| augment.pick_rate.is_some())
        || champions
            .iter()
            .any(|champion| champion.pick_rate.is_some());
    let source = if has_stats {
        "third-party"
    } else if !champions.is_empty() || !augments.is_empty() {
        "official"
    } else {
        "unavailable"
    };
    Ok(NewsDataSnapshot {
        champions,
        augments,
        combos,
        meta: NewsDataMeta {
            patch,
            updated_at_ms: now_ms(),
            official_source: "Riot Games Data Dragon".to_string(),
            stats_source,
            source: source.to_string(),
            warnings,
        },
    })
}

async fn fetch_json(http: &Client, url: &str) -> Result<Value, String> {
    let response = http
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("网络请求失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("响应不是有效 JSON: {error}"))
}

fn parse_dragon_champions(value: &Value) -> Result<Vec<NewsChampion>, String> {
    let data = value
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "Riot Data Dragon 英雄数据结构无法识别".to_string())?;
    let colors = ["#7bcfb0", "#8f9ee9", "#d99bca", "#e0b476", "#8eb7d9"];
    let mut champions = data
        .values()
        .filter_map(|raw| {
            let raw = raw.as_object()?;
            let id = text(raw, &["key", "id"]).and_then(|value| value.parse::<i64>().ok())?;
            let name = text(raw, &["name"])?;
            let tags = raw
                .get("tags")
                .and_then(Value::as_array)
                .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>())
                .unwrap_or_default();
            Some(NewsChampion {
                id,
                icon_path: format!("/lol-game-data/assets/v1/champion-icons/{id}.png"),
                icon_url: format!("https://game.gtimg.cn/images/lol/act/img/champion/{}.png", text(raw, &["id"])?),
                dragon_key: text(raw, &["id"]).unwrap_or_default(),
                short_name: name.chars().take(2).collect(),
                name,
                role: role_for_tags(&tags),
                tier: "—".to_string(),
                win_rate: None,
                pick_rate: None,
                ban_rate: None,
                kda: None,
                trend: "flat".to_string(),
                color: colors[id.unsigned_abs() as usize % colors.len()].to_string(),
                source: "official".to_string(),
            })
        })
        .collect::<Vec<_>>();
    champions.sort_by(|first, second| first.name.cmp(&second.name));
    Ok(champions)
}

fn merge_mayhem_champion_rates(champions: &mut [NewsChampion], value: &Value) {
    let rates = rows(value)
        .into_iter()
        .filter_map(|row| {
            let id = champion_id(row, champions)?;
            Some((id, number(row, &["pickRate", "pick_rate"])))
        })
        .collect::<HashMap<_, _>>();
    for champion in champions {
        if let Some(Some(rate)) = rates.get(&champion.id) {
            champion.pick_rate = Some(*rate);
            champion.source = "third-party".to_string();
        }
    }
}

fn parse_mayhem_augments(value: &Value) -> Vec<NewsAugment> {
    let colors = ["#d8af70", "#d58aba", "#8aa4e5", "#7fc6a5", "#8eb7d9"];
    let mut augments = rows(value)
        .into_iter()
        .filter_map(|row| {
            let id = text(row, &["augmentId", "augment_id", "id"])?;
            let name = localized_text(row, &["name_zh-CN", "name_zh_CN", "name", "displayName"])?;
            let rarity = text(row, &["rarity", "tier"]).unwrap_or_default();
            Some(NewsAugment {
                id,
                icon_path: None,
                icon_url: None,
                name,
                description: localized_text(row, &["description", "desc"]).unwrap_or_default(),
                win_rate: None,
                pick_rate: number(row, &["pickRate", "pick_rate"]),
                sample_size: integer(row, &["sampleSize", "sample_size", "games", "matches"]),
                tier: tier_for_rarity(&rarity),
                color: colors[hash_text(&rarity) % colors.len()].to_string(),
                source: "third-party".to_string(),
            })
        })
        .collect::<Vec<_>>();
    augments.sort_by(|first, second| {
        second
            .pick_rate
            .partial_cmp(&first.pick_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    augments
}

pub fn attach_client_augment_assets(news: &mut NewsDataSnapshot, catalog: &Value) {
    merge_augment_assets(&mut news.augments, Some(catalog), None);
    if news.meta.source == "unavailable" && !news.augments.is_empty() {
        news.meta.source = "official".to_string();
    }
}

fn asset_key(value: &str) -> String {
    value
        .trim_start_matches("ARAM_")
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn merge_augment_assets(
    augments: &mut Vec<NewsAugment>,
    local: Option<&Value>,
    official: Option<&Value>,
) {
    let strip_tags = regex::Regex::new(r"<[^>]*>").unwrap();
    // Match stable IDs first; translated names are only an exact normalized fallback.
    for (is_local, catalog) in [(false, official), (true, local)] {
        let Some(catalog) = catalog else { continue };
        for row in rows(catalog) {
            let Some(id) = text(row, &["augmentID", "id"]) else {
                continue;
            };
            let Some(name_id) = text(row, &["augmentNameId", "name_en"]) else {
                continue;
            };
            if is_local {
                if !name_id.starts_with("ARAM_") {
                    continue;
                }
            } else {
                let kiwi = text(row, &["mode"])
                    .is_some_and(|modes| modes.split(',').any(|mode| mode.trim() == "KIWI"));
                if !kiwi || integer(row, &["isPBE"]).unwrap_or(0) != 0 {
                    continue;
                }
            }
            let Some(name) = text(row, &["nameTRA", "name_cn"]) else {
                continue;
            };
            let id_key = asset_key(&name_id);
            let name_key = asset_key(&name);
            let found = augments.iter().position(|augment| {
                augment.id == id
                    || asset_key(&augment.id) == id_key
                    || asset_key(&augment.name) == name_key
            });
            let index = found.unwrap_or_else(|| {
                augments.push(NewsAugment {
                    id: id.clone(),
                    name: name.clone(),
                    description: String::new(),
                    icon_path: None,
                    icon_url: None,
                    win_rate: None,
                    pick_rate: None,
                    sample_size: None,
                    tier: "—".to_string(),
                    color: "#d8af70".to_string(),
                    source: "official".to_string(),
                });
                augments.len() - 1
            });
            let augment = &mut augments[index];
            if is_local {
                augment.icon_path = text(row, &["augmentSmallIconPath"])
                    .filter(|path| path.starts_with("/lol-game-data/assets/"));
            } else {
                augment.icon_url = text(row, &["small_Icon", "large_Icon"]);
                if let Some(description) = text(row, &["tooltip"]) {
                    augment.description = strip_tags
                        .replace_all(&description, " ")
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ");
                }
            }
            let rarity = text(row, &["rarity", "level"]).unwrap_or_default();
            augment.tier = tier_for_rarity(&rarity);
            augment.color = match augment.tier.as_str() {
                "S" => "#8aa4e5",
                "A" => "#d8af70",
                "B" => "#a0aeb8",
                _ => "#7fc6a5",
            }
            .to_string();
        }
    }
}

fn parse_mayhem_combos(value: &Value, champions: &[NewsChampion]) -> Vec<NewsCombo> {
    rows(value)
        .into_iter()
        .filter_map(|row| {
            let champion_id = champion_id(row, champions)?;
            let augment_ids = row
                .get("augmentIds")
                .or_else(|| row.get("augment_ids"))
                .and_then(Value::as_array)
                .map(|values| values.iter().filter_map(value_text).collect::<Vec<_>>())
                .unwrap_or_default();
            if augment_ids.is_empty() {
                return None;
            }
            Some(NewsCombo {
                champion_id,
                augment_ids,
                types: row
                    .get("types")
                    .and_then(Value::as_array)
                    .map(|values| values.iter().filter_map(value_text).collect())
                    .unwrap_or_default(),
                url: text(row, &["url", "href"]),
            })
        })
        .take(5000)
        .collect()
}

fn rows<'a>(value: &'a Value) -> Vec<&'a Map<String, Value>> {
    if let Some(values) = value.as_array() {
        return values.iter().filter_map(Value::as_object).collect();
    }
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    if object.contains_key("id")
        || object.contains_key("championId")
        || object.contains_key("augmentId")
    {
        return vec![object];
    }
    for key in ["rows", "data", "champions", "augments", "results", "items"] {
        if let Some(nested) = object.get(key) {
            let nested_rows = rows(nested);
            if !nested_rows.is_empty() {
                return nested_rows;
            }
        }
    }
    object.values().flat_map(rows).collect()
}

fn text(value: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(value_text))
}

fn localized_text(value: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let raw = value.get(*key)?;
        value_text(raw).or_else(|| {
            raw.as_object()
                .and_then(|locales| text(locales, &["zh-CN", "zh_CN", "en"]))
        })
    })
}

fn champion_id(row: &Map<String, Value>, champions: &[NewsChampion]) -> Option<i64> {
    if let Some(id) = number(row, &["championId", "champion_id", "id"]) {
        return Some(id as i64);
    }
    let key = text(row, &["championId", "champion_id", "id"])?;
    champions
        .iter()
        .find(|champion| champion.dragon_key.eq_ignore_ascii_case(&key))
        .map(|champion| champion.id)
}

fn value_text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
}

fn number(value: &Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|raw| {
            raw.as_f64().or_else(|| {
                raw.as_str()
                    .and_then(|text| text.trim().trim_end_matches('%').parse::<f64>().ok())
            })
        })
    })
}

fn integer(value: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
    number(value, keys).and_then(|number| u64::try_from(number.round() as i128).ok())
}

fn role_for_tags(tags: &[&str]) -> String {
    tags.iter()
        .find_map(|tag| match *tag {
            "Marksman" => Some("下路"),
            "Support" => Some("辅助"),
            "Mage" | "Assassin" => Some("中路"),
            "Fighter" | "Tank" => Some("上路"),
            _ => None,
        })
        .unwrap_or("—")
        .to_string()
}

fn tier_for_rarity(rarity: &str) -> String {
    match rarity.to_ascii_lowercase().as_str() {
        "prismatic" | "kprismatic" | "legendary" | "s" => "S".to_string(),
        "gold" | "kgold" | "epic" | "a" => "A".to_string(),
        "silver" | "ksilver" | "common" | "b" => "B".to_string(),
        _ => "—".to_string(),
    }
}

fn hash_text(value: &str) -> usize {
    value.bytes().fold(0_usize, |hash, byte| {
        hash.wrapping_mul(31).wrapping_add(byte as usize)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn client_icons_match_stats_without_changing_combo_ids_or_inventing_rates() {
        let mut augments = parse_mayhem_augments(&json!([
            { "augmentId": "transmute_prismatic", "name": { "zh-CN": "质变：棱彩阶" }, "pickRate": 64.28 }
        ]));
        let official = json!([
            { "augmentID": 1238, "name_en": "ARAM_TransmutePrismatic", "name_cn": "质变：棱彩阶", "mode": "KIWI, KIWI_JADE", "level": "kGold", "tooltip": "<attention>转换</attention>你的符文", "small_Icon": "https://game.gtimg.cn/images/lol/act/img/rune/transmuteprismatic_small.png" },
            { "augmentID": 1068, "name_en": "ARAM_Recursion", "name_cn": "循环往复", "mode": "KIWI", "level": "kGold" },
            { "augmentID": 9, "name_en": "NotKiwi", "name_cn": "其他模式", "mode": "KIWI_JADE" },
            { "augmentID": 10, "name_en": "TestOnly", "name_cn": "测试服", "mode": "KIWI", "isPBE": 1 }
        ]);
        let local = json!([
            { "id": 1238, "augmentNameId": "ARAM_TransmutePrismatic", "nameTRA": "质变：棱彩阶", "rarity": "kGold", "augmentSmallIconPath": "/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/TransmutePrismatic_small.png" },
            { "id": 68, "augmentNameId": "Recursion", "nameTRA": "循环往复", "rarity": "kGold", "augmentSmallIconPath": "wrong-arena-icon" }
        ]);
        merge_augment_assets(&mut augments, Some(&local), Some(&official));
        assert_eq!(augments.len(), 2);
        assert_eq!(augments[0].id, "transmute_prismatic");
        assert_eq!(augments[0].pick_rate, Some(64.28));
        assert_eq!(augments[0].win_rate, None);
        assert_eq!(augments[0].tier, "A");
        assert_eq!(augments[0].description, "转换 你的符文");
        assert!(augments[0].icon_path.as_ref().unwrap().contains("TransmutePrismatic"));
        assert!(augments[0].icon_url.is_some());
        assert_eq!(augments[1].name, "循环往复");
        assert_eq!(augments[1].source, "official");
        assert_eq!(augments[1].pick_rate, None);
        assert!(augments[1].icon_path.is_none());
    }

    #[test]
    fn client_catalog_works_when_online_catalogs_are_unavailable() {
        let mut augments = Vec::new();
        merge_augment_assets(&mut augments, Some(&json!([
            { "id": 1068, "augmentNameId": "ARAM_Recursion", "nameTRA": "循环往复", "rarity": "kGold", "augmentSmallIconPath": "/lol-game-data/assets/ASSETS/UX/Cherry/Augments/Icons/Recursion_small.png" }
        ])), None);
        assert_eq!(augments.len(), 1);
        assert_eq!(augments[0].name, "循环往复");
        assert!(augments[0].icon_path.is_some());
        assert_eq!(augments[0].win_rate, None);
    }

    #[test]
    fn news_ipc_matches_frontend_contract() {
        // Shared with the frontend tests: a flat metadata payload crashed the news page.
        let expected: Value =
            serde_json::from_str(include_str!("../../test/fixtures/news-data.json")).unwrap();
        let mut champions = parse_dragon_champions(&json!({
            "data": { "Ashe": { "id": "Ashe", "key": "22", "name": "寒冰射手", "tags": ["Marksman"] } }
        }))
        .unwrap();
        merge_mayhem_champion_rates(
            &mut champions,
            &json!({ "schemaVersion": 1, "rows": [{ "championId": "Ashe", "pickRate": 14.51 }] }),
        );
        let snapshot = NewsDataSnapshot {
            augments: parse_mayhem_augments(&json!({ "schemaVersion": 1, "rows": [{
                "augmentId": "a-1", "name": { "en": "Test augment", "zh-CN": "测试海克斯" },
                "description": { "zh-CN": "回归测试符文" },
                "pickRate": 4.2, "sampleSize": 100
            }] })),
            combos: parse_mayhem_combos(
                &json!({ "schemaVersion": 1, "rows": [{
                "championId": "Ashe", "augmentIds": ["a-1"]
            }] }),
                &champions,
            ),
            champions,
            meta: NewsDataMeta {
                patch: Some("26.1.1".to_string()),
                updated_at_ms: 1,
                official_source: "Riot Games Data Dragon".to_string(),
                stats_source: Some("ARAM Mayhem（第三方有限样本）".to_string()),
                warnings: vec![
                    "Riot 官方公开接口未提供海克斯胜率，胜率字段不会被推测或填充。".to_string(),
                ],
                source: "third-party".to_string(),
            },
        };
        assert_eq!(serde_json::to_value(snapshot).unwrap(), expected);
    }

    #[test]
    fn parses_percent_values_and_nested_rows() {
        let value = json!({
            "data": {
                "one": { "championId": 22, "pickRate": "14.51%" },
                "two": { "championId": 67, "pickRate": 3.2 }
            }
        });
        let parsed = rows(&value);
        assert_eq!(parsed.len(), 2);
        assert_eq!(number(parsed[0], &["pickRate"]), Some(14.51));
    }

    #[test]
    fn augment_rates_do_not_invent_win_rates() {
        let value = json!([{ "augmentId": "a-1", "name": "Test", "pickRate": 4.2 }]);
        let parsed = parse_mayhem_augments(&value);
        assert_eq!(parsed[0].pick_rate, Some(4.2));
        assert_eq!(parsed[0].win_rate, None);
    }

    #[test]
    fn localized_augments_prefer_chinese_and_fall_back_to_english() {
        let parsed = parse_mayhem_augments(&json!({
            "fields": [{ "field": "augmentId" }],
            "rows": [
                { "augmentId": "cn", "name": { "zh-CN": "中文名称", "en": "English" }, "rarity": "gold" },
                { "augmentId": "en", "name": { "en": "English only" }, "rarity": "silver" }
            ]
        }));
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].name, "中文名称");
        assert_eq!(parsed[0].tier, "A");
        assert_eq!(parsed[1].name, "English only");
        assert_eq!(parsed[1].tier, "B");
    }

    #[test]
    fn champion_rates_and_combos_resolve_dragon_keys_and_numeric_ids() {
        let mut champions = parse_dragon_champions(&json!({
            "data": { "Ashe": { "id": "Ashe", "key": "22", "name": "寒冰射手" } }
        }))
        .unwrap();
        for id in [json!("Ashe"), json!(22)] {
            merge_mayhem_champion_rates(
                &mut champions,
                &json!({
                    "rows": [{ "championId": id, "pickRate": 14.5 }]
                }),
            );
            assert_eq!(champions[0].pick_rate, Some(14.5));
            let combos = parse_mayhem_combos(
                &json!({
                    "rows": [
                        { "championId": id, "augmentIds": ["one"] },
                        { "championId": "Unknown", "augmentIds": ["two"] }
                    ]
                }),
                &champions,
            );
            assert_eq!(combos.len(), 1);
            assert_eq!(combos[0].champion_id, 22);
        }
    }
}
