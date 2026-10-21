// How a repeating task is named on screen. The words on disk are in
// core/src/repeat.rs: "daily", "weekly", "monthly", "yearly", "every 2 weeks".

/** The choices offered in the details panel: label and the words stored. */
export const REPEAT_CHOICES: { label: string; value: string | null }[] = [
  { label: 'Never', value: null },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]

/** "Never", "Weekly", "Every 2 weeks": for a field. */
export function repeatLabel(repeat: string | null): string {
  if (!repeat) return 'Never'
  return repeat[0].toUpperCase() + repeat.slice(1)
}

/** "Repeats weekly", "Repeats every 2 weeks": for a tooltip or a screen reader. */
export function repeatPhrase(repeat: string): string {
  return `Repeats ${repeat}`
}
