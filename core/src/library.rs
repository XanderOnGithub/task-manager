//! Loading the data folder into memory.
//!
//! The app never searches the disk while you click around. At startup it walks
//! the folder once, reads ONLY the frontmatter of each file, and builds a list of
//! `Item`s. Every view (list, board, sidebar) filters that list. When files change,
//! the watcher (see `watch.rs`) tells the app to load again.
//!
//! Where an item is decides what it is:
//!
//! ```text
//! areas/<Area>/                          area      (folder)
//! areas/<Area>/<Project>/                project   (folder)
//! areas/<Area>/<Project>/<Milestone>/    milestone (folder)
//! .../<Task>.md                          task      (file in a project or milestone)
//! areas/<Area>/Pages/<Page>.md           page      (file, or folder with subpages)
//! areas/<Area>/<Project>/Pages/<Page>.md page that belongs to a project
//! ```
//!
//! `Pages` is a plain folder, not an item: it just keeps an area's or a
//! project's pages apart from its projects or milestones. That's why no project
//! or milestone may be called "Pages".

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde::Serialize;

use crate::frontmatter::{self, Frontmatter};
use crate::id;
use crate::issues::Issue;
use crate::model::{is_icon, Item, Kind, MILESTONE_COLORS};
use crate::names;
use crate::order;
use crate::repeat::Repeat;

/// Folder names inside the data folder.
pub const AREAS_DIR: &str = "areas";
/// The folder inside an area or project that holds its pages.
pub const PAGES_DIR: &str = "Pages";
pub const UNSORTED_FILE: &str = "unsorted.md";
pub const INDEX_FILE: &str = "_index.md";

/// Everything in the data folder, in memory.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    /// The data folder on disk.
    #[serde(skip)]
    pub root: PathBuf,
    /// Every item, in the order they were found (parents before children).
    pub items: Vec<Item>,
    /// Problems found while loading.
    pub issues: Vec<Issue>,
    /// id → position in `items`, for fast lookups.
    #[serde(skip)]
    by_id: HashMap<String, usize>,
}

impl Library {
    /// Reads the whole data folder. A missing `areas/` folder just means
    /// there's nothing there yet. Only fails if the folder itself can't be
    /// read.
    pub fn load(root: impl Into<PathBuf>) -> io::Result<Library> {
        let mut library = Library {
            root: root.into(),
            items: Vec::new(),
            issues: Vec::new(),
            by_id: HashMap::new(),
        };
        // Fail early with a clear error if the data folder itself is missing.
        fs::metadata(&library.root)?;

        library.load_areas()?;
        Ok(library)
    }

    /// Looks up an item by id.
    pub fn get(&self, id: &str) -> Option<&Item> {
        self.by_id.get(id).map(|&i| &self.items[i])
    }

    /// The direct children of `parent`, in display order.
    ///
    /// `parent: None` means the top level (the areas). An area or project
    /// holds two separate lists, its pages and everything else, so `pages`
    /// picks which one you mean.
    pub fn children(&self, parent: Option<&str>, pages: bool) -> Vec<&Item> {
        let mut children: Vec<&Item> = self
            .items
            .iter()
            .filter(|item| item.parent.as_deref() == parent && item.kind.is_page() == pages)
            .collect();
        sort_for_display(&mut children);
        children
    }

    /// True if `ancestor` is `id` itself or contains it at any depth.
    pub fn is_within(&self, id: &str, ancestor: &str) -> bool {
        let mut current = Some(id.to_owned());
        while let Some(cur) = current {
            if cur == ancestor {
                return true;
            }
            current = self.get(&cur).and_then(|item| item.parent.clone());
        }
        false
    }

