use crate::{
    automation::{AutoAccept, AutomationSnapshot},
    discovery,
    lcu::LcuClient,
    models::{AppSnapshot, ApplyResult},
    profile::PlayerProfile,
};
use rand::seq::SliceRandom;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, RwLock};

pub struct RuntimeState {
    snapshot: RwLock<AppSnapshot>,
    client: RwLock<Option<Arc<LcuClient>>>,
    write_guard: Mutex<()>,
    image_cache: RwLock<HashMap<String, String>>,
    automation: Mutex<AutoAccept>,
    auto_popup_companion: AtomicBool,
}

impl RuntimeState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::new(AppSnapshot::disconnected(None)),
            client: RwLock::new(None),
            write_guard: Mutex::new(()),
            image_cache: RwLock::new(HashMap::new()),
            automation: Mutex::new(AutoAccept::default()),
            auto_popup_companion: AtomicBool::new(true),
        }
    }

    pub fn auto_popup_companion(&self) -> bool {
        self.auto_popup_companion.load(Ordering::Relaxed)
    }

    pub fn set_auto_popup_companion(&self, enabled: bool) {
        self.auto_popup_companion.store(enabled, Ordering::Relaxed);
    }

    pub async fn snapshot(&self) -> AppSnapshot {
        self.snapshot.read().await.clone()
    }

    pub fn configure_automation(&self, path: PathBuf) -> Result<(), String> {
        let mut automation = self.automation.try_lock().map_err(|_| "自动接受设置正在使用")?;
        *automation = AutoAccept::load(path);
        Ok(())
    }

    pub async fn automation_snapshot(&self) -> AutomationSnapshot {
        self.automation.lock().await.snapshot()
    }

    pub async fn set_auto_accept(&self, app: &AppHandle, enabled: bool, delay_seconds: Option<u8>) -> Result<AutomationSnapshot, String> {
        let mut automation = self.automation.lock().await;
        let snapshot = match delay_seconds {
            Some(seconds) => automation.set_settings(enabled, seconds)?,
            None => automation.set_enabled(enabled)?,
        };
        drop(automation);
        let _ = app.emit("automation-changed", &snapshot);
        Ok(snapshot)
    }

    async fn process_automation(&self, app: &AppHandle, client: &LcuClient, phase: &str) {
        let mut automation = self.automation.lock().await;
        let before = automation.snapshot().revision;
        automation.tick(client, phase).await;
        let next = automation.snapshot();
        drop(automation);
        if next.revision != before { let _ = app.emit("automation-changed", &next); }
    }

    pub async fn profile(&self) -> Result<PlayerProfile, String> {
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 请先启动并登录英雄联盟客户端".to_string())?;
        let profile = client.get_profile().await?;
        if !self.client().await.is_some_and(|current| Arc::ptr_eq(&client, &current)) {
            return Err("CLIENT_DISCONNECTED: 客户端连接已变化，请重新读取个人信息".to_string());
        }
        Ok(profile)
    }

    async fn client(&self) -> Option<Arc<LcuClient>> {
        self.client.read().await.clone()
    }

    async fn set_client(&self, client: Option<Arc<LcuClient>>) {
        *self.client.write().await = client;
        if self.client.read().await.is_none() {
            self.image_cache.write().await.clear();
            self.automation.lock().await.reset_offer();
        }
    }

    pub async fn reconnect(&self) {
        self.set_client(None).await;
    }

    pub async fn clear_image_cache(&self) {
        self.image_cache.write().await.clear();
    }

    pub async fn apply_skin(
        &self,
        app: &AppHandle,
        skin_id: i64,
        expected_context_id: Option<&str>,
    ) -> Result<ApplyResult, String> {
        let _guard = self
            .write_guard
            .try_lock()
            .map_err(|_| "WRITE_IN_PROGRESS: 另一个皮肤选择仍在确认中".to_string())?;
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 尚未连接到英雄联盟客户端".to_string())?;
        let result = client.apply_skin(skin_id, expected_context_id).await?;
        if result.status == "success" {
            let mut confirmed = self.snapshot().await;
            if expected_context_id.is_none()
                || confirmed.context_id.as_deref() == expected_context_id
            {
                confirmed.mark_selected(skin_id);
                publish_snapshot(app, self, confirmed).await;
            }
        }
        Ok(result)
    }

    pub async fn apply_random(
        &self,
        app: &AppHandle,
        expected_context_id: Option<&str>,
    ) -> Result<ApplyResult, String> {
        let snapshot = self.snapshot().await;
        if expected_context_id.is_some() && snapshot.context_id.as_deref() != expected_context_id {
            return Err("SESSION_CHANGED: 英雄或选人会话已经变化".to_string());
        }
        let candidates: Vec<i64> = snapshot
            .skins
            .iter()
            .filter(|skin| {
                skin.available
                    && Some(skin.id) != snapshot.selected_skin_id
                    && !skin.selected
                    && !skin.is_base
                    && !skin.is_chroma
            })
            .map(|skin| skin.id)
            .collect();
        let skin_id = candidates
            .choose(&mut rand::thread_rng())
            .copied()
            .ok_or_else(|| "NO_RANDOM_CANDIDATE: 没有可随机的其他普通皮肤".to_string())?;
        drop(snapshot);
        self.apply_skin(app, skin_id, expected_context_id).await
    }

    pub async fn augment_catalog(&self) -> Option<serde_json::Value> {
        self.client().await?.get_augment_catalog().await.ok()
    }

    pub async fn image_data_url(&self, path: &str) -> Result<String, String> {
        if let Some(cached) = self.image_cache.read().await.get(path).cloned() {
            return Ok(cached);
        }
        let client = self
            .client()
            .await
            .ok_or_else(|| "尚未连接到英雄联盟客户端".to_string())?;
        let data_url = client.get_image_data_url(path).await?;
        let mut cache = self.image_cache.write().await;
        if cache.len() >= 24 {
            cache.clear();
        }
        cache.insert(path.to_string(), data_url.clone());
        Ok(data_url)
    }
}

