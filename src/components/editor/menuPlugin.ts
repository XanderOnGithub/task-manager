// A tiny ProseMirror plugin that lets React draw the editor's menus.
// It reports every editor update (typing, selection changes) and offers React
// first pick of key presses, so the "/" menu can use the arrow keys and Enter.

import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

export interface MenuBridge {
  update: (view: EditorView) => void
  /** Return true to take the key (the editor then ignores it). */
  keyDown: (view: EditorView, event: KeyboardEvent) => boolean
}

export function menuPlugin(bridge: MenuBridge) {
  return $prose(
    () =>
      new Plugin({
        key: new PluginKey('moss-menus'),
        view: (view) => {
          bridge.update(view)
          return { update: (v) => bridge.update(v) }
        },
        props: { handleKeyDown: (view, event) => bridge.keyDown(view, event) },
      }),
  )
}
