mod automation;
mod db;
mod discovery;
mod game_assets;
mod hextech;
mod lcu;
mod lcu_ws;
mod match_history;
mod models;
mod official_data;
mod ongoing_game;
mod profile;
mod rankings;
mod runtime;

use automation::AutomationSnapshot;
use db::{EncounteredGame, SavedPlayer};
use match_history::{MatchDetail, PlayerDetail, SummonerOverview};
use models::{AppSnapshot, ApplyResult};
use official_data::NewsDataSnapshot;
use ongoing_game::OngoingGameSnapshot;
use profile::PlayerProfile;
use runtime::{RuntimeState, RuntimeStatus};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};

#[tauri::command]
async fn get_snapshot(state: State<'_, RuntimeState>) -> Result<AppSnapshot, String> {
    Ok(state.snapshot().await)
}

#[tauri::command]
async fn get_automation_state(state: State<'_, RuntimeState>) -> Result<AutomationSnapshot, String> {
    Ok(state.automation_snapshot().await)
}

#[tauri::command]
async fn set_auto_accept(app: tauri::AppHandle, state: State<'_, RuntimeState>, enabled: bool, delay_seconds: Option<u8>) -> Result<AutomationSnapshot, String> {
    state.set_auto_accept(&app, enabled, delay_seconds).await
}

#[tauri::command]
async fn get_profile(state: State<'_, RuntimeState>) -> Result<PlayerProfile, String> {
    state.profile().await
}

#[tauri::command]
async fn get_news_data(state: State<'_, RuntimeState>) -> Result<NewsDataSnapshot, String> {
    let mut news = official_data::get_news_data().await?;
    if let Some(catalog) = state.augment_catalog().await {
        official_data::attach_client_augment_assets(&mut news, &catalog);
    }
    Ok(news)
}

#[tauri::command]
async fn get_hextech_ranking(force: Option<bool>) -> Result<hextech::Ranking, String> {
    hextech::get_ranking(force.unwrap_or(false)).await
}

#[tauri::command]
async fn get_hextech_detail(hero_id: u32, force: Option<bool>) -> Result<hextech::Detail, String> {
    hextech::get_detail(hero_id, force.unwrap_or(false)).await
}

#[tauri::command]
async fn get_official_ranking(
    query: rankings::Query,
    force: Option<bool>,
) -> Result<rankings::Snapshot, String> {
    rankings::get_ranking(query, force.unwrap_or(false)).await
}

#[tauri::command]
async fn get_game_icon(
    state: State<'_, RuntimeState>,
    path: Option<String>,
    url: Option<String>,
) -> Result<String, String> {
    if let Some(path) = path {
        if let Ok(image) = state.image_data_url(&path).await {
            return Ok(image);
        }
    }
    match url {
        Some(url) => game_assets::fetch_official_icon(&url).await,
        None => Err("客户端暂时无法提供这个图标".to_string()),
    }
}

#[tauri::command]
async fn reconnect_client(state: State<'_, RuntimeState>) -> Result<(), String> {
    state.reconnect().await;
    Ok(())
}

#[tauri::command]
async fn apply_skin(
    app: tauri::AppHandle,
    state: State<'_, RuntimeState>,
    skin_id: i64,
    expected_context_id: Option<String>,
) -> Result<ApplyResult, String> {
    state
        .apply_skin(&app, skin_id, expected_context_id.as_deref())
        .await
}

#[tauri::command]
async fn apply_random_skin(
    app: tauri::AppHandle,
    state: State<'_, RuntimeState>,
    expected_context_id: Option<String>,
) -> Result<ApplyResult, String> {
    state
        .apply_random(&app, expected_context_id.as_deref())
        .await
}

#[tauri::command]
async fn get_skin_image(
    state: State<'_, RuntimeState>,
    path: String,
) -> Result<String, String> {
    state.image_data_url(&path).await
}

