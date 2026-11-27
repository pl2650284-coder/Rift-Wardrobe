use crate::{lcu::LcuClient, models::now_ms};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, fs, path::PathBuf};

const MAX_LOGS: usize = 40;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChampionRunesPreset {
    pub name: String,
    pub primary_style_id: i64,
    pub sub_style_id: i64,
    pub selected_perk_ids: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SummonerSpellsPreset {
    pub spell1_id: i64,
    pub spell2_id: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChampionPresetEntry {
    pub champion_id: i64,
    pub mode: String, // "default" | "aram" | "ranked"
    #[serde(default)]
    pub runes: Option<ChampionRunesPreset>,
    #[serde(default)]
    pub spells: Option<SummonerSpellsPreset>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoChampConfigData {
    #[serde(default)]
    pub enabled: bool,
    /// Keyed by "{champion_id}:{mode}"
    #[serde(default)]
    pub presets: BTreeMap<String, ChampionPresetEntry>,
}

impl AutoChampConfigData {
    pub fn key(champion_id: i64, mode: &str) -> String {
        format!("{champion_id}:{}", normalize_mode(mode))
    }

    pub fn lookup(&self, champion_id: i64, mode: &str) -> Option<&ChampionPresetEntry> {
        let specific = Self::key(champion_id, mode);
        self.presets
            .get(&specific)
            .or_else(|| self.presets.get(&Self::key(champion_id, "default")))
    }
}

pub fn normalize_mode(mode: &str) -> &'static str {
    match mode.to_ascii_lowercase().as_str() {
        "aram" | "kiwi" => "aram",
        "ranked" => "ranked",
        _ => "default",
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoChampConfigLog {
    pub id: String,
    pub timestamp_ms: u64,
    pub action: String,
    pub detail: String,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoChampConfigSnapshot {
    pub data: AutoChampConfigData,
    pub revision: u64,
    pub logs: Vec<AutoChampConfigLog>,
}

#[derive(Default)]
pub struct AutoChampConfig {
    data: AutoChampConfigData,
    path: Option<PathBuf>,
    revision: u64,
    logs: Vec<AutoChampConfigLog>,
    last_applied: Option<(String, i64)>,
}

impl AutoChampConfig {
    pub fn load(path: PathBuf) -> Self {
        let mut engine = Self {
            path: Some(path.clone()),
            ..Self::default()
        };
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(data) = serde_json::from_slice::<AutoChampConfigData>(&bytes) {
                engine.data = data;
            }
        }
        engine
    }

    pub fn snapshot(&self) -> AutoChampConfigSnapshot {
        AutoChampConfigSnapshot {
            data: self.data.clone(),
            revision: self.revision,
            logs: self.logs.clone(),
        }
    }

    fn persist(&self) -> Result<(), String> {
        if let Some(path) = &self.path {
            let parent = path.parent().ok_or("英雄配置目录无效")?;
            fs::create_dir_all(parent).map_err(|_| "无法创建配置目录")?;
            let bytes =
                serde_json::to_vec_pretty(&self.data).map_err(|_| "无法序列化英雄配置")?;
            let tmp = path.with_extension("tmp");
            fs::write(&tmp, bytes).map_err(|_| "无法写入英雄配置")?;
            fs::rename(&tmp, path).map_err(|_| "无法保存英雄配置")?;
        }
        Ok(())
    }

    pub fn set_enabled(&mut self, enabled: bool) -> Result<AutoChampConfigSnapshot, String> {
        self.data.enabled = enabled;
        self.persist()?;
        self.log(
            "英雄配置",
            if enabled {
                "已开启选人自动应用符文与召唤师技能"
            } else {
                "已关闭选人自动应用"
            },
            "success",
        );
        Ok(self.snapshot())
    }

    pub fn upsert_preset(
        &mut self,
        mut entry: ChampionPresetEntry,
    ) -> Result<AutoChampConfigSnapshot, String> {
        if entry.champion_id <= 0 {
            return Err("无效的英雄 ID".to_string());
        }
        entry.mode = normalize_mode(&entry.mode).to_string();
        let key = AutoChampConfigData::key(entry.champion_id, &entry.mode);
        if entry.runes.is_none() && entry.spells.is_none() {
            self.data.presets.remove(&key);
        } else {
            self.data.presets.insert(key, entry);
        }
        self.persist()?;
        self.revision += 1;
        Ok(self.snapshot())
    }

    pub fn delete_preset(
        &mut self,
        champion_id: i64,
        mode: &str,
    ) -> Result<AutoChampConfigSnapshot, String> {
        let key = AutoChampConfigData::key(champion_id, mode);
        self.data.presets.remove(&key);
        self.persist()?;
        self.revision += 1;
        Ok(self.snapshot())
    }

    fn log(&mut self, action: &str, detail: &str, status: &str) {
        self.revision += 1;
        let ts = now_ms();
        self.logs.insert(
            0,
            AutoChampConfigLog {
                id: format!("champcfg-{ts}-{}", self.revision),
                timestamp_ms: ts,
                action: action.to_string(),
                detail: detail.to_string(),
                status: status.to_string(),
            },
        );
        self.logs.truncate(MAX_LOGS);
    }

    pub async fn tick(
        &mut self,
        client: &LcuClient,
        phase: &str,
        context_id: Option<&str>,
        champion_id: Option<i64>,
        bench_enabled: bool,
    ) -> bool {
        let prev_rev = self.revision;
        if phase != "ChampSelect" {
            self.last_applied = None;
            return false;
        }
        if !self.data.enabled {
            return false;
        }
        let (Some(ctx), Some(cid)) = (context_id, champion_id.filter(|id| *id > 0)) else {
            return false;
        };
        let key = (ctx.to_string(), cid);
        if self.last_applied.as_ref() == Some(&key) {
            return false;
        }
        let mode = if bench_enabled { "aram" } else { "default" };
        let Some(preset) = self.data.lookup(cid, mode).cloned() else {
            self.last_applied = Some(key);
            return false;
        };
        self.last_applied = Some(key);
        self.apply_preset_internal(client, &preset).await;
        self.revision != prev_rev
    }

    pub async fn apply_now(
        &mut self,
        client: &LcuClient,
        champion_id: i64,
        mode: &str,
    ) -> Result<AutoChampConfigSnapshot, String> {
        let preset = self
            .data
            .lookup(champion_id, mode)
            .cloned()
            .ok_or_else(|| "尚未为该英雄配置符文或召唤师技能".to_string())?;
        self.apply_preset_internal(client, &preset).await;
        Ok(self.snapshot())
    }

    async fn apply_preset_internal(&mut self, client: &LcuClient, preset: &ChampionPresetEntry) {
        if let Some(runes) = &preset.runes {
            let page_name = if runes.name.starts_with("[峡印]") {
                runes.name.clone()
            } else {
                format!("[峡印] {}", runes.name)
            };
            match client
                .apply_perk_page(
                    &page_name,
                    runes.primary_style_id,
                    runes.sub_style_id,
                    &runes.selected_perk_ids,
                )
                .await
            {
                Ok(()) => self.log("自动符文", &format!("已应用符文页 {page_name}"), "success"),
                Err(e) => self.log("自动符文", &format!("应用符文失败：{e}"), "error"),
            }
        }
        if let Some(spells) = &preset.spells {
            if spells.spell1_id > 0 && spells.spell2_id > 0 && spells.spell1_id != spells.spell2_id
            {
                match client
                    .set_summoner_spells(spells.spell1_id, spells.spell2_id)
                    .await
                {
                    Ok(()) => self.log("召唤师技能", "已自动切换预设召唤师技能", "success"),
                    Err(e) => self.log("召唤师技能", &format!("切换技能失败：{e}"), "error"),
                }
            }
        }
    }
}

pub fn parse_perk_page(value: &Value, fallback_name: &str) -> Option<ChampionRunesPreset> {
    let primary_style_id = value.get("primaryStyleId").and_then(Value::as_i64)?;
    let sub_style_id = value.get("subStyleId").and_then(Value::as_i64)?;
    let selected_perk_ids: Vec<i64> = value
        .get("selectedPerkIds")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(Value::as_i64)
        .filter(|id| *id > 0)
        .collect();
    if primary_style_id <= 0 || sub_style_id <= 0 || selected_perk_ids.len() < 6 {
        return None;
    }
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_name)
        .to_string();
    Some(ChampionRunesPreset {
        name,
        primary_style_id,
        sub_style_id,
        selected_perk_ids,
    })
}

pub fn parse_recommended_page(value: &Value, fallback_name: &str) -> Option<ChampionRunesPreset> {
    let primary_style_id = value
        .get("primaryPerkStyleId")
        .or_else(|| value.get("primaryStyleId"))
        .and_then(Value::as_i64)?;
    let sub_style_id = value
        .get("secondaryPerkStyleId")
        .or_else(|| value.get("subStyleId"))
        .and_then(Value::as_i64)?;
    let selected_perk_ids: Vec<i64> = value
        .get("perks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.get("id").and_then(Value::as_i64))
                .filter(|id| *id > 0)
                .collect()
        })
        .or_else(|| {
            value
                .get("selectedPerkIds")
                .and_then(Value::as_array)
                .map(|arr| arr.iter().filter_map(Value::as_i64).filter(|id| *id > 0).collect())
        })?;
    if primary_style_id <= 0 || sub_style_id <= 0 || selected_perk_ids.len() < 6 {
        return None;
    }
    Some(ChampionRunesPreset {
        name: fallback_name.to_string(),
        primary_style_id,
        sub_style_id,
        selected_perk_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preset_lookup_falls_back_from_mode_to_default() {
        let mut data = AutoChampConfigData::default();
        let default_entry = ChampionPresetEntry {
            champion_id: 67,
            mode: "default".into(),
            runes: None,
            spells: Some(SummonerSpellsPreset {
                spell1_id: 4,
                spell2_id: 7,
            }),
        };
        data.presets
            .insert(AutoChampConfigData::key(67, "default"), default_entry.clone());
        assert_eq!(data.lookup(67, "aram"), Some(&default_entry));

        let aram_entry = ChampionPresetEntry {
            champion_id: 67,
            mode: "aram".into(),
            runes: None,
            spells: Some(SummonerSpellsPreset {
                spell1_id: 4,
                spell2_id: 32,
            }),
        };
        data.presets
            .insert(AutoChampConfigData::key(67, "aram"), aram_entry.clone());
        assert_eq!(data.lookup(67, "aram"), Some(&aram_entry));
    }

    #[test]
    fn parse_perk_page_extracts_styles_and_perks() {
        let val = json!({
            "name": "薇恩致命节奏",
            "primaryStyleId": 8000,
            "subStyleId": 8300,
            "selectedPerkIds": [8008, 9111, 9104, 8014, 8304, 8347, 5005, 5008, 5001]
        });
        let preset = parse_perk_page(&val, "默认").expect("preset");
        assert_eq!(preset.primary_style_id, 8000);
        assert_eq!(preset.selected_perk_ids.len(), 9);
    }
}
