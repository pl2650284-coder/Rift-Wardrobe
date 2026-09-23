use crate::{
    discovery,
    lcu::LcuClient,
    models::{AppSnapshot, ApplyResult},
};
use rand::seq::SliceRandom;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, RwLock};

pub struct RuntimeState {
    snapshot: RwLock<AppSnapshot>,
    client: RwLock<Option<Arc<LcuClient>>>,
    write_guard: Mutex<()>,
    image_cache: RwLock<HashMap<String, String>>,
}

impl RuntimeState {
    pub fn new() -> Self {
        Self {
            snapshot: RwLock::new(AppSnapshot::connecting()),
            client: RwLock::new(None),
            write_guard: Mutex::new(()),
            image_cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn snapshot(&self) -> AppSnapshot {
        self.snapshot.read().await.clone()
    }

    async fn client(&self) -> Option<Arc<LcuClient>> {
        self.client.read().await.clone()
    }

    async fn set_client(&self, client: Option<Arc<LcuClient>>) {
        *self.client.write().await = client;
        if self.client.read().await.is_none() {
            self.image_cache.write().await.clear();
        }
    }

    pub async fn reconnect(&self) {
        self.set_client(None).await;
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
                    publish_snapshot(&app, &state, AppSnapshot::connecting()).await;
                    let discovered = tauri::async_runtime::spawn_blocking(discovery::discover).await;
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
                    publish_snapshot(&app, &state, snapshot).await;
                    tokio::time::sleep(if active {
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

async fn publish_snapshot(
    app: &AppHandle,
    state: &RuntimeState,
    mut next: AppSnapshot,
) {
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
    if let Some(window) = app.get_webview_window("main") {
        if next.active && !was_active {
            show_without_focus(&window);
        } else if !next.active && was_active {
            let _ = window.hide();
        }
    }
}

fn show_without_focus(window: &tauri::WebviewWindow) {
    // Tauri's window configuration keeps automatic showing from taking focus.
    let _ = window.show();
}
