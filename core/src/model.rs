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
    Page,
}

impl Kind {
    /// The statuses each kind accepts. The first one is the default.
    /// Areas and pages have no status.
    ///
    /// Tasks have two optional ones the app can show as extra lanes:
    /// `later` (not up next) and `waiting` (held up by someone or something).
    /// They're always accepted here, so turning a lane off in the app never
    /// makes a file invalid.
    pub fn statuses(self) -> &'static [&'static str] {
        match self {
            Kind::Task => &["todo", "doing", "done", "later", "waiting"],
            Kind::Milestone => &["open", "done"],
            Kind::Project => &["active", "paused", "done", "dropped"],
            Kind::Area | Kind::Page => &[],
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
            Kind::Page => "page",
        }
    }

    /// Pages sit beside the task hierarchy rather than in it: an area holds
    /// projects AND pages, and the two are listed separately.
    pub fn is_page(self) -> bool {
        self == Kind::Page
    }

    /// What a FOLDER inside an item of this kind is.
    /// `None` means folders aren't allowed there.
    ///
    /// (A folder named `Pages` inside an area or project is the exception: it
    /// holds that item's pages. See `PAGES_DIR` in library.rs.)
    pub fn child_folder_kind(self) -> Option<Kind> {
        match self {
            Kind::Area => Some(Kind::Project),
            Kind::Project => Some(Kind::Milestone),
            Kind::Page => Some(Kind::Page),
            Kind::Milestone | Kind::Task => None,
        }
    }

    /// What a `.md` FILE inside an item of this kind is.
    /// `None` means files aren't allowed there.
    pub fn child_file_kind(self) -> Option<Kind> {
        match self {
            Kind::Project | Kind::Milestone => Some(Kind::Task),
            Kind::Page => Some(Kind::Page),
            Kind::Area | Kind::Task => None,
        }
    }
}

/// The milestone colors. Stored by name (`color: dusty-blue`) so the actual
/// shade can change in tokens.css without touching any files.
pub const MILESTONE_COLORS: &[&str] = &["dusty-blue", "mauve", "rose", "teal", "lavender", "sand"];

/// One area, project, milestone, task or page, as the app sees it.
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
    /// `areas/Home/Renovate the house`. For folder items this is the folder.
    pub path: String,
    /// True for items that are folders (with an `_index.md` inside).
    pub is_folder: bool,
    /// Id of the containing item. `None` only for areas. A page's parent is
    /// the area, project or page it sits in.
    pub parent: Option<String>,
    /// `todo`, `doing`, ... `None` only for areas and pages.
    pub status: Option<String>,
    /// Manual sort key (see `order.rs`). `None` if the file doesn't have one yet.
    pub order: Option<String>,
    /// `YYYY-MM-DD`.
    pub created: Option<String>,
    /// `YYYY-MM-DD`.
    pub due: Option<String>,
    /// Milestones only: one of `MILESTONE_COLORS`.
    pub color: Option<String>,
    /// Pages only: an emoji shown next to the title (`icon: 🌿`).
    pub icon: Option<String>,
    /// Tasks only: how often it comes back (`repeat: weekly`, see `repeat.rs`).
    pub repeat: Option<String>,
    /// Tasks only: ids of tasks this one waits on (`blocked_by: ID1, ID2`, see `blockers.rs`).
    /// Ids of deleted tasks may linger; the app ignores them.
    pub blocked_by: Vec<String>,
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

/// Is `value` usable as a page icon? One emoji, which can be several
/// characters joined together (👩‍💻 is three), so allow a few, but no spaces,
/// and nothing long. This only checks the shape, not that it's an emoji.
pub fn is_icon(value: &str) -> bool {
    let count = value.chars().count();
    count > 0 && count <= 8 && !value.chars().any(|c| c.is_whitespace() || c.is_control())
}
