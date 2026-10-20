//! The GitHub token. It lives in the system keychain (macOS Keychain, Windows
//! Credential Manager), never in a file.

const KEYCHAIN_SERVICE: &str = "com.xanderreyes.moss";
const KEYCHAIN_USER: &str = "github";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
}

/// The saved token, if you're signed in.
pub(super) fn get() -> Option<String> {
    entry().ok()?.get_password().ok()
}

pub(super) fn set(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|e| format!("Couldn't save the sign-in: {e}"))
}

/// Forgets the token (signing out).
pub(super) fn clear() {
    if let Ok(entry) = entry() {
        let _ = entry.delete_credential();
    }
}