    /// Absolute path for a path stored in an item (`areas/Home/...`).
    pub fn abs(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    // ---------------------------------------------------------------------
    // Loading
    // ---------------------------------------------------------------------

    /// Loads `areas/`: every folder in it is an area.
    fn load_areas(&mut self) -> io::Result<()> {
        let dir = self.root.join(AREAS_DIR);
        if !dir.is_dir() {
            return Ok(());
        }
        for entry in sorted_entries(&dir)? {
            let rel = format!("{AREAS_DIR}/{}", entry.name);
            if entry.is_dir {
                self.load_folder(&rel, Kind::Area, None)?;
            } else {
                // Only area folders belong directly in areas/.
                self.issues.push(Issue::StrayFile { path: rel });
            }
        }
        Ok(())
    }

    /// Loads a `Pages` folder: each file or folder in it is a page whose
    /// parent is `owner` (the area or project the folder is in).
    fn load_pages(&mut self, rel: &str, owner: &str) -> io::Result<()> {
        for entry in sorted_entries(&self.root.join(rel))? {
            let child_rel = format!("{rel}/{}", entry.name);
            if entry.is_dir {
                self.load_folder(&child_rel, Kind::Page, Some(owner.to_owned()))?;
            } else {
                self.load_file(&child_rel, Kind::Page, Some(owner.to_owned()));
            }
        }
        Ok(())
    }

    /// Loads a folder item and everything inside it.
    fn load_folder(&mut self, rel: &str, kind: Kind, parent: Option<String>) -> io::Result<()> {
        let index_rel = format!("{rel}/{INDEX_FILE}");
        let fm = if self.root.join(&index_rel).is_file() {
            self.read_meta(&index_rel)
        } else {
            // No _index.md: still show the folder, and offer to create the file.
            let id = self.unused_id();
            self.issues.push(Issue::MissingIndex {
                path: rel.to_owned(),
                id: id.clone(),
                kind,
            });
            Some(Frontmatter::with_id(&id))
        };
        let id = self.add_item(rel, &index_rel, kind, true, parent, fm);

        let mut has_folders = false;
        let mut has_files = false;
        for entry in sorted_entries(&self.root.join(rel))? {
            if entry.name == INDEX_FILE {
                continue;
            }
            let child_rel = format!("{rel}/{}", entry.name);
            // An area's or project's pages. Not an item itself, and it doesn't
            // count as a milestone when checking a project's children.
            if entry.is_dir && entry.name == PAGES_DIR && has_pages(kind) {
                self.load_pages(&child_rel, &id)?;
                continue;
            }
            if entry.is_dir {
                has_folders = true;
                match kind.child_folder_kind() {
                    Some(child_kind) => self.load_folder(&child_rel, child_kind, Some(id.clone()))?,
                    None => self.issues.push(Issue::TooDeep { path: child_rel }),
                }
            } else {
                has_files = true;
                match kind.child_file_kind() {
                    Some(child_kind) => self.load_file(&child_rel, child_kind, Some(id.clone())),
                    None => self.issues.push(Issue::StrayFile { path: child_rel }),
                }
            }
        }

        if kind == Kind::Project && has_folders && has_files {
            self.issues.push(Issue::MixedChildren { path: rel.to_owned() });
        }
        Ok(())
    }

    /// Loads a single `.md` file item.
    fn load_file(&mut self, rel: &str, kind: Kind, parent: Option<String>) {
        let fm = self.read_meta(rel);
        self.add_item(rel, rel, kind, false, parent, fm);
    }

    /// Reads frontmatter, turning read problems into issues.
    /// `None` means the file couldn't be parsed (an issue was recorded).
    fn read_meta(&mut self, rel: &str) -> Option<Frontmatter> {
        match frontmatter::read_frontmatter(&self.root.join(rel)) {
            Ok(Ok(fm)) => Some(fm),
            Ok(Err(_unclosed)) => {
                self.issues
                    .push(Issue::UnclosedFrontmatter { path: rel.to_owned() });
                None
            }
            Err(_io_error) => {
                // The file vanished or can't be read mid-load (e.g. a sync tool is
                // writing it). Treat it like an unreadable block; the watcher will
                // trigger another load.
                self.issues
                    .push(Issue::UnclosedFrontmatter { path: rel.to_owned() });
                None
            }
        }
    }

    /// Builds an `Item` from its location and frontmatter, checks every field,
    /// and adds it. Returns the item's id.
    fn add_item(
        &mut self,
        rel: &str,
        meta_rel: &str,
        kind: Kind,
        is_folder: bool,
        parent: Option<String>,
        fm: Option<Frontmatter>,
    ) -> String {
        let parsed = fm.is_some();
        let fm = fm.unwrap_or_default();

        // Title comes from the file or folder name.
        let name = rel.rsplit('/').next().unwrap_or(rel);
        let title = if is_folder {
            name
        } else {
            name.strip_suffix(".md").unwrap_or(name)
        };
        if names::check_existing(title).is_err() {
            self.issues.push(Issue::InvalidName { path: rel.to_owned() });
        } else if let Some(reason) = names::portable_problem(title) {
            self.issues.push(Issue::NotPortable {
                path: rel.to_owned(),
                reason,
            });
        }

        // Id: use the file's, unless it's missing or already taken.
        let id = match fm.get("id") {
            Some(existing) => match self.by_id.get(existing).copied() {
                None => existing.to_owned(),
                // Two files share an id, usually because one is a copy. The older
                // file is the original and keeps the id; the copy gets a new one.
                Some(other) if self.is_older(meta_rel, &self.items[other].meta_path()) => {
                    self.give_new_id(other);
                    existing.to_owned()
                }
                Some(_) => {
                    let id = self.unused_id();
                    self.issues.push(Issue::DuplicateId {
                        path: meta_rel.to_owned(),
                        id: id.clone(),
                    });
                    id
                }
            },
            None => {
                let id = self.unused_id();
                // Only offer to write an id if we could read the block; otherwise
                // writing could damage the file.
                if parsed {
                    self.issues.push(Issue::MissingId {
                        path: meta_rel.to_owned(),
                        id: id.clone(),
                    });
                }
                id
            }
        };

        // Git sync's "(from other computer)" copies are listed as Issues until
        // you've looked at them and deleted them.
        if names::is_conflict_copy(title) {
            self.issues.push(Issue::ConflictCopy {
                path: rel.to_owned(),
                id: id.clone(),
            });
        }

        // Each field is checked; a bad value becomes an issue and is ignored.
        let mut check = |field: &str, ok: &dyn Fn(&str) -> bool| -> Option<String> {
            let value = fm.get(field)?;
            if ok(value) {
                Some(value.to_owned())
            } else {
                self.issues.push(Issue::InvalidValue {
                    path: meta_rel.to_owned(),
                    field: field.to_owned(),
                    value: value.to_owned(),
                });
                None
            }
        };

        let status = if kind.statuses().is_empty() {
            None
        } else {
            check("status", &|v| kind.statuses().contains(&v))
                .or_else(|| kind.default_status().map(str::to_owned))
        };
        let order = check("order", &|v| order::is_valid(v));
        let created = check("created", &is_date);
        let due = check("due", &is_date);
        let color = if kind == Kind::Milestone {
            check("color", &|v| MILESTONE_COLORS.contains(&v))
        } else {
            None
        };
        let repeat = if kind == Kind::Task {
            check("repeat", &|v| Repeat::parse(v).is_some())
        } else {
            None
        };
        let icon = if kind == Kind::Page {
            check("icon", &is_icon)
        } else {
            None
        };

        self.by_id.insert(id.clone(), self.items.len());
        self.items.push(Item {
            id: id.clone(),
            kind,
            title: title.to_owned(),
            path: rel.to_owned(),
            is_folder,
            parent,
            status,
            order,
            created,
            due,
            color,
            icon,
            repeat,
        });
        id
    }

    /// A new id that no loaded item uses.
    fn unused_id(&self) -> String {
        id::new_unique_id(|candidate| self.by_id.contains_key(candidate))
    }

    /// True if file `a` was created before file `b`. Uses the creation time where
    /// the system has one (macOS does), otherwise the last-modified time. If
    /// neither can be read, says no, so the first file loaded keeps the id.
    fn is_older(&self, a: &str, b: &str) -> bool {
        let time = |rel: &str| {
            let meta = fs::metadata(self.root.join(rel)).ok()?;
            meta.created().or_else(|_| meta.modified()).ok()
        };
        matches!((time(a), time(b)), (Some(ta), Some(tb)) if ta < tb)
    }

    /// Gives an already-loaded item a new id (it turned out to be the copy), and
    /// points its children at the new id.
    ///
    /// Folders are loaded depth-first, so any item loaded so far whose parent is
    /// the old id must be inside this item.
    fn give_new_id(&mut self, index: usize) {
        let old = self.items[index].id.clone();
        let new = self.unused_id();
        self.by_id.remove(&old);
        self.by_id.insert(new.clone(), index);
        self.items[index].id = new.clone();
        for item in &mut self.items {
            if item.parent.as_deref() == Some(old.as_str()) {
                item.parent = Some(new.clone());
            }
        }
        let path = self.items[index].meta_path();
        self.issues.push(Issue::DuplicateId { path, id: new });
    }
}

impl Frontmatter {
    /// Frontmatter with just an id, used for folders missing `_index.md`.
    fn with_id(id: &str) -> Frontmatter {
        let mut fm = Frontmatter::default();
        fm.set("id", Some(id));
        fm
    }
}

/// Areas and projects can have pages (in a `Pages` folder).
pub fn has_pages(kind: Kind) -> bool {
    matches!(kind, Kind::Area | Kind::Project)
}

/// Display order: items with an order key first (by key), then the rest by title.
pub fn sort_for_display(items: &mut [&Item]) {
    items.sort_by(|a, b| match (&a.order, &b.order) {
        (Some(x), Some(y)) => x.cmp(y).then_with(|| a.title.cmp(&b.title)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
    });
}

/// True for a real calendar date written as `YYYY-MM-DD`.
pub fn is_date(value: &str) -> bool {
    value.len() == 10 && NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

/// A directory entry we care about.
struct Entry {
    name: String,
    is_dir: bool,
}

/// Lists a folder: visible folders and `.md` files only, sorted by name so loads
/// are predictable. Hidden entries (`.trash`, `.DS_Store`) and other files
/// (images attached to pages) are skipped.
fn sorted_entries(dir: &Path) -> io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let Ok(name) = entry.file_name().into_string() else {
            continue; // not valid UTF-8; can't be shown as a title anyway
        };
        if name.starts_with('.') {
            continue;
        }
        // file_type() doesn't follow symlinks; metadata() does, so a symlinked
        // folder counts as a folder.
        let is_dir = match entry.file_type() {
            Ok(t) if t.is_symlink() => entry.path().is_dir(),
            Ok(t) => t.is_dir(),
            Err(_) => continue,
        };
        if is_dir || name.ends_with(".md") {
            entries.push(Entry { name, is_dir });
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}