#[tauri::command]
async fn clear_image_cache(state: State<'_, RuntimeState>) -> Result<(), String> {
    state.clear_image_cache().await;
    Ok(())
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn minimize_main_window(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?
        .minimize()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn disable_always_on_top(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_NOTOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        // Tao only updates Windows when its cached flag changes. Also clear the
        // native state so a stale topmost flag cannot survive frontend reloads.
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_NOTOPMOST),
                0,
                0,
                0,
                0,
                SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
            )
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_companion_window(
    app: tauri::AppHandle,
    tab: Option<String>,
    hero_id: Option<u32>,
) -> Result<(), String> {
    runtime::show_companion_window(&app, true, tab.as_deref(), hero_id);
    Ok(())
}

#[tauri::command]
fn hide_companion_window(app: tauri::AppHandle) -> Result<(), String> {
    runtime::hide_companion_window(&app);
    Ok(())
}

#[tauri::command]
fn show_main_window_cmd(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

#[tauri::command]
fn set_companion_pin(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("companion")
        .ok_or_else(|| "找不到选人小窗".to_string())?;
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
            SWP_NOMOVE, SWP_NOSIZE,
        };

        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let z = if enabled { HWND_TOPMOST } else { HWND_NOTOPMOST };
        unsafe {
            SetWindowPos(
                hwnd,
                Some(z),
                0,
                0,
                0,
                0,
                SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
            )
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(enabled)
}

#[tauri::command]
fn set_auto_popup_companion(
    state: State<'_, RuntimeState>,
    enabled: bool,
) -> Result<bool, String> {
    state.set_auto_popup_companion(enabled);
    Ok(enabled)
}

#[tauri::command]
fn sync_appearance(app: tauri::AppHandle, appearance: serde_json::Value) -> Result<(), String> {
    app.emit("appearance-changed", appearance)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_runtime_status(state: State<'_, RuntimeState>) -> RuntimeStatus {
    state.status()
}

#[tauri::command]
async fn upsert_saved_player(
    state: State<'_, RuntimeState>,
    puuid: String,
    self_puuid: String,
    tag: String,
    note: String,
) -> Result<SavedPlayer, String> {
    state.upsert_saved_player(puuid, self_puuid, tag, note).await
}

#[tauri::command]
async fn delete_saved_player(
    state: State<'_, RuntimeState>,
    puuid: String,
    self_puuid: String,
) -> Result<(), String> {
    state.delete_saved_player(puuid, self_puuid).await
}

#[tauri::command]
async fn get_saved_player(
    state: State<'_, RuntimeState>,
    puuid: String,
    self_puuid: String,
) -> Result<Option<SavedPlayer>, String> {
    state.get_saved_player(puuid, self_puuid).await
}

#[tauri::command]
async fn list_saved_players(
    state: State<'_, RuntimeState>,
    self_puuid: String,
) -> Result<Vec<SavedPlayer>, String> {
    state.list_saved_players(self_puuid).await
}

#[tauri::command]
async fn record_encountered_game(
    state: State<'_, RuntimeState>,
    item: EncounteredGame,
) -> Result<(), String> {
    state.record_encountered_game(item).await
}

#[tauri::command]
async fn list_encountered_games(
    state: State<'_, RuntimeState>,
    self_puuid: String,
    puuid: String,
    limit: Option<usize>,
) -> Result<Vec<EncounteredGame>, String> {
    state
        .list_encountered_games(self_puuid, puuid, limit.unwrap_or(20))
        .await
}

#[tauri::command]
async fn toolkit_restart_ux(state: State<'_, RuntimeState>) -> Result<(), String> {
    state.toolkit_restart_ux().await
}

#[tauri::command]
async fn toolkit_play_again(state: State<'_, RuntimeState>) -> Result<(), String> {
    state.toolkit_play_again().await
}

#[tauri::command]
async fn toolkit_leave_lobby(state: State<'_, RuntimeState>) -> Result<(), String> {
    state.toolkit_leave_lobby().await
}

#[tauri::command]
async fn search_player(
    state: State<'_, RuntimeState>,
    query: String,
) -> Result<SummonerOverview, String> {
    state.search_player(query).await
}

#[tauri::command]
async fn get_player_detail(
    state: State<'_, RuntimeState>,
    puuid: String,
    beg_index: Option<usize>,
    end_index: Option<usize>,
) -> Result<PlayerDetail, String> {
    state
        .get_player_detail(puuid, beg_index.unwrap_or(0), end_index.unwrap_or(19))
        .await
}

#[tauri::command]
async fn get_match_detail(
    state: State<'_, RuntimeState>,
    game_id: u64,
) -> Result<MatchDetail, String> {
    state.get_match_detail(game_id).await
}

#[tauri::command]
async fn get_ongoing_game(
    state: State<'_, RuntimeState>,
) -> Result<OngoingGameSnapshot, String> {
    state.get_ongoing_game().await
}

#[tauri::command]
async fn send_champ_select_chat(
    state: State<'_, RuntimeState>,
    message: String,
) -> Result<(), String> {
    state.send_champ_select_chat(message).await
}

#[tauri::command]
fn get_launch_at_startup() -> Result<bool, String> {
    startup_enabled()
}

#[tauri::command]
fn set_launch_at_startup(enabled: bool) -> Result<bool, String> {
    set_startup_enabled(enabled)?;
    Ok(enabled)
}

#[cfg(windows)]
fn startup_enabled() -> Result<bool, String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let key = match current_user.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run") {
        Ok(key) => key,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    Ok(key.get_value::<String, _>("LolSkinAssistant").is_ok())
}

#[cfg(not(windows))]
fn startup_enabled() -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
fn set_startup_enabled(enabled: bool) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = current_user
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|error| error.to_string())?;
    if enabled {
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        key.set_value(
            "LolSkinAssistant",
            &format!("\"{}\"", executable.display()),
        )
        .map_err(|error| error.to_string())
    } else {
        match key.delete_value("LolSkinAssistant") {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(not(windows))]
fn set_startup_enabled(_enabled: bool) -> Result<(), String> {
    Err("当前平台不支持开机启动".to_string())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn tray_icon() -> tauri::image::Image<'static> {
    let mut rgba = vec![0_u8; 16 * 16 * 4];
    let seal = [201_u8, 59, 43, 255]; // #C93B2B 朱砂红
    let ink = [250_u8, 247, 240, 255]; // #FAF7F0 宣纸白
    for y in 1_i32..15 {
        for x in 1_i32..15 {
            // Rounded corners on 14x14 seal
            let corner = (x == 1 || x == 14) && (y == 1 || y == 14);
            if corner {
                continue;
            }
            let offset = (y as usize * 16 + x as usize) * 4;
            let on_slash = (x + y - 15).abs() <= 1 && (3..=12).contains(&x) && (3..=12).contains(&y);
            let top_left_dot = (x - 4).pow(2) + (y - 4).pow(2) <= 2;
            let bottom_right_dot = (x - 11).pow(2) + (y - 11).pow(2) <= 2;
            let color = if on_slash || top_left_dot || bottom_right_dot {
                &ink
            } else {
                &seal
            };
            rgba[offset..offset + 4].copy_from_slice(color);
        }
    }
    tauri::image::Image::new_owned(rgba, 16, 16)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["companion"])
                .build(),
        )
        .manage(RuntimeState::new())
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_automation_state,
            set_auto_accept,
            get_profile,
            get_news_data,
            get_hextech_ranking,
            get_hextech_detail,
            get_official_ranking,
            get_game_icon,
            reconnect_client,
            apply_skin,
            apply_random_skin,
            get_skin_image,
            clear_image_cache,
            hide_main_window,
            minimize_main_window,
            disable_always_on_top,
            open_companion_window,
            hide_companion_window,
            show_main_window_cmd,
            set_companion_pin,
            set_auto_popup_companion,
            sync_appearance,
            get_runtime_status,
            upsert_saved_player,
            delete_saved_player,
            get_saved_player,
            list_saved_players,
            record_encountered_game,
            list_encountered_games,
            toolkit_restart_ux,
            toolkit_play_again,
            toolkit_leave_lobby,
            search_player,
            get_player_detail,
            get_match_detail,
            get_ongoing_game,
            send_champ_select_chat,
            get_launch_at_startup,
            set_launch_at_startup,
        ])
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            app.state::<RuntimeState>()
                .configure_automation(config_dir.join("automation.json"))
                .map_err(std::io::Error::other)?;
            app.state::<RuntimeState>()
                .configure_database(config_dir.join("xiayin.db"))
                .map_err(std::io::Error::other)?;
            let app_icon = app
                .default_window_icon()
                .map(|icon| {
                    tauri::image::Image::new_owned(
                        icon.rgba().to_vec(),
                        icon.width(),
                        icon.height(),
                    )
                })
                .unwrap_or_else(tray_icon);
            for label in ["main", "companion"] {
                if let Some(window) = app.get_webview_window(label) {
                    let _ = window.set_icon(app_icon.clone());
                }
            }
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let companion_item = MenuItem::with_id(app, "companion", "打开选人小窗", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &companion_item, &quit_item])?;
            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app_icon)
                .tooltip("峡印")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "companion" => runtime::show_companion_window(app, true, None, None),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            tray.build(app)?;

            runtime::start_monitor(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run the desktop application");
}
