---
title: 'Dark theme for Contact, Sessions and Invite'
type: 'feature'
created: '2026-10-19'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2748315296007612528e488d2ea0f9de7fceb544'
context:
  - _bmad-output/specs/spec-grid-keyboard-editors-and-theme/theme-contract.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The light/dark switch shipped scoped to `/manage`. Contact, Sessions and Invite were never graded and are broken under `.dark`: form fields are `bg-white` carrying `text-[var(--program-text)]`, which flips to `#e9eaeb` — near-white on white. Role notices paint navy `--program-primary` (`#0f1e54`) on `--muted` (`#32363a`), ~1.4:1. The attendance list pairs pastel `bg-*-50` rows with that same near-white ink. Page shells are literal `bg-[#FFF9F0]`, status boxes raw `amber-*`/`red-*`, disabled CTAs `bg-gray-300`, and panels a fixed `rgba(45,10,10,0.08)` shadow.

**Approach:** Bring these three surfaces onto the token vocabulary the grid already uses. Fields take `bg-card` + `border-input` + `text-foreground`; notices take `border-border bg-muted/50` or `border-destructive/30 bg-destructive/10 text-destructive`; shells take `bg-background`; disabled states and focus rings take `bg-muted` / `--ring`; panel shadows take the existing `--shadow-overlay` token. No new design language — the same tokens, applied to the surfaces that were skipped.

## Boundaries & Constraints

**Always:**

- Fix only `components/{contact-form,sessions-manager,live-attendance-dashboard,invite-user-form}.tsx` and their seven page hosts under `apps/*/app/`.
- Any new token lands in **both** apps' `.dark` blocks, byte-identical — `harness-guards.spec.ts:155` asserts it.
- `bg-[var(--program-primary)] text-white` header bands stay: the brand color is dark in both themes, so white ink is correct in both (`theme-contract.md:43`).
- The QR quiet zone stays `bg-white` (`live-attendance-dashboard.tsx:203`) — a QR needs a white margin to scan.
- Keep the forms' existing density (`rounded-lg px-4 py-3 text-sm`). Copy the grid's *colors*, not its 13px cell density.

**Never:**

- No `dark:` variant classes. One token per intent, resolved by `.dark`.
- No `components/attendance-form.tsx` or `/attend` — that is the public unauthenticated surface, not these three staff pages.
- No gita-life `body` gradient, no `components/header.tsx`; both are out of scope per `theme-contract.md:49`. The gita-life cream body gradient has no `.dark` counterpart and stays that way — page shells cover it on these three pages; recorded as deferred.
- Do not edit `harness-guards.spec.ts`. A red guard means fix the source.
- No new dependency, no CSS-in-JS, no theme-aware React hook.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| field, dark | `/contact` under `.dark`, focus a text input | surface `--card`, ink `--foreground`, placeholder readable |
| field, light | same page under light | visually unchanged from today |
| role notice, dark | `/contact` as Volunteer under `.dark` | ink ≥4.5:1 on its own surface |
| error notice, dark | `/sessions` with no locations under `.dark` | destructive ink on a `--destructive`-tinted surface |
| attendance rows, dark | `/sessions`, live session, ≥3 records | every row's ink legible; tint is the row's stable tag slot |
| page shell, dark | any of the three pages under `.dark` | outer surface is `--background`, no cream rectangle |
| focus ring, dark | keyboard-focus the submit button | resolves through `--ring`, visible on a dark card |
| disabled CTA, dark | submit while `isSubmitting` | reads as disabled, not a light-grey slab |

</frozen-after-approval>

## Code Map

