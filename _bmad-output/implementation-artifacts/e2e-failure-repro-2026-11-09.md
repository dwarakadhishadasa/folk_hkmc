# E2E failure reproduction — 2026-11-09

Source: OpenCode session history (`~/.local/share/opencode/opencode.db`) plus the
`test-results/*/error-context.md` artifacts left by the most recent run.

- **Latest full-suite run:** 2026-11-08 21:41, session `ses_e4422ce5…` (this
  conversation), command `pnpm test:e2e`. It was interrupted by the agent-server
  restart at test 132 of 621, so this is a partial run, not a full-suite verdict.
- **Artifacts:** 16 failure directories under `test-results/`, written
  21:43–22:02.
- **Immediately preceding sessions on 2026-11-08:** three distinct theme/harness
  failures (18:26–19:20) and one contact-record failure (10:47, later passed in
  another worktree at 19:58).

## Environment for manual reproduction

```bash
pnpm local:readiness          # local Supabase + Mailpit + app must be up
# App: http://127.0.0.1:3000   (folk)
# For another worktree: E2E_BASE_URL=http://127.0.0.1:3001
```

Sign in as the seeded Admin:

- email: `kavitha.raman@folk.fixture.test`
- password: `PREVIEW_FIXTURE_PASSWORD` from `.env.preview-seed.local`

```bash
set -a; . ./.env.preview-seed.local; set +a
# use "$PREVIEW_FIXTURE_PASSWORD" in the login form
```

Preacher repros use `anand.narayanan@folk.fixture.test` with the same password.

---

## Group 1 — Campaign workspace and overview drift (14 tests)

**Root cause is a UI contract change the specs were not updated for:**

- `components/campaign/assign-contacts-select.tsx:1372-1398` — clicking **Submit**
  on a DRAFT campaign starts it (`POST …/transition`) and then
  `router.push("/campaigns")`. The old flow was “assign, review the survey, then
  click Start.”
- `components/campaign/campaign-workspace.tsx` — the survey is **always open** in
  the right pane. The old “Call-outcome survey” button no longer exists.
- `components/campaign/campaign-assign-header.tsx:82-97` — the campaign name is
  an `<input aria-label="Campaign name">`, not an `<h1>`.

That single change explains the timeouts and the missing survey region.

### Shared setup

1. Go to `/campaigns`.
2. Click **New campaign**, enter a unique name (for example
   `manual-<timestamp>`), choose a future end date, and create it.
3. You land on `/campaigns/<id>/assign-contacts`; copy `<id>` from the URL.
4. Sign in as Admin (see above).

Useful DevTools snippets, run in the app's console while signed in:

