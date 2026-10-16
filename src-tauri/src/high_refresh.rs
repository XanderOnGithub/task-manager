//! Controls the optional native refresh-rate unlock.
//!
//! The private WebKit details live in `tauri-plugin-macos-fps`; keeping this
//! adapter here preserves the app's Settings command and its opt-in behavior.

/// True on platforms where this can work at all.
pub const SUPPORTED: bool = cfg!(target_os = "macos");

/// Turns the native refresh rate on or off for this window's web view.
pub fn apply(
    window: &tauri::WebviewWindow,
    enabled: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) {
    use tauri_plugin_macos_fps::MacFpsExt;

    let result = if enabled {
        window.as_ref().unlock_fps()
    } else {
        window.as_ref().lock_fps()
    };
    done(result.map_err(|e| e.to_string()));
}