pub fn start_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let state = app.state::<RuntimeState>();
            let client = match state.client().await {
                Some(client) => client,
                None => {
                    // Automatic discovery and retries stay in the background. Keep the
                    // last disconnected snapshot visible until a client responds.
                    let discovered =
                        tauri::async_runtime::spawn_blocking(discovery::discover).await;
                    match discovered {
                        Ok(Ok(credentials)) => match LcuClient::new(credentials) {
                            Ok(client) => {
                                let client = Arc::new(client);
                                state.set_client(Some(client.clone())).await;
                                client
                            }
                            Err(error) => {
                                publish_snapshot(
                                    &app,
                                    &state,
                                    AppSnapshot::disconnected(Some(&error.to_string())),
                                )
                                .await;
                                tokio::time::sleep(Duration::from_secs(2)).await;
                                continue;
                            }
                        },
                        _ => {
                            publish_snapshot(
                                &app,
                                &state,
                                AppSnapshot::disconnected(Some("league-client-not-found")),
                            )
                            .await;
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            continue;
                        }
                    }
                }
            };

            match client.get_snapshot().await {
                Ok(snapshot) => {
                    let active = snapshot.active;
                    let phase = snapshot.phase.clone();
                    publish_snapshot(&app, &state, snapshot).await;
                    state.process_automation(&app, &client, &phase).await;
                    tokio::time::sleep(if active || phase == "ReadyCheck" {
                        Duration::from_millis(180)
                    } else {
                        Duration::from_millis(650)
                    })
                    .await;
                }
                Err(error) => {
                    state.set_client(None).await;
                    publish_snapshot(
                        &app,
                        &state,
                        AppSnapshot::disconnected(Some(&error.to_string())),
                    )
                    .await;
                    tokio::time::sleep(Duration::from_millis(900)).await;
                }
            }
        }
    });
}