```js
// The first page of contacts the assign surface sees.
await (await fetch(`/api/dialer/admin/campaigns/${id}/contacts?page=1&pageSize=100`)).json()

// The assignable callers.
await (await fetch('/api/dialer/admin/assignable-callers')).json()

// Seed one assignment without starting the campaign (the UI Submit starts it).
await fetch(`/api/dialer/admin/campaigns/${id}/assignments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contactIds: ['<contact-id>'],
    callers: [{ userId: '<caller-user-id>', weight: 1 }],
    mode: 'move',
  }),
})
```

### 1. `campaign-assign-write.spec.ts:500` — assigns a selection, reviews the survey and starts the campaign

1. Create a DRAFT campaign (shared setup).
2. Select the first two contacts with their row checkboxes.
3. In **Assign to**, click **Add caller**, pick a caller, leave weight 1.
4. Click **Submit**.
5. Expected by the test: the page stays on `/assign-contacts`, the
   **Call-outcome survey** region slides in, and **Start campaign** appears.
6. Current behaviour: the campaign is started and the browser navigates to
   `/campaigns` (Overview). The survey region never appears.
7. Reproduced failure: `getByRole('region', { name: 'Call-outcome survey' })`
   is not visible.

### 2. `campaign-assign-write.spec.ts:577` — skips the already-assigned contact the panel names

1. Create a DRAFT campaign.
2. Seed one assignment for contact A with `mode: "move"` (DevTools snippet above).
3. Reload `/campaigns/<id>/assign-contacts`.
4. Select contacts A and B.
5. Add a **different** caller and click **Submit**.
6. Expected: the warning “1 selected contact is already assigned in this
   campaign.”, then the dialog “1 of 2 contacts is already assigned”, then
   **Skip 1 and assign 1**, then the survey region.
7. Current behaviour: the conflict dialog can appear, but after the skip the
   campaign starts and the page goes to `/campaigns`; the survey region is absent.

### 3. `campaign-assign-write.spec.ts:666` — reassigns the already-assigned contact when Reassign is chosen

Same as test 2 through the conflict dialog, but click **Reassign all** instead of
**Skip 1 and assign 1**. Expected: survey region. Current: redirect to
`/campaigns`, survey region absent.

### 4. `campaign-assign-write.spec.ts:720` — reassigns a whole selection when every contact is already assigned

1. Create a DRAFT campaign.
2. Seed assignments for contacts A and B to caller 1.
3. Reload the assign screen, select A and B, add caller 2, click **Submit**.
4. Expected: dialog “All 2 contacts are already assigned”, no skip button, then
   **Reassign all**, then the survey region.
5. Current: after **Reassign all** the campaign starts and the page goes to
   `/campaigns`; survey region absent.

### 5. `campaign-campaigns.spec.ts:342` — lists the campaign with its status and links to the edit page

1. Create a campaign via **New campaign**.
2. Go to `/campaigns`; confirm the row shows `DRAFT`, the end date, and the four
   count columns (`Assigned`, `Reached`, `Confirmed`, `Never attempted`).
3. Click the campaign name in the row.
4. Expected by the test: the assign screen has an `<h1>` whose text is the
   campaign name.
5. Current: the name is in the **Campaign name** input, not an `<h1>`; the
   heading assertion times out.

### 6. `campaign-campaigns.spec.ts:393` — starts a DRAFT campaign from the assign screen's footer

1. Create a DRAFT campaign.
2. Open `/campaigns/<id>/assign-contacts`.
3. Look for a button named **Call-outcome survey**. It no longer exists; the
   survey is always open.
4. The test's `getByRole('button', { name: 'Call-outcome survey' }).click()`
   times out at 60s.
5. Underlying flow can be checked without the button: the survey is already in
   the right pane; a **Start campaign** / **Update campaign** footer is what the
   old flow expected.

### 7. `campaign-campaigns.spec.ts:419` — offers Update campaign, not Start, once the campaign is active

Same missing **Call-outcome survey** button. Create a campaign, start it (for
example via `POST /api/dialer/admin/campaigns/<id>/transition` with
`{"action":"start"}`), open the assign screen, and look for the button. It is
absent, so the test times out before it can assert **Update campaign** and the
absence of **Complete** / **Cancel**.

### 8. `campaign-campaigns.spec.ts:438` — shows the server's 409 message when the campaign moved first

Same missing button. To reproduce the race manually, open the campaign's assign
screen in tab A, start the campaign from tab B (API or another tab), then click
**Start campaign** in tab A. The page should show
`The campaign is ACTIVE and cannot be started.` The test cannot reach that
assertion because its `Call-outcome survey` button click times out first.

### 9. `campaign-overview.spec.ts:529` — sums the five buckets into the tiles and the row

This one is a **column-index drift**, not the survey panel.

1. Create a campaign with three assignments and one confirmed call:
   - Assign three contacts to one caller via the assignment API or SQL.
   - Insert one confirmed call log for one assignment:
     ```sql
     insert into public.dialer_call_logs
       (program_id, assignment_id, caller_id, dial_phone, attempt, disposition_status)
     select 'folk', a.id, a.caller_id, c.phone, 1, 'CONFIRMED'
     from public.dialer_assignments a
     join public.contacts c on c.id = a.contact_id
     where a.campaign_id = '<campaign-id>'
     limit 1;
     ```
2. Open `/campaigns`.
3. The test expects the row's cells in this order:
   `Campaign(0), End Date(1), Status(2), Assigned(3), Reached(4), Confirmed(5), Never attempted(6)`.
4. The current table has an extra **Start Date** column:
   `Campaign(0), Start Date(1), End Date(2), Status(3), Assigned(4), Reached(5), Confirmed(6), Never attempted(7), Actions(8)`.
5. So `row.getByRole('cell').nth(3)` is `DRAFT`, not the Assigned count. Failure:
   `Expected "3", Received "DRAFT"`.
6. The five stat tiles themselves (Assigned 3, Attempted 1, Reached 1,
   Confirmed 1, Never attempted 2) are the behaviour to verify; only the row
   cell assertions use stale indices.

### 10. `campaign-overview.spec.ts:703` — keeps the campaign row and counts only their own contacts

Same column-index drift, viewed as the Preacher:

1. Create a campaign and assign one in-scope contact.
2. Insert one assignment for a contact the Preacher does not own (the test's
   `insertOutOfScopeAssignment`), or use:
   ```sql
   insert into public.dialer_assignments
     (program_id, campaign_id, contact_id, caller_id)
   values ('folk', '<campaign-id>', '<out-of-scope-contact-id>', '<caller-id>');
   ```
3. Sign in as `anand.narayanan@folk.fixture.test` and open `/campaigns`.
4. Expected by the test: `cell.nth(3)` = `1`, `nth(4)` = `0`, `nth(5)` = `0`,
   `nth(6)` = `1`.
5. Current: `cell.nth(3)` is the Status column (`DRAFT`), so the first assertion
   fails exactly as in test 9.

### 11–14. `campaign-survey.spec.ts:166/199/233/259` — survey builder tests

All four call `gotoSurvey()` (`campaign-survey.spec.ts:134-138`), which does:

```ts
await page.goto(`/campaigns/${campaignId}/assign-contacts`)
await page.getByRole('button', { name: 'Call-outcome survey' }).click()
await expect(surveySection(page)).toBeVisible()
```

The button no longer exists; the survey is always rendered by
`CampaignWorkspace`, so the click times out at 60s and the test never reaches its
assertion.

Manual repro of the underlying behaviour:

1. Create a campaign; open `/campaigns/<id>/assign-contacts`.
2. Scroll to the right pane; the **Call-outcome survey** region is already open.
3. For `:166`: verify `No questions yet`, no `Status?`, no `Confirmed`, and an
   enabled **Add question**.
4. For `:199`: **Add question** → title `How did it go?` → type `RADIO` → add
   two options `Yes`/`No` → keep **Required** checked → **Save question** →
   verify the row shows `1`, `RADIO`, `Required`, and the two option chips.
5. For `:233`: **Add question** → title `Transport` → type `DROPDOWN` → **Save
   question** without options → verify the alert
   `A DROPDOWN question needs at least one option.` and no saved question.
6. For `:259`: create the radio question first (step 4), then **Add question** →
   title `Notes` → type `TEXT` → uncheck **Required** → save → verify the row
   shows `2`, `TEXT`, `Optional`, and no options list.

---

## Group 2 — Bulk fixture cleanup (2 tests)

### 15. `bulk-fixtures.spec.ts:785` — Wipe: `--wipe` removes only rows the generator created

**Root cause:** `scripts/bulk-contact-fixtures.mjs:558-565` deletes
`contacts` before any dependent `attendance` rows. If a bulk contact has an
attendance row, the delete fails with:

```
23503 update or delete on table "contacts" violates foreign key constraint
"attendance_contact_id_fkey" on table "attendance"
```

Manual repro:

```bash
pnpm seed:bulk-local                     # create the 250-row bulk set
# then create one attendance row that points at a bulk contact:
# SQL editor / psql:
#   insert into public.attendance (program_id, contact_id, session_id, phone, name)
#   select 'folk', c.id, s.id, c.phone, c.name
#   from public.contacts c
#   cross join (select id from public.sessions where program_id = 'folk' limit 1) s
#   where c.program_id = 'folk' and c.source = 'preview-fixture-bulk'
#   limit 1;
pnpm seed:bulk-local -- --wipe
```

Expected: exit 0, `deleted N bulk contact(s)`, `deleted N bulk location(s)`, no
bulk row left, seeder rows untouched.
Current: exit 1 with the FK error; the test's `expect(result.status).toBe(0)` is
what fails.

### 16. `bulk-fixtures.spec.ts:1012` — cleanupTaggedContacts removes a row the spec created

**Root cause:** the test creates a row with
`source = "preview-fixture-bulk-spec-created"` (`BULK_SPEC_SOURCE`), then expects
`listBulkContacts()` to contain it. `listBulkContacts()` filters with
`.eq("source", "preview-fixture-bulk")` (`e2e/fixtures/bulk-contacts.ts:207-213`),
so the suffix-distinct row is never in the list.

Manual repro:

```sql
-- 1. create the spec-style row
insert into public.contacts (program_id, name, phone, location_ids, source)
values ('folk', 'Spec-created manual', '8999999999', '{}', 'preview-fixture-bulk-spec-created')
returning id;

