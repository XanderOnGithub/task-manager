//! Where this data folder's backups are kept.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::state::{AppState, CmdResult};

/// The open data folder and the folder its backups go in.
pub(super) fn for_open_folder(app: &AppHandle) -> CmdResult<(PathBuf, PathBuf)> {
    let root = app
        .state::<AppState>()
        .data()?
        .root
        .clone()
        .ok_or_else(|| "Choose a data folder first.".to_string())?;
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    Ok((root.clone(), base.join(folder_key(&root))))
}

/// "Moss-1a2b3c4d": the folder's name for people, and a hash of its full path
/// so two folders with the same name keep separate backups.
fn folder_key(root: &Path) -> String {
    let name: String = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".into())
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    format!("{name}-{:08x}", fnv1a(root.to_string_lossy().as_bytes()) as u32)
}

/// FNV-1a: a tiny hash that gives the same answer on every computer and every
/// version of Rust (the standard library's hasher doesn't promise that).
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, b| {
        (hash ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_key_is_stable_readable_and_different_per_folder() {
        let a = folder_key(Path::new("/Users/me/Documents/Moss"));
        assert_eq!(a, folder_key(Path::new("/Users/me/Documents/Moss")));
        assert!(a.starts_with("Moss-"), "{a}");
        assert_ne!(a, folder_key(Path::new("/Users/you/Documents/Moss")));
        assert!(!folder_key(Path::new("/a/My Notes: 2026")).contains([' ', ':', '/']));
        // Known value: it must never change, or existing backups would be "lost".
        assert_eq!(fnv1a(b"abc"), 0xe71f_a219_0541_574b);
    }
}
