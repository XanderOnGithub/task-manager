//! Controls the optional native refresh-rate unlock.
//!
//! The private WebKit details live in `tauri-plugin-macos-fps`; keeping this
//! adapter here preserves the app's Settings command and its opt-in behavior.

/// True on platforms where this can work at all.
pub const SUPPORTED: bool = cfg!(target_os = "macos");

/// Turns the native refresh rate on or off for this window's web view.
#[cfg(desktop)]
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

/// A phone draws at the screen's own rate already; there is nothing to switch.
#[cfg(mobile)]
pub fn apply(
    _window: &tauri::WebviewWindow,
    _enabled: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) {
    done(Err(
        "This device already draws at its screen's refresh rate".into()
    ));
}