-- 2. what listBulkContacts() reads: exact marker only
select id from public.contacts
where program_id = 'folk' and source = 'preview-fixture-bulk';
```

The new id is absent from the second result, so
`expect(listBulkContacts(program).map(c => c.id)).toContain(created.id)` fails
with `Expected value: "<id>"` / `Received array: [...]`.

Clean up with:

```sql
delete from public.contacts
where program_id = 'folk' and source = 'preview-fixture-bulk-spec-created';
```

---

## Group 3 — Theme and harness failures (3 tests, preceding session)

These were run on the `feature/folk-homepage-swap` worktree at
`E2E_BASE_URL=http://127.0.0.1:3001` (18:26–19:20).

### 17. `theme-switch.spec.ts:615` — theme 10, the frozen-run divider

Failure: `page.evaluate: Error: light the frozen-run divider resolved to a
translucent colour: rgba(0, 0, 0, 0.1)` (another run reported `----border`
with the same alpha).

Manual repro:

1. Sign in as Admin and open `/dev/grid-preview`.
2. In DevTools console, force dark mode:
   ```js
   document.documentElement.classList.add('dark')
   ```
3. Read the frozen `ref` cell's painted right border:
   ```js
   const cell = document.querySelectorAll('tbody tr')[1]
     .querySelector('[data-grid-cell$="~ref"]')
   getComputedStyle(cell).borderRightColor
   ```
