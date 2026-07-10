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

/// Reminder toasts through WinRT directly (not the notification plugin): the
/// plugin cannot report clicks on Windows desktop, and click-to-focus is the
/// whole point of an OS reminder. The toast's Activated handler refocuses the
/// main window and forwards the task id to the frontend.
#[cfg(target_os = "windows")]
mod reminder_toast {
    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    // Dev builds have no installed shortcut, so toasts are attributed to
    // PowerShell's AppUserModelID (the same trick the official plugin uses).
    // Installed builds use the bundle identifier that the NSIS shortcut carries.
    const DEBUG_AUMID: &str =
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
    const RELEASE_AUMID: &str = "com.tofinal.tasks";

    fn xml_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    pub fn show(app: &AppHandle, title: &str, body: &str, task_id: &str) -> Result<(), String> {
        let xml = format!(
            concat!(
                r#"<toast activationType="foreground"><visual><binding template="ToastGeneric">"#,
                "<text>{}</text><text>{}</text></binding></visual></toast>"
            ),
            xml_escape(title),
            xml_escape(body),
        );

        let document = XmlDocument::new().map_err(|error| format!("Toast XML init failed: {error}"))?;
        document
            .LoadXml(&HSTRING::from(xml))
            .map_err(|error| format!("Toast XML parse failed: {error}"))?;
        let toast = ToastNotification::CreateToastNotification(&document)
            .map_err(|error| format!("Toast creation failed: {error}"))?;

        let app_handle = app.clone();
        let task = task_id.to_string();
        toast
            .Activated(&TypedEventHandler::new(move |_, _| {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app_handle.emit("reminder-notification-activated", task.clone());
                Ok(())
            }))
            .map_err(|error| format!("Toast activation hook failed: {error}"))?;

        let aumid = if cfg!(debug_assertions) { DEBUG_AUMID } else { RELEASE_AUMID };
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(aumid))
            .map_err(|error| format!("Toast notifier failed: {error}"))?;
        notifier
            .Show(&toast)
            .map_err(|error| format!("Toast show failed: {error}"))?;

        // Keep the COM object (and its Activated handler) alive for the toast's
        // lifetime; a few leaked notification handles per day are negligible.
        std::mem::forget(toast);
        Ok(())
    }
}

#[tauri::command]
fn notify_reminder(app: tauri::AppHandle, title: String, body: String, task_id: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return reminder_toast::show(&app, &title, &body, &task_id);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, title, body, task_id);
        Err("System reminder notifications are only supported on Windows.".to_string())
    }
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

const MAX_DROPPED_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
const DROPPED_IMAGE_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedImageFile {
    file_name: String,
    bytes: Vec<u8>,
}

/// Narrow read command for OS drag-and-drop image imports. Dropped paths are
/// outside the fs plugin scope, so this validates extension and size before
/// returning the bytes; the frontend writes them into AppData attachments.
#[tauri::command]
fn read_dropped_image(path: String) -> Result<DroppedImageFile, String> {
    let path = Path::new(&path);
    if !path.is_file() {
        return Err("Dropped file is unavailable.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !DROPPED_IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Unsupported image type. Use PNG, JPG, JPEG, or WebP.".to_string());
    }

    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Failed to read dropped file: {error}"))?;
    if metadata.len() > MAX_DROPPED_IMAGE_BYTES {
        return Err("Dropped image is larger than 10 MB.".to_string());
    }

    let bytes =
        std::fs::read(path).map_err(|error| format!("Failed to read dropped file: {error}"))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("dropped-image")
        .to_string();

    Ok(DroppedImageFile { file_name, bytes })
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
            launch_task_app,
            capture_fullscreen_screenshot,
            notify_reminder,
            read_dropped_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
