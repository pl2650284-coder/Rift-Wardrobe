use crate::{
    lcu::{LcuClient, LcuError},
    models::now_ms,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    time::{Duration, Instant},
};

const MAX_ATTEMPTS: u8 = 3;
const RETRY_DELAY_MS: u64 = 1_000;
const MAX_LOGS: usize = 50;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLog {
    id: String,
    timestamp_ms: u64,
    action: String,
    detail: String,
    status: String,
}

#[cfg(test)]
#[path = "automation_tests.rs"]
mod tests;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSnapshot {
    pub auto_accept: bool,
    pub auto_accept_delay_seconds: u8,
    pub configured: bool,
    pub revision: u64,
    pub logs: Vec<AutomationLog>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    auto_accept: bool,
    #[serde(default)]
    auto_accept_delay_seconds: u8,
}

#[derive(Default)]
pub struct AutoAccept {
    enabled: bool,
    delay_seconds: u8,
    configured: bool,
    path: Option<PathBuf>,
    revision: u64,
    logs: Vec<AutomationLog>,
    finished: bool,
    attempts: u8,
    retry_after_ms: u64,
    read_error: Option<String>,
    offer_started_at: Option<Instant>,
}

impl AutoAccept {
    pub fn load(path: PathBuf) -> Self {
        let mut automation = Self {
            path: Some(path.clone()),
            ..Self::default()
        };
        match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<Settings>(&bytes) {
                Ok(settings) => {
                    automation.enabled = settings.auto_accept;
                    automation.delay_seconds = settings.auto_accept_delay_seconds.min(5);
                    automation.configured = true;
                }
                Err(_) => automation.log(
                    "自动接受设置",
                    "设置文件无法解析，请重新设置自动接受开关",
                    "error",
                ),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => automation.log(
                "自动接受设置",
                "无法读取自动接受设置，请检查本地配置目录",
                "error",
            ),
        }
        automation
    }