4. Current: a translucent value such as `rgba(0, 0, 0, 0.1)`. The spec's
   `cssColorToRgb()` throws on any alpha ≠ 255. Expected: an opaque token colour.

### 18. `theme-switch.spec.ts:739` — theme 13, staff surfaces

Failure: `/sessions select background resolved to a translucent colour:
rgba(0, 0, 0, 0)` and `----field resolved to a translucent colour:
rgba(195, 212, 249, 0.18)`.

Manual repro:

1. Sign in as Admin and open `/sessions`.
2. Force dark mode: `document.documentElement.classList.add('dark')`.
3. Inspect the session-start select:
   ```js
   const select = document.querySelector('select')
   getComputedStyle(select).backgroundColor
   ```
4. Current: `rgba(0, 0, 0, 0)` (transparent). The test expects the field surface
   to resolve to `--field` with an opaque background and readable ink.
5. Repeat on `/contact`, `/volunteers`, `/admin/invite`; the test grades every
   enabled text field on those four routes.

### 19. `harness-guards.spec.ts:155` — the two apps' `.dark` token blocks are identical

This is a source-level check; no browser needed.

```bash
diff -u \
  <(sed -n '/^\.dark {/,/^}/p' apps/folk/app/globals.css) \
  <(sed -n '/^\.dark {/,/^}/p' apps/gita-life/app/globals.css)
```

Expected: no output (the two blocks are byte-identical).
Current: the two blocks differ, so the `expect(blocks[0]).toBe(blocks[1])`
assertion fails. Re-sync the two `.dark` blocks (or change both in the same
commit).

---

## Group 4 — Contact record failure (1 test, earlier session)

### 20. `manage-contacts-list.spec.ts:347` — a refused record write re-reads, reports the message, and keeps the original value

This ran on `feature/accessible-contact-card` at 10:47, and later passed in
`feature/folk-homepage-swap` at 19:58, so it may already be fixed. The failure is
still reproducible on the older worktree.

Failure: `the rejected write must re-read the record` — `recordReads.length` did
not grow after a rejected `PATCH` (expected > 0, received 0).

Manual repro:

1. Sign in as the Preacher (`anand.narayanan@folk.fixture.test`).
2. Open `/contacts/grid?q=<a real contact's phone>`.
3. In DevTools console, intercept the PATCH to return the test's 400:
   ```js
   const originalFetch = window.fetch
   window.fetch = async (input, init) => {
     if (String(input).includes('/api/manage/contacts') && init?.method === 'PATCH') {
       return new Response(JSON.stringify({ error: 'Name is required.' }), {
         status: 400,
         headers: { 'Content-Type': 'application/json' },
       })
     }
     return originalFetch(input, init)
   }
   ```
4. Hover the row and click the expand control; the contact record dialog opens.
5. Change **Name** to `<original>-Refused` and press **Enter**.
6. Expected: the alert `Name is required.` appears, the field reverts to the
   original name, **and a new `GET /api/manage/contacts/<id>/record` fires**.
7. Current on that worktree: no second `GET`; the field reverts but the record is
   not re-read. Watch the Network tab to confirm.

---

## Quick reproduction commands

The manual steps above are the human path. To reproduce each failure through the
same harness, use a regex filter (never a glob):

```bash
pnpm test:e2e bulk-fixtures -g "Wipe"
pnpm test:e2e bulk-fixtures -g "cleanupTaggedContacts removes"
pnpm test:e2e campaign-assign-write -g "assigns a selection"
pnpm test:e2e campaign-assign-write -g "skips the already-assigned"
pnpm test:e2e campaign-assign-write -g "Reassign is chosen"
pnpm test:e2e campaign-assign-write -g "whole selection"
pnpm test:e2e campaign-campaigns -g "links to the edit page"
pnpm test:e2e campaign-campaigns -g "footer"
pnpm test:e2e campaign-campaigns -g "Update campaign"
pnpm test:e2e campaign-campaigns -g "409 message"
pnpm test:e2e campaign-overview -g "five buckets"
pnpm test:e2e campaign-overview -g "counts only their own"
pnpm test:e2e campaign-survey -g "no seeded Status"
pnpm test:e2e campaign-survey -g "RADIO question"
pnpm test:e2e campaign-survey -g "no options"
pnpm test:e2e campaign-survey -g "TEXT question"
pnpm test:e2e theme-switch -g "theme 10"
pnpm test:e2e theme-switch -g "theme 13"
pnpm test:e2e harness-guards -g "dark token blocks"
pnpm test:e2e manage-contacts-list -g "refused record write"
```

Remember: one runner at a time. Every spec shares the seeded local database.
