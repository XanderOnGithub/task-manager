//! Experimental: let the web view draw at 120fps on ProMotion displays.
//!
//! WebKit caps pages at 60fps by default to save battery. Safari exposes the
//! switch as a hidden feature flag ("Prefer Page Rendering Updates near 60fps"),
//! but apps that embed WebKit (like this one) don't read Safari's settings, and
//! there's no public API for it yet (https://bugs.webkit.org/show_bug.cgi?id=294338).
//!
//! The same flag does exist inside our web view, though, reachable through a
//! private WebKit API. This module flips it. Because the API is private:
//! - every call is checked first (`respondsToSelector:`), so on a macOS where
//!   it changed, this reports "not supported" instead of crashing;
//! - it's off by default and lives behind a Settings switch.
//!
//! Nothing here runs on Linux or Windows.

/// Name of WebKit's preference, as listed by `+[WKPreferences _features]`.
#[cfg(target_os = "macos")]
const FLAG: &[u8] = b"PreferPageRenderingUpdatesNear60FPSEnabled";

/// True on platforms where this can work at all.
pub const SUPPORTED: bool = cfg!(target_os = "macos");

/// Turns 120fps on or off for this window's web view. Runs on the main thread
/// (WebKit requires that); `done` receives the result.
#[cfg(target_os = "macos")]
pub fn apply(
    window: &tauri::WebviewWindow,
    enabled: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) {
    let scheduled = window.with_webview(move |webview| {
        // "Prefer near 60fps" is the opposite of what we want: 120fps = flag off.
        // SAFETY: `inner()` is the live WKWebView for this window, and we're on
        // the main thread inside `with_webview`.
        let result = unsafe { set_prefer_60fps(webview.inner(), !enabled) };
        done(result);
    });
    if let Err(e) = scheduled {
        eprintln!("Couldn't reach the web view: {e}");
    }
}

#[cfg(not(target_os = "macos"))]
pub fn apply(
    _window: &tauri::WebviewWindow,
    _enabled: bool,
    done: impl FnOnce(Result<(), String>) + Send + 'static,
) {
    done(Err("Only available on macOS".into()));
}

/// The Objective-C part. In plain words:
///   prefs = webView.configuration.preferences
///   for feature in WKPreferences._features where feature.key == FLAG:
///       prefs._setEnabled(value, forFeature: feature)
#[cfg(target_os = "macos")]
unsafe fn set_prefer_60fps(webview: *mut std::ffi::c_void, value: bool) -> Result<(), String> {
    use std::ffi::{c_char, CStr};

    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{msg_send, sel};

    let not_supported = || "This macOS version doesn't support it".to_owned();

    let webview = webview as *mut AnyObject;
    if webview.is_null() {
        return Err("No web view".into());
    }
    let class = AnyClass::get(c"WKPreferences").ok_or_else(not_supported)?;

    // Check both private methods exist before calling them.
    let has_features: bool = msg_send![class, respondsToSelector: sel!(_features)];
    if !has_features {
        return Err(not_supported());
    }
    let config: *mut AnyObject = msg_send![webview, configuration];
    let prefs: *mut AnyObject = msg_send![config, preferences];
    let can_set: bool = msg_send![prefs, respondsToSelector: sel!(_setEnabled:forFeature:)];
    if prefs.is_null() || !can_set {
        return Err(not_supported());
    }

    let features: *mut AnyObject = msg_send![class, _features];
    let count: usize = msg_send![features, count];
    for i in 0..count {
        let feature: *mut AnyObject = msg_send![features, objectAtIndex: i];
        let key: *mut AnyObject = msg_send![feature, key];
        if key.is_null() {
            continue;
        }
        let utf8: *const c_char = msg_send![key, UTF8String];
        if !utf8.is_null() && CStr::from_ptr(utf8).to_bytes() == FLAG {
            let _: () = msg_send![prefs, _setEnabled: value, forFeature: feature];
            return Ok(());
        }
    }
    Err(not_supported())
}