async fn publish_snapshot(app: &AppHandle, state: &RuntimeState, mut next: AppSnapshot) {
    let mut current = state.snapshot.write().await;
    if current.same_content(&next) {
        return;
    }
    let was_active = current.active;
    let context_changed = current.context_id != next.context_id;
    next.revision = current.revision.saturating_add(1);
    *current = next.clone();
    drop(current);
    if context_changed {
        state.image_cache.write().await.clear();
    }

    let _ = app.emit("snapshot-changed", &next);
    if next.active && !was_active {
        if state.auto_popup_companion() {
            show_companion_window(app, false, Some("skin"), None);
        }
    } else if !next.active && was_active {
        hide_companion_window(app);
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionNavigatePayload {
    tab: Option<String>,
    hero_id: Option<u32>,
}

pub fn show_companion_window(
    app: &AppHandle,
    focus: bool,
    tab: Option<&str>,
    hero_id: Option<u32>,
) {
    if let Some(window) = app.get_webview_window("companion") {
        position_companion_near_client(&window);
        if tab.is_some() || hero_id.is_some() {
            let _ = window.emit(
                "companion-navigate",
                CompanionNavigatePayload {
                    tab: tab.map(str::to_string),
                    hero_id,
                },
            );
        }
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
    }
}

pub fn hide_companion_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("companion") {
        let _ = window.hide();
    }
}

#[cfg(windows)]
fn position_companion_near_client(window: &tauri::WebviewWindow) {
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::RECT,
            UI::WindowsAndMessaging::{
                FindWindowW, GetWindowRect, IsWindowVisible, SetWindowPos, SystemParametersInfoW,
                SPI_GETWORKAREA, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
            },
        },
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let mut comp_rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut comp_rect) }.is_err() {
        return;
    }
    let comp_w = (comp_rect.right - comp_rect.left).max(360);
    let comp_h = (comp_rect.bottom - comp_rect.top).max(520);

    let mut work = RECT {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1040,
    };
    unsafe {
        let _ = SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some((&mut work as *mut RECT).cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
    }

    let rclient_class: Vec<u16> = "RCLIENT\0".encode_utf16().collect();
    let lol_title: Vec<u16> = "League of Legends\0".encode_utf16().collect();
    let client_hwnd = unsafe {
        FindWindowW(PCWSTR(rclient_class.as_ptr()), PCWSTR::null())
            .ok()
            .filter(|h| !h.is_invalid() && IsWindowVisible(*h).as_bool())
            .or_else(|| {
                FindWindowW(PCWSTR::null(), PCWSTR(lol_title.as_ptr()))
                    .ok()
                    .filter(|h| !h.is_invalid() && IsWindowVisible(*h).as_bool())
            })
    };

    let gap = 12;
    let (mut x, mut y) = (
        work.right - comp_w - 18,
        work.top + ((work.bottom - work.top - comp_h) / 2).max(16),
    );

    if let Some(client_hwnd) = client_hwnd {
        let mut client_rect = RECT::default();
        if unsafe { GetWindowRect(client_hwnd, &mut client_rect) }.is_ok() {
            let client_w = client_rect.right - client_rect.left;
            if client_w >= 400 {
                let right_x = client_rect.right + gap;
                let left_x = client_rect.left - comp_w - gap;
                if right_x + comp_w <= work.right {
                    x = right_x;
                } else if left_x >= work.left {
                    x = left_x;
                } else {
                    x = work.right - comp_w - 14;
                }
                y = client_rect.top;
            }
        }
    }

    let max_x = (work.right - comp_w).max(work.left);
    let max_y = (work.bottom - comp_h).max(work.top);
    x = x.clamp(work.left, max_x);
    y = y.clamp(work.top, max_y);

    unsafe {
        let _ = SetWindowPos(
            hwnd,
            None,
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(windows))]
fn position_companion_near_client(_window: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ConnectionState;

    #[tokio::test]
    async fn startup_does_not_publish_a_connecting_state() {
        let state = RuntimeState::new();
        let snapshot = state.snapshot().await;

        assert_eq!(snapshot.connection, ConnectionState::Disconnected);
        assert!(!snapshot.active);
        assert!(!snapshot.write_enabled);
    }

    #[tokio::test]
    async fn reconnect_preserves_the_failed_state_until_a_client_responds() {
        let state = RuntimeState::new();
        let failed = AppSnapshot::disconnected(Some("league-client-not-found"));
        *state.snapshot.write().await = failed.clone();

        state.reconnect().await;

        assert!(state.snapshot().await.same_content(&failed));
    }
}
