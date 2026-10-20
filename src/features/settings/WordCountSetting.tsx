// Settings → Word count: the count in a page's bottom-right corner.

import { usePref } from '../../platform/prefs'
import { Switch } from '../../shared/controls'

/** Pages: the word and character count in the bottom-right corner. */
export function WordCountSetting() {
  const [on, setOn] = usePref('wordCount', true)
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-meta text-fg-2">Word count</span>
        <span className="text-meta font-normal text-fg-3">
          Words and characters in the corner of a page. Select text to count just that.
        </span>
      </div>
      <Switch label="Word count" checked={on} onChange={setOn} />
    </div>
  )
}
