# Accessibility

Moss should work with a keyboard alone, with a screen reader, with Reduce motion on, and in both themes. This page says what that means in the code, so the next control gets it right too. Most of it is enforced by tests and lint, so a mistake fails CI instead of reaching someone.

## What is checked automatically

- **`pnpm lint`** runs `eslint-plugin-jsx-a11y` over every component: buttons need names, labels need fields, clickable `div`s need a role.
- **`pnpm test`** runs the behavior tests in `shared/controls/*.test.tsx`, `shared/toast/Toasts.test.tsx` and `features/navigation/rowKeys.test.tsx`, which drive the real components with a keyboard.
- **`src/styles/contrast.test.ts`** reads `tokens.css` and checks that every text color is at least 4.5:1 against every surface it sits on, in the dark theme, the light theme and the explicit light override. Change a color and it tells you if the new one is too faint.

What no test can check: how a screen reader actually sounds, and how it feels. Try VoiceOver (macOS, ⌘F5) or Narrator (Windows, Ctrl+Win+Enter) after changing a control.

## The rules

**Everything works from the keyboard.** The Tab order follows the screen. Rows in lists and the board are reached with the arrow keys (`features/navigation/rowKeys.ts`); Settings → Keyboard lists them.

**Dialogs** use `Modal` (or `useModalLayer` for a custom one, as the search box does). That gives you, in one place (`shared/a11y/modalLayer.ts`):

- focus moves into the dialog, and Tab stays inside it;
- the page behind is `inert` (it can't be focused, clicked or read);
- Escape closes only the top dialog;
- when it closes, focus returns to what had it before.

Dialogs are drawn in a portal on `<body>`, outside `#root`, because making `#root` inert would otherwise make the dialog inert too. If a dialog stays on screen for an exit animation, pass `active = false` as soon as it starts closing, so a command that moves focus can.

**Menus** (`shared/controls/Menu.tsx`, `ContextMenu.tsx`): Down opens a ⋯ menu and focuses the first row; arrows, Home and End move; Escape closes and returns focus to the button; Tab closes. The right-click menu opens from the keyboard with the menu key or Shift+F10.

**Radio groups** (`Segmented`, the milestone color picker) use `useRovingRadios`: one Tab stop, arrows move the choice.

**Row shortcuts don't steal keys.** Enter, S and Delete act on a row only when focus is on the row or a control that doesn't use that key. Enter on a status button, a fold arrow or a menu button is the button's own. Text fields and the page editor keep every key, including ⌘Z (the toast's Undo is skipped there; see `shared/a11y/focus.ts: isTextEntry`).

**Messages are announced.** Toasts use two always-present live regions (`status` and `alert`); a region that appears together with its text is often missed. Moving between sections updates the window title and a polite live region (`App.tsx`). The search box is a combobox with `aria-activedescendant` and a spoken result count.

**Checklists have a keyboard path.** The boxes are drawn in CSS; Ctrl/⌘+Enter ticks the item the cursor is in.

**Text is readable.** 4.5:1 for text, always. Muted text and placeholders use `text-fg-3`, which passes. Don't lower an opacity on text.

**Motion respects the setting.** `MotionConfig reducedMotion="user"` and a rule in `motion.css` turn animations into instant changes.

## Adding a control: checklist

1. Can it be reached and used with Tab, arrows, Enter, Space and Escape alone?
2. Does every button and field have a name a screen reader can say (visible text, `aria-label`, or a `<label>`)?
3. If it opens something, does focus move in, and come back when it closes?
4. If its state changes (`aria-expanded`, `aria-checked`, `aria-current`), is that in the markup?
5. If it announces something, is the live region always in the page?
6. Add a test next to it that uses `userEvent.keyboard`.
