//! Repeating tasks: "weekly", "every 2 weeks", and what date comes next.
//!
//! A task with `repeat: weekly` in its frontmatter doesn't stay done. When you
//! finish it, it goes back to Todo with its due date moved to the next
//! occurrence (see `ops::set_status`). The words on disk are meant to be read
//! and typed by a person:
//!
//! ```text
//! repeat: daily            every day
//! repeat: weekly           every week          (monthly, yearly likewise)
//! repeat: every 2 weeks    every N days, weeks, months or years
//! ```

use chrono::{Duration, Months, NaiveDate};

/// The biggest `N` in "every N weeks". Keeps date arithmetic far from overflow.
const MAX_EVERY: u32 = 999;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Unit {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Repeat {
    every: u32,
    unit: Unit,
}

impl Repeat {
    /// Reads the words on disk. Case doesn't matter; anything else is `None`.
    pub fn parse(text: &str) -> Option<Repeat> {
        let text = text.trim().to_lowercase();
        let one = |unit| Some(Repeat { every: 1, unit });
        match text.as_str() {
            "daily" | "every day" => return one(Unit::Day),
            "weekly" | "every week" => return one(Unit::Week),
            "monthly" | "every month" => return one(Unit::Month),
            "yearly" | "every year" => return one(Unit::Year),
            _ => {}
        }
        // "every 2 weeks"
        let rest = text.strip_prefix("every ")?;
        let (n, unit) = rest.split_once(' ')?;
        let every: u32 = n.parse().ok().filter(|n| (1..=MAX_EVERY).contains(n))?;
        let unit = match unit.trim_end_matches('s') {
            "day" => Unit::Day,
            "week" => Unit::Week,
            "month" => Unit::Month,
            "year" => Unit::Year,
            _ => return None,
        };
        Some(Repeat { every, unit })
    }

    /// The canonical words: "weekly", or "every 2 weeks".
    pub fn text(&self) -> String {
        let (single, plural) = match self.unit {
            Unit::Day => ("daily", "days"),
            Unit::Week => ("weekly", "weeks"),
            Unit::Month => ("monthly", "months"),
            Unit::Year => ("yearly", "years"),
        };
        if self.every == 1 {
            single.to_owned()
        } else {
            format!("every {} {plural}", self.every)
        }
    }

    /// The `k`-th occurrence after `start`. Months and years are counted from
    /// `start` each time (not from the previous result), so a task due on the
    /// 31st comes back on the 28th in February and the 31st again after it.
    fn nth_after(&self, start: NaiveDate, k: u32) -> Option<NaiveDate> {
        let steps = self.every.checked_mul(k)?;
        match self.unit {
            Unit::Day => start.checked_add_signed(Duration::days(i64::from(steps))),
            Unit::Week => start.checked_add_signed(Duration::weeks(i64::from(steps))),
            Unit::Month => start.checked_add_months(Months::new(steps)),
            Unit::Year => start.checked_add_months(Months::new(steps.checked_mul(12)?)),
        }
    }

    /// The next due date after finishing the task on `today`.
    ///
    /// It follows the schedule, not the day you got round to it: a weekly task
    /// due last Monday and finished today comes back next Monday, not seven
    /// days from today. A task with no due date repeats from today. The result
    /// is always after `today`.
    pub fn next_due(&self, due: Option<NaiveDate>, today: NaiveDate) -> NaiveDate {
        let start = due.unwrap_or(today);
        (1..)
            .map_while(|k| self.nth_after(start, k))
            .find(|date| *date > today)
            // Only reachable at the end of the calendar; stay put rather than panic.
            .unwrap_or(start)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn reads_the_words_and_writes_them_back() {
        for (input, canonical) in [
            ("daily", "daily"),
            ("Weekly", "weekly"),
            (" every week ", "weekly"),
            ("every 2 weeks", "every 2 weeks"),
            ("every 1 month", "monthly"),
            ("every 3 Months", "every 3 months"),
            ("every 10 days", "every 10 days"),
            ("yearly", "yearly"),
        ] {
            assert_eq!(Repeat::parse(input).unwrap().text(), canonical, "{input}");
        }
        for bad in [
            "",
            "sometimes",
            "every",
            "every 0 days",
            "every x days",
            "every 2 fortnights",
            "every 1000 days",
            "every -1 days",
        ] {
            assert!(Repeat::parse(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn the_next_date_follows_the_schedule() {
        let weekly = Repeat::parse("weekly").unwrap();
        // On time: a week after the due date.
        assert_eq!(
            weekly.next_due(Some(date("2026-10-20")), date("2026-10-20")),
            date("2026-10-27")
        );
        // Early: still the next one on the schedule.
        assert_eq!(
            weekly.next_due(Some(date("2026-10-27")), date("2026-10-20")),
            date("2026-11-03")
        );
        // Late by ten days: the next Tuesday after today, not seven days from today.
        assert_eq!(
            weekly.next_due(Some(date("2026-10-20")), date("2026-10-30")),
            date("2026-11-03")
        );
        // No due date: from today.
        assert_eq!(weekly.next_due(None, date("2026-10-20")), date("2026-10-27"));
    }

    #[test]
    fn the_result_is_always_after_today() {
        let daily = Repeat::parse("daily").unwrap();
        assert_eq!(
            daily.next_due(Some(date("2026-10-20")), date("2026-10-20")),
            date("2026-10-21")
        );
        assert_eq!(
            daily.next_due(Some(date("2026-01-01")), date("2026-10-20")),
            date("2026-10-21")
        );
    }

    #[test]
    fn months_keep_their_day_of_the_month() {
        let monthly = Repeat::parse("monthly").unwrap();
        // The 31st: February has fewer days, March goes back to the 31st.
        let feb = monthly.next_due(Some(date("2026-01-31")), date("2026-01-31"));
        assert_eq!(feb, date("2026-02-28"));
        let mar = monthly.next_due(Some(date("2026-01-31")), date("2026-02-28"));
        assert_eq!(mar, date("2026-03-31"));
        assert_eq!(
            Repeat::parse("yearly")
                .unwrap()
                .next_due(Some(date("2024-02-29")), date("2024-03-01")),
            date("2025-02-28")
        );
    }
}
