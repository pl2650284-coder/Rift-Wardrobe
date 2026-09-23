mod discovery;
mod lcu;
mod models;
mod runtime;

use models::{AppSnapshot, ApplyResult};
use runtime::RuntimeState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State, WindowEvent,
};

#[tauri::command]
async fn get_snapshot(state: State<'_, RuntimeState>) -> Result<AppSnapshot, String> {
    Ok(state.snapshot().await)
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
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
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
    let key = current_user
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|error| error.to_string())?;
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
    for y in 1_usize..15 {
        let y_i32 = y as i32;
        let half: i32 = if y < 3 { 2 + y_i32 } else if y < 12 { 6 } else { 6 - (y_i32 - 11) };
        let center = 8_i32;
        for x in (center - half)..=(center + half) {
            if !(0_i32..16).contains(&x) {
                continue;
            }
            let offset = (y * 16 + x as usize) * 4;
            rgba[offset..offset + 4].copy_from_slice(if y < 4 {
                &[200, 169, 106, 255]
            } else {
                &[79, 169, 155, 255]
            });
        }
    }
    tauri::image::Image::new_owned(rgba, 16, 16)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(RuntimeState::new())
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            reconnect_client,
            apply_skin,
            apply_random_skin,
            get_skin_image,
            hide_main_window,
            minimize_main_window,
            set_always_on_top,
            get_launch_at_startup,
            set_launch_at_startup,
        ])
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示助手", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon())
                .tooltip("英雄联盟皮肤助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
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