- `components/contact-form.tsx:61` `panelClass`, `:63` `fieldClass`, `:64` label, `:65` `noticeClass`. `:211` band (keep), `:216` role notice, `:224` message, `:260,262` phone error, `:429` CTA.
- `components/sessions-manager.tsx:75` field, `:80` `LoadingBar` `bg-black/5`, `:83` `via-white/90` shimmer, `:135` panel, `:149` `bg-[#FFF3DF]` dot, `:281` panel, `:292` message, `:298` no-locations, `:350` CTA.
- `components/live-attendance-dashboard.tsx:23-31` pastel array (delete), `:36` `getBackgroundColor` (delete), `:187` Live pill, `:195,256` panels, `:203` QR (keep), `:207,217` navy-ink pill/button, `:232` `text-green-700`, `:279` `text-red-300`, `:293` tint site, `:296` rank badge.
- `components/grid/grid-cell-renderers.tsx:79-97` `tagSlot` — the FNV-1a label→slot hash, **currently module-private**. Export it so the attendance list assigns slots the same way the select/multiselect pills do. Its own doc comment records why it is duplicated in `grid-editors.tsx` (the `use-grid-keyboard` import cycle) — importing *from* `grid-cell-renderers` into a non-grid component closes no cycle.
- `components/invite-user-form.tsx:50` field, `:51` label, `:52` notice, `:195` panel, `:206,334` amber notices, `:292` count pill, `:300` `bg-white` list, `:313` row hover, `:321` checkbox border, `:354` Add, `:366` CTA.
- `apps/{folk,gita-life}/app/{sessions,volunteers,admin/invite}/page.tsx` (`:37`, `:16`, `:18`) and `apps/gita-life/app/contact/page.tsx:17` — `bg-[#FFF9F0]` → `bg-background`. `apps/folk/app/contact/page.tsx:33` is already `bg-muted/30`; leave it.
- `components/manage/manage-portal.tsx:125` — the tokenized notice pattern to copy. `components/grid/grid-panel.tsx:86-89` — the tokenized error pattern.
- `apps/{folk,gita-life}/app/globals.css` `@theme inline` — `--shadow-overlay` already exists in both; use `shadow-overlay`, do not invent one.
- `components/grid/grid-cell-renderers.tsx:148` — the proven `color-mix(in oklab, var(--tag-N) 11%, var(--card))` pattern for a theme-flipping tint.
- `e2e/specs/theme-switch.spec.ts` — helpers `tokenRgb`, `contrastRatio`, `forceTheme`, `expectDark`, and the `theme N —` naming convention to extend.
- `e2e/specs/harness-guards.spec.ts:155` — `.dark` blocks must be byte-identical. They are **not** today: `apps/folk/app/globals.css:194` and `apps/gita-life/app/globals.css:206` carry different comments on the same `--grid-warning-ink`. Restore parity.
- `e2e/fixtures/roles.ts:46` — `volunteer` lands on `/contact`; that is how the new spec reaches the page.

## Tasks & Acceptance

**Execution:**

- [ ] `contact-form.tsx` — field: `bg-white`→`bg-card`, `text-[var(--program-text)]`→`text-foreground`, `border-[var(--input)]`→`border-input`, ring→`ring-ring/15`; panel shadow→`shadow-overlay`; `:216`/`:224` notices→`border-border bg-muted/50 text-foreground`; phone error→`text-destructive` / `border-destructive` / `ring-destructive/15`; CTA disabled→`disabled:bg-muted disabled:text-muted-foreground`, ring→`ring-ring`.
- [ ] `sessions-manager.tsx` — field and CTA as above; `LoadingBar`→`bg-muted`, shimmer→`via-foreground/20`; skeleton dot→`bg-muted`; panels→`shadow-overlay`; `:292`/`:298`→the info/destructive token pair.
- [ ] `live-attendance-dashboard.tsx` — delete the pastel array and `getBackgroundColor`; export `tagSlot` from `grid-cell-renderers.tsx` and tint each row with `color-mix(in oklab, var(--tag-${tagSlot(record.id)}) 11%, var(--card))` — the exact ratio `Pill` uses (`grid-cell-renderers.tsx:145-148`), chosen there because 11% is the strongest mix that still clears 4.5:1 for the dimmest slot in both themes. Hash the record id, not the index: an index-derived slot recolors every row when one arrives. Live pill→`bg-success/15 text-success`; `:207,217`→`text-foreground` / `border-border` / `hover:bg-foreground/5`; `:232`→`text-success`; `:279`→`text-destructive`; panels→`shadow-overlay`.
- [ ] `invite-user-form.tsx` — field, panel, notices, CTA as above; `:292`→`bg-foreground/5 text-foreground`; `:300`→`bg-card`; `:313`→`hover:border-border hover:bg-foreground/5`; `:321`→`border-input`; `:354`→`text-foreground`, disabled→`border-border text-muted-foreground`.
- [ ] The seven page hosts — `bg-[#FFF9F0]` → `bg-background`.
- [ ] Both `globals.css` — restore byte-parity of the two `.dark` blocks.
- [ ] `e2e/specs/theme-switch.spec.ts` — add `theme 13`: for each of `/contact`, `/sessions`, `/volunteers`, `/admin/invite`, force `.dark`, then assert the page shell's computed background equals `--background`, and every `input`/`select`/`textarea` has a computed background equal to `--card` with ink measuring ≥4.5:1 against it.