    pub fn snapshot(&self) -> AutomationSnapshot {
        AutomationSnapshot {
            auto_accept: self.enabled,
            auto_accept_delay_seconds: self.delay_seconds,
            configured: self.configured,
            revision: self.revision,
            logs: self.logs.clone(),
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) -> Result<AutomationSnapshot, String> {
        self.set_settings(enabled, self.delay_seconds)
    }

    pub fn set_settings(
        &mut self,
        enabled: bool,
        delay_seconds: u8,
    ) -> Result<AutomationSnapshot, String> {
        if delay_seconds > 5 {
            return Err("自动接受等待时间必须是 0–5 秒的整数".into());
        }
        if self.configured && self.enabled == enabled && self.delay_seconds == delay_seconds {
            return Ok(self.snapshot());
        }
        if let Some(path) = &self.path {
            let parent = path.parent().ok_or("自动接受设置目录无效")?;
            fs::create_dir_all(parent).map_err(|_| "无法创建自动接受设置目录")?;
            let bytes = serde_json::to_vec(&Settings {
                auto_accept: enabled,
                auto_accept_delay_seconds: delay_seconds,
            })
            .map_err(|_| "无法序列化自动接受设置")?;
            let temporary = path.with_extension("tmp");
            fs::write(&temporary, bytes).map_err(|_| "无法写入自动接受设置")?;
            fs::rename(&temporary, path).map_err(|_| "无法保存自动接受设置")?;
        }
        let changed = self.enabled != enabled;
        let delay_changed = self.delay_seconds != delay_seconds;
        self.enabled = enabled;
        self.delay_seconds = delay_seconds;
        self.configured = true;
        self.revision += 1;
        // Changing the duration adjusts the existing deadline without restarting
        // a pending offer or retrying one that was already accepted.
        if changed {
            self.reset_offer();
        }
        if delay_changed {
            self.log(
                "自动接受设置",
                &format!("等待时间已设为 {delay_seconds} 秒，届时仍未确认才自动接受"),
                "success",
            );
        }
        if changed {
            self.log(
                "自动接受设置",
                if enabled {
                    "已开启，匹配成功后在后台自动确认"
                } else {
                    "已关闭，后续对局请手动接受"
                },
                "success",
            );
        }
        Ok(self.snapshot())
    }

    pub fn reset_offer(&mut self) {
        self.finished = false;
        self.attempts = 0;
        self.retry_after_ms = 0;
        self.read_error = None;
        self.offer_started_at = None;
    }

    fn log(&mut self, action: &str, detail: &str, status: &str) {
        self.revision += 1;
        let timestamp_ms = now_ms();
        self.logs.insert(
            0,
            AutomationLog {
                id: format!("automation-{}-{}", timestamp_ms, self.revision),
                timestamp_ms,
                action: action.to_string(),
                detail: detail.to_string(),
                status: status.to_string(),
            },
        );
        self.logs.truncate(MAX_LOGS);
    }

    fn log_read_error(&mut self, error: LcuError) {
        let message = format!("读取对局确认状态失败：{error}");
        if self.read_error.as_ref() != Some(&message) {
            self.log("自动接受对局", &message, "error");
            self.read_error = Some(message);
        }
    }

    /// Runs in Rust even while the WebView is hidden or another page is open.
    /// Every retry first reads the player's response; an accepted/declined offer
    /// never receives a POST, including after a previous response was lost.
    pub async fn tick(&mut self, client: &LcuClient, phase: &str) {
        self.tick_at(client, phase, Instant::now()).await;
    }

    async fn tick_at(&mut self, client: &LcuClient, phase: &str, observed_at: Instant) {
        if phase != "ReadyCheck" || !self.enabled {
            self.reset_offer();
            return;
        }
        if self.finished {
            return;
        }
        let started_at = *self.offer_started_at.get_or_insert(observed_at);
        let check = match client.get_ready_check().await {
            Ok(Some(check)) => {
                self.read_error = None;
                check
            }
            Ok(None) => return, // A ready check can disappear between phase/read.
            Err(error) => {
                self.log_read_error(error);
                return;
            }
        };
        if check.player_response == "Accepted" {
            if self.attempts > 0 {
                self.log("自动接受对局", "已核实客户端接受状态", "success");
            }
            self.finished = true;
            return;
        }
        if check.player_response == "Declined" || check.state == "EveryoneReady" {
            self.finished = true;
            return;
        }
        if check.state != "InProgress"
            || check.player_response != "None"
            || self.attempts >= MAX_ATTEMPTS
            || observed_at.saturating_duration_since(started_at)
                < Duration::from_secs(self.delay_seconds.into())
            || now_ms() < self.retry_after_ms
        {
            return;
        }
        // Recheck immediately before writing, so a phase change after polling
        // cannot accept something outside the active confirmation prompt.
        match client.get_phase().await {
            Ok(phase) if phase == "ReadyCheck" => {}
            Ok(_) => {
                self.reset_offer();
                return;
            }
            Err(error) => {
                self.log_read_error(error);
                return;
            }
        }
        self.attempts += 1;
        self.retry_after_ms = now_ms().saturating_add(RETRY_DELAY_MS);
        match client.accept_ready_check().await {
            Ok(()) => {
                self.finished = true;
                self.log("自动接受对局", "客户端已确认接受对局", "success");
            }
            Err(error) => {
                let retryable = matches!(
                    &error,
                    LcuError::Network
                        | LcuError::Http {
                            status: 408 | 409 | 425 | 429 | 500..=599,
                            ..
                        }
                );
                if !retryable {
                    self.attempts = MAX_ATTEMPTS;
                }
                let pending = self.attempts < MAX_ATTEMPTS;
                self.log(
                    "自动接受对局",
                    &format!(
                        "{error}{}",
                        if pending {
                            "；将重新读取客户端状态后重试"
                        } else {
                            "；本次确认不再重试"
                        }
                    ),
                    if pending { "pending" } else { "error" },
                );
            }
        }
    }
}
