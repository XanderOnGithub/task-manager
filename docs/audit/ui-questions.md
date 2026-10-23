# Design questions (code and canvas disagree)

CLAUDE.md: when the code and the design canvas disagree, ask which is right. These are
the places I found. None of them were changed.

1. **Type sizes.** The canvas's "Picks" board lists five sizes: 22, 15, 13, 12, 11. The
   canvas's own screens also use 12.5 (list controls), 13.5 and 14 (Unsorted rows), 11.5
   and 18 (details title). The code follows the screens. `12.5` and `14` are now tokens
   (`text-compact`, `text-lead`) so the numbers live in `tokens.css`. Left as one-offs in
   code: 13.5 (Unsorted's add field), 15 (search and quick capture inputs), 18 (details
   title), and emoji sizes 13, 17, 21, 24. **Choose:** keep the in-between sizes (add them
   to the Picks board) or snap everything to the five.
2. **Muted text colors.** Canvas: dark `text-2` #A9A9B2, `text-3` #8A8A94; light `text-3`
   #6A6A73. Code: #BEBEC7, #A2A2AC and #63636C. The code is lighter or darker on purpose,
   so every text color passes 4.5:1 (`contrast.test.ts`). **Choose:** update the canvas to
   the code's values (recommended), or accept the lower contrast.
3. **Row height.** Canvas: `row 34`. On touch screens the code uses 44px so a finger can
   hit it. **Confirm** that is wanted.
4. **Phone layout.** There is no phone screen on the canvas. The drawer, sheet and bottom
   bar are my design from the existing tokens (screenshots: see the PR or
   `scripts/screenshots.mjs`). **Look at it** and say what to change.