**Acceptance Criteria:**

- Given either app under `.dark`, when one of the three pages loads, then no element paints the literal cream `#FFF9F0`.
- Given a form field under `.dark`, when its computed colors are read, then background resolves to `--card`, text to `--foreground`, and the pair measures ≥4.5:1.
- Given the attendance list under `.dark` with ≥3 records, then every row's ink measures ≥4.5:1 against that row's background, and each row's tint is the same `--tag-N` slot the select/multiselect pill would give the same value.
- Given the attendance list, when one new record arrives, then the tints of the existing rows are unchanged — the slot is a function of the record, not its position.
- Given any notice box under `.dark`, then its ink and surface are both tokens and measure ≥4.5:1.
- Given the repo after the change, when `grep -rnE "bg-\[#FFF9F0\]|bg-\[#FFF3DF\]|bg-white|bg-black/|text-red-[0-9]|bg-(amber|red|green|orange|teal|rose|sky|lime|stone)-[0-9]"` runs over the four components, then it returns zero hits except the QR quiet zone.
- Given both `globals.css`, when their `.dark` blocks are compared, then they are byte-identical.
- Given either theme, when the three surfaces are screenshotted, then the light capture is unchanged from baseline apart from the notice and shadow tokens.

## Implementation Notes

- **`apps/folk/app/contact/page.tsx` shell was unified to `bg-background`.** The Code Map said to leave its `bg-muted/30`, but the acceptance criterion asserts every graded shell resolves to `--background`, and the grid page's shell is `bg-background`. The two contradicted each other; the criterion and Dwaraka's "copy the Contact Grid page" instruction won. `bg-muted/30` also rendered a slightly different canvas from the other three pages under `.dark`, which is visible when moving between them.
- **The attendance fetch error moved out of the `--program-primary` band into the card body.** `text-destructive` is correct on `--card` (4.9:1 light, 5.5:1 dark) but only 3.0:1 against the fixed navy band in the light theme — the spec's `:279`→`text-destructive` instruction was right about the ink and wrong about the surface. Moving the element is what makes the token correct in both themes.
- **`bg-white/10` on the attendance Refresh button became `bg-primary-foreground/10`.** They resolve to the same pixel (`#ffffff` at 10% in both themes and both apps), but the acceptance criterion's cleanup grep bans `bg-white` outside the QR quiet zone, and the QR quiet zone must keep it.
- **The per-row rank badge stayed `bg-[var(--program-primary)] text-white`.** That is precisely the "white ink on a fixed dark brand color" pairing `theme-contract.md:43` already ruled correct in both themes, and it clears 4.5:1 in both. Its circle merging into a dark row is cosmetic, not a legibility defect, and changing it would have contradicted a settled decision.
- **gita-life is covered structurally, not by the e2e row.** The harness boots folk only (`playwright.config.ts` `webServer`), so `theme 13` grades folk. gita-life gets the same four components and the same shell edit, and `harness-guards.spec.ts` holds its `.dark` block byte-identical to folk's.
- **Two new tokens, on Dwaraka's instruction.** `--field` is `#ffffff` in folk's `:root`, `#fffdf9` in gita-life's, and `#3b3f4b` in both `.dark` blocks: a field now lifts off the card instead of sharing its surface, and its ink is `--foreground` (`#e9eaeb`, visually white). `--panel-header` is `var(--program-primary)` in `:root` and `#000000` in `.dark`, so a card's title band keeps its brand colour on paper and goes black on the dark canvas. Both are declared in `@theme inline`, so `bg-field` and `bg-panel-header` resolve through the theme switch.
- **The theme toggle is signed-in only.** `Header` now renders it behind `isLoggedIn`, so `/login`, `/register`, `/attend` and `/auth/error` follow the OS preference with no control. `isLoggedIn` reads `Boolean(staff)` from the auth context, which is `null` on the server and the first client render, so both agree on rendering nothing.
- **A successful delete is no longer reported.** `GridRowDeleteReport` only mounts when an outcome failed: the row leaving the grid is the confirmation, while a refusal leaves the row on screen and needs the server's reason. The row-lifecycle spec's success case now asserts the panel is absent.
- **The hidden-fields glyph joins its label when reporting.** At rest it keeps `--grid-accent-ink`; once a field is hidden both glyph and label carry `--grid-warning-ink`, so the pill reads as one state rather than two.

