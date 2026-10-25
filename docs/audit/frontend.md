# Front-end audit: `src/`

Done on 2026-10-23. What was read in full, line by line: `App.tsx`, all of `app/`,
`platform/os.ts`, `prefs.ts`, `domain/items.ts`, the shared controls (`InlineAdd`,
`EditableTitle`, `Segmented`, `Switch`, `DateField`, `Modal`, the modal layer, `ui.tsx`,
`drag.ts`), `Sidebar`, `ScopeView`, `DetailsPanel`, `Board`, `Unsorted`, `QuickCapture`,
the editor's save path (`saveQueue`, `useBody`, `BodyEditor`), and the styles
(`tokens.css`, `base.css`, `motion.css`). The rest was checked by machine: lint
(jsx-a11y), the 427 tests, the axe-core audit (`pnpm a11y`, now also at phone size),
and searches for hard-coded colors, off-token sizes, hand-written durations,
hover-only controls, fixed widths and icon-only buttons without names. The
remaining feature files (`AreaTree`, `PageTree`, `Pages`, `CommandPalette`, the
settings tabs, `MarkdownEditor`, `EditorMenus`, `Onboarding`) were read only where
the changes below touched them.

## Fixed

| Where | Problem | Fix |
|---|---|---|
| `InlineAdd`, `EditableTitle`, `QuickCapture` | The field cleared (or the dialog closed) whether or not the save worked. A refused name ("already exists") or a failed write threw away what was typed. CLAUDE.md: never lose what someone wrote. | `actions.run` now returns `undefined` only on failure; these controls take `Promise<boolean>` and keep the text on `false`. TypeScript made every caller (10) change. Tests in `shared/controls/keepsText.test.tsx`. |
| `useLibrary.reload` | Two reloads in flight (a change while a sync lands) could finish out of order, and the older answer replaced the newer. | Each reload takes a number; only the newest is used. Test: `app/useLibrary.test.tsx` (fails without the fix). |
| `useActions.describeInside` | For every item inside a deleted folder it scanned the whole library: deleting an area with thousands of tasks did millions of comparisons before the confirm dialog. | Asks the existing index (`childrenOf`). |
| Unsorted bulk delete | One action per entry: N toasts, N Undo buttons, N reloads. | `actions.removeEntries`: one toast, one Undo. |
| `App.tsx` | Side effects (sound, saving a preference) ran inside state updaters, which React may run twice; the sidebar toggle was written out twice. | `useGlobalShortcuts` hook; one `toggleSidebar`; the preference saves from an effect. |
| Type sizes | `text-[12.5px]` (12 times) and `text-[14px]` (6) bypassed `tokens.css`. | Named tokens `text-compact` and `text-lead`; same size, now in the token file. |
| `BlockersField` | The menu button's accessible name ("Add a task to wait on") did not contain its visible text ("Choose a task"). Voice control could not say it. axe: `label-content-name-mismatch`. The old audit never opened the details panel. | Name starts with the visible words; the audit now opens the details panel. |
| Drag and drop on touch | `PointerSensor` with a 4px threshold: on a touch screen the browser starts scrolling first, so rows could not be dragged. | `MouseSensor` (4px) + `TouchSensor` (hold 250ms): a swipe scrolls, a long press picks up. |
| Narrow windows | Below about 900px the layout broke: a fixed 244px sidebar and 340px details panel left no room (titles cut to one letter). | See "Responsive" below. |
| Scripts | The mock backend was inside `a11y-audit.mjs`. | `scripts/lib/mockApp.mjs`, shared with the new `scripts/screenshots.mjs`. |

## Responsive (under 768px, `max-md:` in CSS, `useCompact()` in code)

- The sidebar becomes a **drawer** (`shared/Drawer.tsx`): opened from a menu button at the start of every panel header (`CompactNavContext`), a dialog like any other (focus trap, inert background, Escape, focus restore).
- The details panel becomes a **sheet** (`shared/Sheet.tsx`) that rises from the bottom; pull its handle down to close.
- A **bottom bar** (`BottomNav`): Unsorted, Today, Quick capture (round, centered), Tasks, Pages.
- Touch (`pointer: coarse`): list rows 44px (`--spacing-row`), every small control gets an invisible 44px tap area (`base.css`), hover-only controls are always visible, key hints are hidden, the board snaps column to column, dialogs fit the width and respect safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- The desktop layout is unchanged (checked by screenshot and by the same axe audit).

## Left as it is (and why)

| Where | Note |
|---|---|
| `App.tsx` (about 600 lines) | Still holds view state, the palette's actions and the right-click menu builder. It reads fine and is covered by the tests around it; splitting it further would be churn without a bug behind it. The next candidate is `menuFor` / `newItems` into `features/navigation/`. |
| Sidebar and details widths in `App.tsx` | `244` and `340` repeat `--spacing-sidebar` / `--spacing-details`. They animate a number, so they cannot read the class. |
| `main`'s `[&>div>section:first-child>header]:pl-[112px]` | Reaches into a child's markup to make room for the traffic lights when the sidebar is hidden. Fragile, but contained to one place. |
| Exit fades `transition={{ duration: 0.08 }}` | Hand-written durations (CLAUDE.md: springs only). A spring on opacity has a long tail that holds a menu on screen after it has "closed". |
| Text inputs with `outline-none` | Focus is shown by the surrounding control (`focus-within` border, the search box), as `base.css` says. axe passes. |

## What to look at yourself

See `docs/audit/ui-questions.md`.
