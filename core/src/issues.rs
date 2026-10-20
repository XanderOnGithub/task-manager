//! Problems found while loading the data folder.
//!
//! Your files can be edited by anything: Finder, a text editor, a sync tool.
//! Instead of refusing to open when something is off, the loader records an
//! `Issue` and keeps going. Some issues the app can fix by itself (a missing id);
//! the rest are shown to you to sort out.

use serde::Serialize;

use crate::model::Kind;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Issue {
    /// The file has no `id:`. The loader made one up (`id`); fixing writes it.
    MissingId { path: String, id: String },
    /// Another item already uses this file's id (often a copied file).
    /// The loader gave this one a new `id`; fixing writes it.
    DuplicateId { path: String, id: String },
    /// A folder has no `_index.md`. Fixing creates one with this `id`.
    MissingIndex { path: String, id: String, kind: Kind },
    /// The file starts with `---` but never closes it. Not fixed automatically,
    /// because guessing where it should end could damage the text.
    UnclosedFrontmatter { path: String },
    /// A field has a value it doesn't accept, like `status: maybe`.
    InvalidValue {
        path: String,
        field: String,
        value: String,
    },
    /// The file or folder name can't be a title (for example it contains ":").
    InvalidName { path: String },
    /// The name works here but Windows can't store it (a "?" in it, say), so
    /// syncing to a Windows computer would fail. Rename it.
    NotPortable { path: String, reason: String },
    /// A project contains both milestone folders and task files.
    MixedChildren { path: String },
    /// A file is somewhere files aren't allowed, like directly inside an area.
    StrayFile { path: String },
    /// A folder is nested deeper than the hierarchy allows (inside a milestone).
    /// Its contents aren't loaded.
    TooDeep { path: String },
}

impl Issue {
    /// True if `fix::apply` can repair this without asking.
    pub fn is_fixable(&self) -> bool {
        matches!(
            self,
            Issue::MissingId { .. } | Issue::DuplicateId { .. } | Issue::MissingIndex { .. }
        )
    }

    /// The path the issue is about.
    pub fn path(&self) -> &str {
        match self {
            Issue::MissingId { path, .. }
            | Issue::DuplicateId { path, .. }
            | Issue::MissingIndex { path, .. }
            | Issue::UnclosedFrontmatter { path }
            | Issue::InvalidValue { path, .. }
            | Issue::InvalidName { path }
            | Issue::NotPortable { path, .. }
            | Issue::MixedChildren { path }
            | Issue::StrayFile { path }
            | Issue::TooDeep { path } => path,
        }
    }

    /// A one-line description for the UI, following the language rules.
    pub fn message(&self) -> String {
        match self {
            Issue::MissingId { .. } => "Missing id".into(),
            Issue::DuplicateId { .. } => "Same id as another item".into(),
            Issue::MissingIndex { kind, .. } => {
                format!("Folder has no _index.md, so this {} has no details", kind.name())
            }
            Issue::UnclosedFrontmatter { .. } => "Details block at the top is never closed with ---".into(),
            Issue::InvalidValue { field, value, .. } => format!("\"{value}\" isn't a valid {field}"),
            Issue::InvalidName { .. } => "Name contains characters titles can't use".into(),
            Issue::NotPortable { reason, .. } => format!("{reason}. Rename it to sync with Windows."),
            Issue::MixedChildren { .. } => {
                "Project has both milestones and tasks. Move its tasks into a milestone.".into()
            }
            Issue::StrayFile { .. } => "File is in a place where only folders belong".into(),
            Issue::TooDeep { .. } => "Folder is nested too deep. Its contents aren't shown.".into(),
        }
    }
}
