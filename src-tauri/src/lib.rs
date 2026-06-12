// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::Path;
use std::process::Command;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn launch_task_app(app_path: String, app_kind: String) -> Result<(), String> {
    let path = Path::new(&app_path);
    if !path.exists() {
        return Err("App path does not exist.".to_string());
    }
    if !path.is_file() {
        return Err("App path is not a file.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match app_kind.as_str() {
        "exe" => {
            if extension != "exe" {
                return Err("App kind exe requires a .exe path.".to_string());
            }

            Command::new(path)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Failed to launch executable: {error}"))
        }
        "shortcut" => {
            if extension != "lnk" {
                return Err("App kind shortcut requires a .lnk path.".to_string());
            }

            launch_shortcut(path)
        }
        _ => Err("Unsupported app kind.".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn launch_shortcut(path: &Path) -> Result<(), String> {
    Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to launch shortcut: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn launch_shortcut(_path: &Path) -> Result<(), String> {
    Err("Shortcut launch is only supported on Windows.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, launch_task_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
