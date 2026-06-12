// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::io::Cursor;
use std::path::Path;
use std::process::Command;

use xcap::image::{imageops, DynamicImage, ImageFormat, RgbaImage};
use xcap::Monitor;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotCaptureResult {
    png_bytes: Vec<u8>,
    width: u32,
    height: u32,
}

struct CapturedMonitor {
    x: i32,
    y: i32,
    image: RgbaImage,
}

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

#[tauri::command]
fn capture_fullscreen_screenshot() -> Result<ScreenshotCaptureResult, String> {
    let monitors =
        Monitor::all().map_err(|error| format!("Failed to enumerate monitors: {error}"))?;
    if monitors.is_empty() {
        return Err("No monitor is available for screenshot capture.".to_string());
    }

    let mut captures = Vec::with_capacity(monitors.len());
    for monitor in monitors {
        let x = monitor
            .x()
            .map_err(|error| format!("Failed to read monitor position: {error}"))?;
        let y = monitor
            .y()
            .map_err(|error| format!("Failed to read monitor position: {error}"))?;
        let image = monitor
            .capture_image()
            .map_err(|error| format!("Failed to capture monitor: {error}"))?;

        if image.width() == 0 || image.height() == 0 {
            return Err("Screenshot capture returned an empty monitor image.".to_string());
        }

        captures.push(CapturedMonitor { x, y, image });
    }

    let min_x = captures
        .iter()
        .map(|capture| capture.x)
        .min()
        .ok_or_else(|| "No monitor is available for screenshot capture.".to_string())?;
    let min_y = captures
        .iter()
        .map(|capture| capture.y)
        .min()
        .ok_or_else(|| "No monitor is available for screenshot capture.".to_string())?;
    let max_x = captures
        .iter()
        .map(|capture| capture.x + capture.image.width() as i32)
        .max()
        .ok_or_else(|| "No monitor is available for screenshot capture.".to_string())?;
    let max_y = captures
        .iter()
        .map(|capture| capture.y + capture.image.height() as i32)
        .max()
        .ok_or_else(|| "No monitor is available for screenshot capture.".to_string())?;

    let width = u32::try_from(max_x - min_x)
        .map_err(|_| "Screenshot capture returned invalid monitor bounds.".to_string())?;
    let height = u32::try_from(max_y - min_y)
        .map_err(|_| "Screenshot capture returned invalid monitor bounds.".to_string())?;
    if width == 0 || height == 0 {
        return Err("Screenshot capture returned invalid monitor dimensions.".to_string());
    }

    let mut canvas = RgbaImage::new(width, height);
    for capture in captures {
        imageops::overlay(
            &mut canvas,
            &capture.image,
            i64::from(capture.x - min_x),
            i64::from(capture.y - min_y),
        );
    }

    let mut png_cursor = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut png_cursor, ImageFormat::Png)
        .map_err(|error| format!("Failed to encode screenshot PNG: {error}"))?;

    Ok(ScreenshotCaptureResult {
        png_bytes: png_cursor.into_inner(),
        width,
        height,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            launch_task_app,
            capture_fullscreen_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
