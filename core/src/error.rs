//! Errors returned by write operations.
//!
//! Reading the data folder never fails because of bad data: problems found while
//! loading become `Issue`s (see `issues.rs`) so the app can still open. Errors here
//! are for actions the app asked for that could not happen, like moving a task
//! into an area.
//!
//! The messages follow the app's language rules, because the UI shows them as-is.

use std::fmt;
use std::io;

#[derive(Debug)]
pub enum Error {
    /// The operating system refused a file operation (permissions, disk full, ...).
    Io(io::Error),
    /// No item has this id. Usually the file was deleted outside the app.
    NotFound(String),
    /// The title can't be used as a file or folder name.
    InvalidName(String),
    /// Something with this name already exists in the same place.
    NameTaken(String),
    /// The move or create would break a hierarchy rule.
    NotAllowed(String),
    /// A field was given a value it doesn't accept, like `status: maybe`.
    InvalidValue { field: String, value: String },
    /// The file changed on disk since it was read, so nothing was written.
    Changed(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "Couldn't change the file: {e}"),
            Error::NotFound(id) => write!(f, "Item not found ({id})"),
            Error::InvalidName(reason) => write!(f, "{reason}"),
            Error::NameTaken(name) => write!(f, "\"{name}\" already exists here"),
            Error::NotAllowed(reason) => write!(f, "{reason}"),
            Error::InvalidValue { field, value } => {
                write!(f, "\"{value}\" isn't a valid {field}")
            }
            Error::Changed(what) => write!(f, "{what} changed on disk. Try again."),
        }
    }
}

impl std::error::Error for Error {}

// This is what lets `?` turn an io::Error into our Error automatically.
impl From<io::Error> for Error {
    fn from(e: io::Error) -> Self {
        Error::Io(e)
    }
}

/// Shorthand used by every write operation.
pub type Result<T> = std::result::Result<T, Error>;
