//! The kinds of things in the data folder and what an item looks like in memory.

use serde::{Deserialize, Serialize};

/// The fixed vocabulary. Never add a synonym here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Area,
    Project,
    Milestone,
    Task,
    Note,
}

impl Kind {
    /// The statuses each kind accepts. The first one is the default.
    /// Areas and notes have no status.
    pub fn statuses(self) -> &'static [&'static str] {
        match self {
            Kind::Task => &["todo", "doing", "done"],
            Kind::Milestone => &["open", "done"],
            Kind::Project => &["active", "paused", "done", "dropped"],
            Kind::Area | Kind::Note => &[],
        }
    }

    /// The status a new item of this kind starts with.
    pub fn default_status(self) -> Option<&'static str> {
        self.statuses().first().copied()
    }

    /// Lowercase name, as used in messages ("a task", "a milestone").
    pub fn name(self) -> &'static str {
        match self {
            Kind::Area => "area",
            Kind::Project => "project",
            Kind::Milestone => "milestone",
            Kind::Task => "task",
            Kind::Note => "note",
        }
    }

    /// Notes live under `notes/`, everything else under `tasks/`.
    pub fn is_note(self) -> bool {
        self == Kind::Note
    }

    /// What a FOLDER inside an item of this kind is.
    /// `None` means folders aren't allowed there.
    pub fn child_folder_kind(self) -> Option<Kind> {
        match self {
            Kind::Area => Some(Kind::Project),
            Kind::Project => Some(Kind::Milestone),
            Kind::Note => Some(Kind::Note),
            Kind::Milestone | Kind::Task => None,
        }
    }

    /// What a `.md` FILE inside an item of this kind is.
    /// `None` means files aren't allowed there.
    pub fn child_file_kind(self) -> Option<Kind> {
        match self {
            Kind::Project | Kind::Milestone => Some(Kind::Task),
            Kind::Note => Some(Kind::Note),
            Kind::Area | Kind::Task => None,
        }
    }
}

/// The milestone colors. Stored by name (`color: dusty-blue`) so the actual
/// shade can change in tokens.css without touching any files.
pub const MILESTONE_COLORS: &[&str] = &["dusty-blue", "mauve", "rose", "teal", "lavender", "sand"];

/// One area, project, milestone, task or note, as the app sees it.
///
/// This is built from the file's location and frontmatter. The body (the text
/// under the frontmatter) is NOT kept here: it's only read when an item is
/// opened, which keeps loading fast.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Stable id from the `id:` field.
    pub id: String,
    /// Worked out from where the file is, never stored in the file.
    pub kind: Kind,
    /// The file or folder name, without `.md`.
    pub title: String,
    /// Location inside the data folder, always with `/`, e.g.
    /// `tasks/Home/Renovate the house`. For folder items this is the folder.
    pub path: String,
    /// True for items that are folders (with an `_index.md` inside).
    pub is_folder: bool,
    /// Id of the containing item. `None` for areas and top-level notes.
    pub parent: Option<String>,
    /// `todo`, `doing`, ... `None` only for areas and notes.
    pub status: Option<String>,
    /// Manual sort key (see `order.rs`). `None` if the file doesn't have one yet.
    pub order: Option<String>,
    /// `YYYY-MM-DD`.
    pub created: Option<String>,
    /// `YYYY-MM-DD`.
    pub due: Option<String>,
    /// Milestones only: one of `MILESTONE_COLORS`.
    pub color: Option<String>,
}

impl Item {
    /// The file that holds this item's frontmatter and body.
    pub fn meta_path(&self) -> String {
        if self.is_folder {
            format!("{}/_index.md", self.path)
        } else {
            self.path.clone()
        }
    }
}
