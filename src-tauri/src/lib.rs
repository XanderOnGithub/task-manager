//! The desktop app: the bridge between the UI and `task-core`.
//!
//! Each `#[tauri::command]` function can be called from TypeScript with
//! `invoke("command_name", { ...args })` (see `src/platform/api.ts`). The commands
//! are thin: they find the data folder, call into `task-core`, and turn errors
//! into plain strings the UI can show.
//!
//! Where things are:
//!
//! - `commands/`      every command the UI can call, one file per job
//! - `sync/`          Git sync: sign in, repositories, when to sync
//! - `backup/`        zip backups of the data folder: daily, on request, restore
//! - `state`          what's kept in memory, and the `read` / `write` helpers
//! - `settings`       the small settings file
//! - `folder`         opening a data folder and watching it
//! - `high_refresh`   the experimental 120fps switch (macOS)
//!
//! This file only puts them together: plugins, startup, and the list of
//! commands.

mod backup;
mod commands;
mod folder;
mod high_refresh;
mod settings;
mod state;
mod sync;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // In-app updates: checks the latest GitHub release (see "updater" in
        // tauri.conf.json), and restarts into the new version.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Keep the plugin available for manual control through Settings.
        .plugin(tauri_plugin_macos_fps::init())
        .setup(|app| {
            let settings_file = app.path().app_config_dir()?.join("settings.json");
            settings::bring_over_old(&settings_file);
            let saved = settings::load(&settings_file);
            app.manage(AppState::new(settings_file));

            // Turn on 120fps before you start using the window, then reload so
            // the page picks it up. Only when you've switched it on.
            if saved.high_refresh && high_refresh::SUPPORTED {
                if let Some(window) = app.get_webview_window("main") {
                    let reload_target = window.clone();
                    high_refresh::apply(&window, true, move |result| match result {
                        Ok(()) => {
                            let _ = reload_target.reload();
                        }
                        Err(e) => eprintln!("120fps not applied: {e}"),
                    });
                }
            }

            let handle = app.handle().clone();
            let root = saved
                .data_folder
                .filter(|p| p.is_dir())
                .or_else(|| folder::dev_sample(&handle));
            if let Some(root) = root {
                let state = handle.state::<AppState>();
                let mut data = state.data().map_err(std::io::Error::other)?;
                folder::open(&handle, &mut data, root);
            }
            sync::start(&handle);
            backup::start(&handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::folder::get_data_folder,
            commands::folder::set_data_folder,
            commands::folder::suggested_data_folder,
            commands::folder::start_data_folder,
            commands::library::load_library,
            commands::items::create_item,
            commands::items::rename_item,
            commands::items::move_item,
            commands::items::set_field,
            commands::items::set_status,
            commands::body::read_body,
            commands::body::search_text,
            commands::body::write_body,
            commands::trash::trash_item,
            commands::trash::restore_item,
            commands::trash::list_trash,
            commands::trash::delete_forever,
            commands::trash::empty_trash,
            commands::reveal::reveal_in_finder,
            commands::reveal::item_path,
            commands::reveal::reveal_path,
            commands::unsorted::add_unsorted,
            commands::unsorted::file_unsorted,
            commands::unsorted::remove_unsorted,
            commands::unsorted::restore_unsorted,
            commands::display::get_high_refresh,
            commands::display::set_high_refresh,
            backup::list::backups_get,
            backup::list::backups_set_automatic,
            backup::now::backup_now,
            backup::restore::backup_restore,
            backup::reveal::backups_reveal,
            sync::info::sync_state,
            sync::login::github_login_start,
            sync::login::github_login_poll,
            sync::logout::github_logout,
            sync::repos::github_repos,
            sync::repos::github_create_repo,
            sync::connect::sync_connect,
            sync::run::sync_now,
            sync::run::sync_nudge,
            sync::pause::sync_set_paused,
            sync::disconnect::sync_disconnect,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| {
            // Leave nothing uncommitted when Moss closes (see sync/).
            if let tauri::RunEvent::ExitRequested { .. } = event {
                sync::on_exit(app);
            }
        });
}