## Spec Change Log

- 2026-10-19 — mid-implementation design direction from Dwaraka, after reviewing the Contact page: a card's title band goes black in dark (light keeps the brand colour), fields become `#3B3F4B` with white ink in dark, the theme toggle is shown to signed-in staff only, the delete-success message is dropped, and the hidden-fields glyph turns orange when it reports. These extend the frozen intent rather than contradict it; the field and header rules are carried by `--field` and `--panel-header` so no component holds a literal.

## Review Triage Log

## Design Notes

**Why `--tag-*` for the attendance rows, and why the hash.** Dwaraka's call: reuse the select/multiselect tag palette rather than invent a tint ramp. Those ten hues already carry a `.dark` counterpart that is byte-identical across both apps, and the 11% mix against `--card` is not a guess — `Pill` arrived at it empirically as the strongest tint that still clears 4.5:1 for the dimmest slot in both themes. Hashing `record.id` rather than the list index is what makes the color a property of the person rather than of their arrival order: with the index, one new check-in recolors every row below it, which reads as a reorder that did not happen.

**Why the row tint moves to `style`, not a class.** Tailwind cannot generate `bg-[var(--tag-${n})]` for a slot only known at runtime. `Pill` sets the same three properties inline for the same reason (`grid-cell-renderers.tsx:143-149`), so this matches the existing pattern rather than working around it. Inline style is not a `dark:` variant and introduces no literal color.

**Why the notices collapse to two intents.** Four visually distinct boxes (`amber-50`, `red-50`, `bg-muted` with navy ink, `border-red-500` field state) express two meanings: "read this" and "this failed". `border-border bg-muted/50` and `border-destructive/30 bg-destructive/10 text-destructive` are those two, already used elsewhere, and resolve per theme without a variant.

**Why the focus ring moves from `--program-primary` to `--ring`.** `--program-primary` is fixed navy, measured ~1.6:1 against a dark card when the theme story audited it. `--ring` was lightened specifically to clear 3:1 in both themes. Using it is the fix, not a preference.

## Verification

**Commands:**

- `pnpm test:static` — guardrails, typecheck, lint all pass.
- `pnpm test:e2e:theme` — all `theme-switch` cases green, including `theme 13`.
- `pnpm test:e2e:guards` — green, including the byte-identical `.dark` assertion.
- `pnpm test:e2e` — full suite green, one runner, after `pnpm dev:local`.
- `pnpm test:e2e:determinism` — green twice back to back; required after touching a spec.

**Manual checks (if no CLI):**

- Toggle dark, visit all four routes. Fields are dark with light ink; no cream shell; notices legible; disabled buttons read as disabled.
- Start a session, mark three records, confirm rows are readable and distinct under `.dark`.
