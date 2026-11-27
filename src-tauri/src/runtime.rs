use crate::{
    automation::{AutoAccept, AutomationSnapshot},
    db::{Database, EncounteredGame, SavedPlayer},
    discovery,
    lcu::LcuClient,
    lcu_ws::{self, LcuEvent},
    models::{AppSnapshot, ApplyResult},
    profile::PlayerProfile,
};
use rand::seq::SliceRandom;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    sync::{broadcast, Mutex, Notify, OwnedSemaphorePermit, RwLock, Semaphore},
    task::JoinHandle,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub ws_connected: bool,
    pub connection_epoch: u64,
    pub session_epoch: u64,
}

pub struct RuntimeState {
    snapshot: RwLock<AppSnapshot>,
    client: RwLock<Option<Arc<LcuClient>>>,
    write_guard: Mutex<()>,
    image_cache: RwLock<HashMap<String, String>>,
    automation: Mutex<AutoAccept>,
    auto_popup_companion: AtomicBool,
    connection_epoch: AtomicU64,
    session_epoch: AtomicU64,
    low_priority_reads: Arc<Semaphore>,
    lcu_events: broadcast::Sender<LcuEvent>,
    ws_connected: Arc<AtomicBool>,
    ws_wake: Arc<Notify>,
    ws_task: Mutex<Option<JoinHandle<()>>>,
    db: RwLock<Option<Arc<Database>>>,
}

impl RuntimeState {
    pub fn new() -> Self {
        let (lcu_events, _) = broadcast::channel(256);
        Self {
            snapshot: RwLock::new(AppSnapshot::disconnected(None)),
            client: RwLock::new(None),
            write_guard: Mutex::new(()),
            image_cache: RwLock::new(HashMap::new()),
            automation: Mutex::new(AutoAccept::default()),
            auto_popup_companion: AtomicBool::new(true),
            connection_epoch: AtomicU64::new(0),
            session_epoch: AtomicU64::new(0),
            low_priority_reads: Arc::new(Semaphore::new(2)),
            lcu_events,
            ws_connected: Arc::new(AtomicBool::new(false)),
            ws_wake: Arc::new(Notify::new()),
            ws_task: Mutex::new(None),
            db: RwLock::new(None),
        }
    }

    pub fn configure_database(&self, path: PathBuf) -> Result<(), String> {
        let db = Arc::new(Database::open(&path)?);
        let mut guard = self.db.try_write().map_err(|_| "数据库正在初始化")?;
        *guard = Some(db);
        Ok(())
    }

    pub async fn database(&self) -> Result<Arc<Database>, String> {
        self.db
            .read()
            .await
            .clone()
            .ok_or_else(|| "本地数据库尚未初始化".to_string())
    }

    pub fn status(&self) -> RuntimeStatus {
        RuntimeStatus {
            ws_connected: self.ws_connected.load(Ordering::Relaxed),
            connection_epoch: self.connection_epoch.load(Ordering::Relaxed),
            session_epoch: self.session_epoch.load(Ordering::Relaxed),
        }
    }

    pub async fn acquire_low_priority_read(&self) -> Result<OwnedSemaphorePermit, String> {
        self.low_priority_reads
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| "后台读取通道已关闭".to_string())
    }

    #[allow(dead_code)]
    pub fn subscribe_lcu_events(&self) -> broadcast::Receiver<LcuEvent> {
        self.lcu_events.subscribe()
    }

    pub async fn upsert_saved_player(
        &self,
        puuid: String,
        self_puuid: String,
        tag: String,
        note: String,
    ) -> Result<SavedPlayer, String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.upsert_saved_player(&puuid, &self_puuid, &tag, &note))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn delete_saved_player(&self, puuid: String, self_puuid: String) -> Result<(), String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.delete_saved_player(&puuid, &self_puuid))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn get_saved_player(
        &self,
        puuid: String,
        self_puuid: String,
    ) -> Result<Option<SavedPlayer>, String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.get_saved_player(&puuid, &self_puuid))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn list_saved_players(&self, self_puuid: String) -> Result<Vec<SavedPlayer>, String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.list_saved_players(&self_puuid))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn record_encountered_game(&self, item: EncounteredGame) -> Result<(), String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.record_encountered_game(&item))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn list_encountered_games(
        &self,
        self_puuid: String,
        puuid: String,
        limit: usize,
    ) -> Result<Vec<EncounteredGame>, String> {
        let db = self.database().await?;
        tauri::async_runtime::spawn_blocking(move || db.list_encountered_games(&self_puuid, &puuid, limit))
            .await
            .map_err(|_| "数据库任务异常".to_string())?
    }

    pub async fn toolkit_restart_ux(&self) -> Result<(), String> {
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 请先启动并登录英雄联盟客户端".to_string())?;
        client.restart_ux().await.map_err(|e| e.to_string())
    }

    pub async fn toolkit_play_again(&self) -> Result<(), String> {
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 请先启动并登录英雄联盟客户端".to_string())?;
        client.play_again().await.map_err(|e| e.to_string())
    }

    pub async fn toolkit_leave_lobby(&self) -> Result<(), String> {
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 请先启动并登录英雄联盟客户端".to_string())?;
        client.leave_lobby().await.map_err(|e| e.to_string())
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
        let _permit = self.acquire_low_priority_read().await?;
        let epoch = self.connection_epoch.load(Ordering::Relaxed);
        let client = self
            .client()
            .await
            .ok_or_else(|| "CLIENT_DISCONNECTED: 请先启动并登录英雄联盟客户端".to_string())?;
        let profile = client.get_profile().await?;
        if self.connection_epoch.load(Ordering::Relaxed) != epoch
            || !self.client().await.is_some_and(|current| Arc::ptr_eq(&client, &current))
        {
            return Err("CLIENT_DISCONNECTED: 客户端连接已变化，请重新读取个人信息".to_string());
        }
        Ok(profile)
    }

    async fn client(&self) -> Option<Arc<LcuClient>> {
        self.client.read().await.clone()
    }

    async fn set_client(&self, client: Option<Arc<LcuClient>>) {
        self.connection_epoch.fetch_add(1, Ordering::Relaxed);
        if let Some(old_ws) = self.ws_task.lock().await.take() {
            old_ws.abort();
        }
        self.ws_connected.store(false, Ordering::Relaxed);
        *self.client.write().await = client.clone();
        match client {
            Some(active) => {
                let handle = lcu_ws::spawn_ws_listener(
                    active.credentials(),
                    self.lcu_events.clone(),
                    self.ws_wake.clone(),
                    self.ws_connected.clone(),
                );
                *self.ws_task.lock().await = Some(handle);
            }
            None => {
                self.image_cache.write().await.clear();
                self.automation.lock().await.reset_offer();
            }
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
                    let poll_interval = if state.ws_connected.load(Ordering::Relaxed) {
                        // WebSocket drives instant updates; keep a calm reconcile timer as fallback.
                        if phase == "ReadyCheck" {
                            Duration::from_millis(250)
                        } else {
                            Duration::from_millis(1200)
                        }
                    } else if active || phase == "ReadyCheck" {
                        Duration::from_millis(180)
                    } else {
                        Duration::from_millis(650)
                    };
                    tokio::select! {
                        _ = state.ws_wake.notified() => {}
                        _ = tokio::time::sleep(poll_interval) => {}
                    }
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
    let phase_changed = current.phase != next.phase;
    let context_changed = current.context_id != next.context_id;
    next.revision = current.revision.saturating_add(1);
    *current = next.clone();
    drop(current);
    if phase_changed || context_changed {
        state.session_epoch.fetch_add(1, Ordering::Relaxed);
    }
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
