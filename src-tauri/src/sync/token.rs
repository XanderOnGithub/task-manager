//! The GitHub token.
//!
//! - **Computers:** the system keychain (macOS Keychain, Windows Credential
//!   Manager), never a file.
//! - **Android:** a file in the app's private folder (`init` says where). No other
//!   app can read it, and Android encrypts that storage with the screen lock.
//!   The keychain crate has no Android backend.

#[cfg(not(target_os = "android"))]
mod imp {
    const KEYCHAIN_SERVICE: &str = "com.xanderreyes.moss";
    const KEYCHAIN_USER: &str = "github";

    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
    }

    /// The saved token, if you're signed in.
    pub fn get() -> Option<String> {
        entry().ok()?.get_password().ok()
    }

    pub fn set(token: &str) -> Result<(), String> {
        entry()?
            .set_password(token)
            .map_err(|e| format!("Couldn't save the sign-in: {e}"))
    }

    /// Forgets the token (signing out).
    pub fn clear() {
        if let Ok(entry) = entry() {
            let _ = entry.delete_credential();
        }
    }
}

#[cfg(target_os = "android")]
mod imp {
    use std::path::PathBuf;
    use std::sync::OnceLock;

    /// Where the token file is. Set once at startup (`super::init`).
    static FILE: OnceLock<PathBuf> = OnceLock::new();

    pub fn init(file: PathBuf) {
        let _ = FILE.set(file);
    }

    pub fn get() -> Option<String> {
        let text = std::fs::read_to_string(FILE.get()?).ok()?;
        let token = text.trim();
        (!token.is_empty()).then(|| token.to_owned())
    }

    pub fn set(token: &str) -> Result<(), String> {
        let file = FILE.get().ok_or("Couldn't save the sign-in.")?;
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't save the sign-in: {e}"))?;
        }
        // Written so only this app can read it, even before Android's own protection.
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut out = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(file)
            .map_err(|e| format!("Couldn't save the sign-in: {e}"))?;
        out.write_all(token.as_bytes())
            .map_err(|e| format!("Couldn't save the sign-in: {e}"))
    }

    pub fn clear() {
        if let Some(file) = FILE.get() {
            let _ = std::fs::remove_file(file);
        }
    }
}

pub(super) use imp::*;
