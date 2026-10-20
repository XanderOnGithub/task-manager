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
    /// Git sync kept the other computer's version of this item next to yours
    /// ("Sink (from other computer)"). Compare the two, keep what you want,
    /// then delete the copy.
    ConflictCopy { path: String, id: String },
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

    /// The item to open for this issue, when there is one.
    pub fn item_id(&self) -> Option<&str> {
        match self {
            Issue::ConflictCopy { id, .. } => Some(id),
            _ => None,
        }
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
            | Issue::ConflictCopy { path, .. }
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
            Issue::ConflictCopy { .. } => {
                "The other computer's version. Compare it with yours, keep what you want, then delete this copy.".into()
            }
            Issue::MixedChildren { .. } => {
                "Project has both milestones and tasks. Move its tasks into a milestone.".into()
            }
            Issue::StrayFile { .. } => "File is in a place where only folders belong".into(),
            Issue::TooDeep { .. } => "Folder is nested too deep. Its contents aren't shown.".into(),
        }
    }
}

/// An issue with everything the UI shows about it, so the wording lives in one
/// place (`Issue::message`) and the front end doesn't repeat it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueView {
    #[serde(flatten)]
    pub issue: Issue,
    /// What is wrong, one line.
    pub message: String,
    /// Moss repairs these itself while loading, so they rarely get this far.
    pub fixable: bool,
    /// An item that can be opened from the Issues view (the copy itself).
    pub item_id: Option<String>,
    /// What it is about, as a person would name it: the file or folder name
    /// without `.md` (a folder's `_index.md` is named after the folder).
    pub name: String,
}

impl From<&Issue> for IssueView {
    fn from(issue: &Issue) -> Self {
        let mut parts = issue.path().rsplit('/');
        let last = parts.next().unwrap_or_default();
        let name = if last == "_index.md" {
            parts.next().unwrap_or(last)
        } else {
            last
        };
        IssueView {
            issue: issue.clone(),
            message: issue.message(),
            fixable: issue.is_fixable(),
            item_id: issue.item_id().map(str::to_owned),
            name: name.strip_suffix(".md").unwrap_or(name).to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_view_names_the_thing_and_carries_the_wording() {
        let stray = Issue::StrayFile {
            path: "areas/Home/Notes.md".into(),
        };
        let view = IssueView::from(&stray);
        assert_eq!(view.name, "Notes");
        assert!(!view.fixable);
        assert_eq!(view.message, stray.message());

        // A folder's own file is named after the folder.
        let index = Issue::UnclosedFrontmatter {
            path: "areas/Home/Renovate/_index.md".into(),
        };
        assert_eq!(IssueView::from(&index).name, "Renovate");
    }

    #[test]
    fn the_json_has_the_kind_the_path_and_the_wording_side_by_side() {
        let json = serde_json::to_value(IssueView::from(&Issue::NotPortable {
            path: "areas/Why not?".into(),
            reason: "Title can't contain \"?\" (Windows doesn't allow it)".into(),
        }))
        .unwrap();
        assert_eq!(json["type"], "notPortable");
        assert_eq!(json["path"], "areas/Why not?");
        assert_eq!(json["name"], "Why not?");
        assert!(json["message"].as_str().unwrap().contains("Rename it"));
        assert_eq!(json["fixable"], false);
    }
}
