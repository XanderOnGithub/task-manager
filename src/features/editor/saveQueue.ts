// Saving the editor's text without losing any of it.
//
// The editor produces text all the time; the disk takes one write at a time and
// a write can fail. This keeps three things straight:
//
// - `saved`: the text we know is on disk.
// - `pending`: the newest text that isn't on disk yet. It stays here until a
//   write of it (or of something newer) succeeds, so a failed save is never
//   forgotten: it is retried, and the editor still counts as "unsaved".
// - writes happen one at a time, in order, so an old write can't land after a
//   newer one.

/** How long typing has to pause before the text saves on its own. */
export const SAVE_AFTER_MS = 800
/** How long to wait before trying a failed save again. */
export const RETRY_AFTER_MS = 3000

export class SaveQueue {
  /** The text on disk, as far as we know. */
  saved: string
  /** The latest text that still needs saving, or null. */
  pending: string | null = null

  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private failing = false
  private closed = false
  private readonly write: (text: string) => Promise<unknown>
  private readonly onError: (error: unknown) => void

  /**
   * `initial` is the text on disk now. `write` saves a text and rejects when it
   * couldn't. `onError` is called once when saving starts failing (not again
   * until a save has worked).
   */
  constructor(initial: string, write: (text: string) => Promise<unknown>, onError: (error: unknown) => void = () => {}) {
    this.saved = initial
    this.write = write
    this.onError = onError
  }

  /** True while there is text that isn't safely on disk. */
  get dirty(): boolean {
    return this.pending !== null || this.running !== null
  }

  /** The editor changed: save `text` after a short pause in typing. */
  edit(text: string, delay = SAVE_AFTER_MS) {
    this.pending = text
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  /** The file changed somewhere else and nothing here is waiting to save: take its text as the saved one. */
  adopt(text: string) {
    this.saved = text
  }

  /** Saves now (blur, closing). Resolves when everything pending has been tried. */
  flush(): Promise<void> {
    clearTimeout(this.timer)
    this.running ??= this.drain().finally(() => {
      this.running = null
    })
    return this.running
  }

  /**
   * The editor is going away: stop the timers, and don't retry a save that
   * fails from here on (the error is still reported). Call after a last `flush()`.
   */
  dispose() {
    this.closed = true
    clearTimeout(this.timer)
  }

  private async drain() {
    while (this.pending !== null) {
      const text = this.pending
      if (text === this.saved) {
        this.pending = null
        break
      }
      try {
        await this.write(text)
      } catch (error) {
        // Keep `pending` (or whatever newer text arrived) and try again later.
        if (!this.failing) this.onError(error)
        this.failing = true
        clearTimeout(this.timer)
        if (!this.closed) this.timer = setTimeout(() => void this.flush(), RETRY_AFTER_MS)
        return
      }
      this.failing = false
      this.saved = text
      // Typing may have gone on during the write: only a write of the newest text clears it.
      if (this.pending === text) this.pending = null
    }
  }
}
