//! The bridge: Moss's core, reachable over HTTP on localhost.
//!
//! In the desktop app, the front end calls Rust through Tauri (`invoke`). For
//! the README GIFs and the trailer, the front end runs in a headless browser
//! instead, and `media/capture/tauri-stub.js` turns each `invoke` into a POST
//! to this server. The commands below do what the matching ones in
//! `src-tauri/src/lib.rs` do, on a throwaway copy of the example folder, so
//! what you see in the clips is the real file format at work.
//!
//! Request:  POST /<command>   body: the command's arguments as JSON
//! Response: 200 with the result as JSON, or 400 with the error message.

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::{json, Value};
use task_core::unsorted::{self, Entry};
use task_core::{fix, fsutil, ops, search, trash, Kind, Library};

fn main() {
    // The data folder to work on comes from the command line.
    let root: PathBuf = std::env::args().nth(1).expect("usage: moss-bridge <data folder>").into();
    let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "4823".into());
    let server = tiny_http::Server::http(format!("127.0.0.1:{port}")).expect("couldn't start the server");
    println!("bridge: serving {} on http://127.0.0.1:{port}", root.display());

    // One request at a time. That keeps it simple, and the app never runs two
    // commands at once that would need to see each other's changes anyway.
    for mut request in server.incoming_requests() {
        let command = request.url().trim_start_matches('/').to_owned();
        let mut body = String::new();
        let _ = request.as_reader().read_to_string(&mut body);
        let args: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

        let (status, text) = match run(&root, &command, args) {
            Ok(value) => (200, value.to_string()),
            Err(message) => (400, Value::String(message).to_string()),
        };
        let response = tiny_http::Response::from_string(text)
            .with_status_code(status)
            .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap())
            // The page is served from a different port (Vite), so the browser
            // needs permission to call us.
            .with_header("Access-Control-Allow-Origin: *".parse::<tiny_http::Header>().unwrap());
        let _ = request.respond(response);
    }
}

/// The time stamped on new Unsorted lines. The capture script sets MOSS_NOW so
/// every recording shows the same time, whenever it was made.
fn now() -> String {
    std::env::var("MOSS_NOW").unwrap_or_else(|_| fsutil::now_stamp())
}

/// Pulls one named argument out of the JSON the page sent.
fn arg<T: for<'de> Deserialize<'de>>(args: &Value, name: &str) -> Result<T, String> {
    serde_json::from_value(args.get(name).cloned().unwrap_or(Value::Null))
        .map_err(|e| format!("bad argument `{name}`: {e}"))
}

/// Runs one command. Every command loads the library fresh: the clips are
/// small, and it means there's no cache to get out of step with the files.
fn run(root: &PathBuf, command: &str, args: Value) -> Result<Value, String> {
    let load = || Library::load(root).map_err(|e| e.to_string());
    let err = |e: task_core::Error| e.to_string();

    Ok(match command {
        "get_data_folder" => json!(root.display().to_string()),
        "load_library" => {
            let mut lib = load()?;
            if fix::apply(&lib).map_err(err)? > 0 {
                lib = load()?;
            }
            unsorted::stamp_missing(&lib, &now()).map_err(err)?;
            json!({
                "dataFolder": root.display().to_string(),
                "items": lib.items,
                "issues": lib.issues,
                "unsorted": unsorted::read(&lib).map_err(err)?,
            })
        }
        "create_item" => {
            let kind: Kind = arg(&args, "kind")?;
            let parent: Option<String> = arg(&args, "parent")?;
            let title: String = arg(&args, "title")?;
            json!(ops::create(&load()?, kind, parent.as_deref(), &title, "").map_err(err)?)
        }
        "rename_item" => {
            ops::rename(&load()?, &arg::<String>(&args, "id")?, &arg::<String>(&args, "title")?).map_err(err)?;
            Value::Null
        }
        "move_item" => {
            let parent: Option<String> = arg(&args, "parent")?;
            let before: Option<String> = arg(&args, "before")?;
            ops::move_item(&load()?, &arg::<String>(&args, "id")?, parent.as_deref(), before.as_deref()).map_err(err)?;
            Value::Null
        }
        "set_field" => {
            let value: Option<String> = arg(&args, "value")?;
            ops::set_field(&load()?, &arg::<String>(&args, "id")?, &arg::<String>(&args, "field")?, value.as_deref())
                .map_err(err)?;
            Value::Null
        }
        "read_body" => json!(ops::read_body(&load()?, &arg::<String>(&args, "id")?).map_err(err)?),
        "write_body" => {
            ops::write_body(&load()?, &arg::<String>(&args, "id")?, &arg::<String>(&args, "body")?).map_err(err)?;
            Value::Null
        }
        "search_text" => json!(&search::search_text(&load()?, &arg::<String>(&args, "query")?, 20)),
        "trash_item" => {
            let lib = load()?;
            let id: String = arg(&args, "id")?;
            let original = lib.get(&id).map(|i| i.path.clone()).unwrap_or_default();
            let trash_path = ops::trash(&lib, &id).map_err(err)?;
            json!({ "trashPath": trash_path, "originalPath": original })
        }
        "restore_item" => {
            let lib = load()?;
            ops::restore(&lib, &arg::<String>(&args, "trashPath")?, &arg::<String>(&args, "originalPath")?)
                .map_err(err)?;
            Value::Null
        }
        "list_trash" => json!(&trash::list(root).map_err(err)?),
        "add_unsorted" => json!(&unsorted::add(&load()?, &arg::<String>(&args, "text")?, &now()).map_err(err)?),
        "file_unsorted" => {
            let entry: Entry = arg(&args, "entry")?;
            let kind: Kind = arg(&args, "kind")?;
            let parent: Option<String> = arg(&args, "parent")?;
            json!(unsorted::file(&load()?, &entry, kind, parent.as_deref()).map_err(err)?)
        }
        "remove_unsorted" => {
            unsorted::remove(&load()?, &arg::<Entry>(&args, "entry")?).map_err(err)?;
            Value::Null
        }
        "restore_unsorted" => {
            unsorted::restore(&load()?, &arg::<Entry>(&args, "entry")?).map_err(err)?;
            Value::Null
        }
        // The 120fps switch only exists in the Mac app.
        "get_high_refresh" => json!({ "supported": false, "enabled": false }),
        other => return Err(format!("the bridge doesn't know `{other}`")),
    })
}
