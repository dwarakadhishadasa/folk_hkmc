# bmad-review — sessions flow

**Content:** docs — `SPEC.md` + `design-reference.md` + `data-model.md` (spec folder)

**Lenses:** adversarial · edge-case-hunter · structure · prose (on structure)

**Findings:** 95 — adversarial 31, edge-case-hunter 32, structure 13, prose 19


Overlap between lenses is kept; repeated issues are signal, not duplicates.


## adversarial

**1. SPEC.md · Why (lines 17–19)**

- trigger: The premise "There is no list of past sessions, no attendance total per session, no way to open a session and see who attended" is false — `/manage` already renders exactly that (`components/manage/manage-sessions-view.tsx`: sessions grouped by location, per-session `attendees`, a `sessions · attendance records` total, for Admin and Preacher).
- guard: Rewrite the Why to "`/sessions` is a live check-in manager with no persistent overview; `/manage` (Admin/Preacher) already lists sessions with attendees, and this spec either supersedes that tab or states how the two differ." Add a Constraint: "`/manage`'s Sessions tab keeps its existing RLS-scoped read and is not modified."
- consequence: The builder ships a second session list with a *different* scope rule (service-role, hand-rolled) beside the RLS-scoped one; the two disagree for the same staff member and neither doc says which is canonical.

**2. SPEC.md · Constraints, line 52 vs data-model.md · Scope, lines 200–202**

- trigger: "**Scope reuses the staff gate** … No new authorization rule" is contradicted two sections later by "The current `GET /api/sessions` narrows to `created_by` only; the spec widens a Preacher to their owned sessions."
- guard: Delete "No new authorization rule" and write the change once: "`GET /api/sessions` changes from creator-only to the scoped rule in `data-model.md#scope` (a behaviour change, not a reuse)."
- consequence: The implementer cannot tell whether touching authz is permitted; one of the two statements is wrong and a reviewer has no way to pick the authoritative one.

**3. data-model.md · Scope table, lines 194–198**

- trigger: The Preacher rule omits the standalone `created_by = auth.uid()` term that `20261007120000_scope_sessions_by_preacher.sql` grants, and the Assistant rule omits `created_by = caller_assigned_preacher_id()`.
- guard: Restate exactly the policy's four disjuncts: `Preacher: created_by = me OR preacher_id = me`. `Assistant: created_by = me OR preacher_id = assignedPreacher OR created_by = assignedPreacher OR preacher_id = assignedPreacher`.
- consequence: Sessions RLS makes readable disappear from `/sessions` — the precise creator-vs-preacher bug that migration exists to fix (a preacher's 107 sessions created by another account render zero).

**4. data-model.md · Scope table, Assistant row**

- trigger: No branch for an Assistant with no `assigned_preacher_id`, or an assigned preacher who is not `Active`; `staff.assignedPreacherUserId` is optional in `StaffContext`. The existing page and `POST /api/sessions` both handle this (empty scope / 403).
- guard: Add "An Assistant with no assigned preacher, or whose assigned preacher is not `Active`, sees zero sessions," plus the test that mirrors `apps/folk/app/sessions/page.tsx`.
- consequence: `preacher_id = undefined` reaches the query builder; depending on the client it errors, matches nothing, or matches everything — and it diverges from behaviour the POST path already enforces.

**5. SPEC.md · CAP-1 success, line 25**

- trigger: "an empty programme renders the designed empty state" — no empty-state frame exists among the 9 frames of `sessions.figcraft`, and Constraint 54 says "do not invent chrome".
- guard: Either "Empty state reuses `components/campaign/campaign-empty-state.tsx`, the one place composed chrome is allowed because the design has no empty frame," or delete the clause from CAP-1.
- consequence: CAP-6's side-by-side check has nothing to compare against, so the builder must either invent chrome (violating the constraint) or ship a blank panel.

**6. SPEC.md · CAP-1 success, line 25**

- trigger: "choosing a location shows only that location's sessions" — the mobile Overview frame has no location control (titles: `Sessions`, `New session`, `48 sessions · folk programme`, `Overview`, `Reports`; no `All locations`).
- guard: Scope it: "the location filter is the desktop control (`md:` and up); the mobile Overview shows no filter."
- consequence: Mobile cannot satisfy CAP-1 and CAP-6 at the same time; whichever is dropped, the acceptance criteria become untrustworthy.

**7. SPEC.md · CAP-3 success, line 33 vs design-reference.md §Mobile — Session detail, line 143**

- trigger: The spec says the attendee list shows "contact name, phone and location"; the design's cards show name, phone and *sessions attended*, and the reference says the same. There is no location on the card.
- guard: "Attendee card: initials, name, phone, `N sessions`, chevron — no location," and remove `location_ids` from the attendee join in `data-model.md` step 2.
- consequence: The builder adds a field the design does not have (CAP-6 fails) or omits a field the capability promises (CAP-3 fails); the data model also carries a join with no consumer.

**8. SPEC.md · CAP-3 success, line 33; data-model.md line 252**

- trigger: "email (from the auth user when present)" — `public.contacts` has no email column and contacts are not auth users; `public.users.email` belongs to staff. The value is therefore always `—`.
- guard: "No contact email exists in this schema. Render `—` unconditionally and add a `Deltas` line: 'Email is always empty — no source column; the design's address is sample data.'"
- consequence: The design's Email row is permanently empty while the spec implies a source exists, and a reviewer signs off on data that can never appear.

**9. design-reference.md · Attendee contact, line 149 (inherited by SPEC.md CAP-3)**

- trigger: "Attendance history: session, date, Attended/Absent" — `attendance` records presence only; there is no per-session expectation and no absent row, so `Absent` is unreachable.
- guard: "Attendance history lists attended sessions only; every row reads `Attended`," and delete `Absent` from the reference.
- consequence: The builder either fabricates absence from a session list (reporting non-attendance for sessions the contact was never expected at) or ships a two-value vocabulary with one value.

**10. data-model.md · Session detail query, step 3 (lines 249–255)**

- trigger: "sessions attended = count of attendance rows for the contact **in the programme**" plus a programme-wide history runs on the service-role client, while `contacts` and `attendance` RLS are preacher-scoped; `lib/supabase/manage.ts` deliberately renders `SCOPED_OUT_ATTENDEE_LABEL` for exactly this case.
- guard: Scope the count and the history to sessions the caller may read, and render `SCOPED_OUT_ATTENDEE_LABEL` for contacts outside `contacts` RLS — or state plainly that `/sessions` is a service-role read that exposes every attendee of a scoped session and list the fields it exposes.
- consequence: A Preacher reads the full contact record and full attendance history of another preacher's contacts — an authorization regression against a boundary the codebase already implements.

**11. SPEC.md · CAP-4 success, line 37; data-model.md line 272**

- trigger: "the weekly series sums to the range total" while the trend buckets `attendance.created_at` by ISO week over a range defined by *session start*. The first and last ISO weeks are partial, so clipped buckets sum below the total and unclipped ones include out-of-range rows.
- guard: "Bucket by ISO week clamped to the range (`greatest(created_at, range_start)`, `least(created_at, range_end)`) and assert `sum(buckets) = total_attendance` in a unit test with a session that starts on the last day of the range."
- consequence: The acceptance criterion fails on real data at every range boundary and gets quietly dropped, leaving the trend chart untested.

**12. SPEC.md · CAP-4 success, line 37; data-model.md line 274; design-reference.md line 121**

- trigger: The spec defines "Needs attention" as "in-range sessions with zero check-ins"; the design's card is "Sessions that ran but did not fill" with fill percentages (`Youth Meet 65%`, `Gita Life 55%`) — capacity data that does not exist.
- guard: Rename the card and body to match what can be computed — "Sessions with no check-ins · Sessions that ran with no check-ins. <name> · <date> · 0 check-ins" — and record the delta in `design-reference.md`.
- consequence: The one required report card is not the designed card: same slot, different title, different data, different row layout, so CAP-4 and CAP-6 cannot both pass.

**13. SPEC.md · CAP-4 success + CAP-6, lines 37/45; design-reference.md line 121**

- trigger: The card is required by CAP-4 but absent from the saved Reports (light) frame; CAP-6 demands a side-by-side match against the reference that documents its absence. `data-model.md` line 276 keeps it anyway.
- guard: "Render `Needs attention` in both themes and add a `Deltas` entry saying light was re-added" — or "render it in dark only, and drop it from CAP-4's success criteria."
- consequence: The light-mode conformance check is permanently red, so the check gets waived and stops protecting the rest of the surface.

**14. SPEC.md · CAP-4 success, line 37**

- trigger: "attendance-by-session and top-sessions totals equal a direct `count(attendance)` for the same sessions" — the cards show top-4 bars (`57+42+38+26`) against a range total of `1,284` and display no total at all, so the sentence is either false or untestable.
- guard: "`Total attendance` equals `count(attendance)` for the in-range session ids; the by-session and top-session cards show top-N bars and are explicitly not expected to sum to that total."
- consequence: No test can be written for the sentence; a tester who takes it literally files the top-N bars as a production bug.

**15. SPEC.md · CAP-5 success, line 41**

- trigger: "Staff can start a live session from the overview **or reports**" — the mobile Reports frame has no `New session` control; only mobile Overview and both desktop frames do.
- guard: "`New session` appears on desktop Overview, desktop Reports and mobile Overview only (frames 1, 2, 6); not mobile Reports."
- consequence: Either a control the design does not contain is added (CAP-6 fails) or CAP-5 is false on one breakpoint.

**16. SPEC.md · CAP-6 success, line 45 vs design-reference.md line 139**

- trigger: CAP-6 requires the literal mobile title "`Session detail ⌄`"; the design's frame title is the session's name — "`Weekend Camp 2026 ⌄`".
- guard: "Mobile session detail title is the session's own name with a chevron-down (design: `Weekend Camp 2026 ⌄`); `Session detail` is the frame name, not the page title."
- consequence: A literal reading renders the string "Session detail" as the page heading, and the conformance check has two authorities that disagree.

**17. SPEC.md · CAP-6 success, line 45**

- trigger: The sentence attaches "with the Overview/Reports pills" to all three mobile screens; the design's Session detail frame has a back link, name, status pill and stats, and no Overview/Reports pills.
- guard: "Overview and Reports carry the pill group; Session detail carries a back link, the name, a status pill and no pill group."
- consequence: Pills get added where the design has none, or the check is waived for the screen that matters most.

**18. SPEC.md · Capabilities (whole section) vs design-reference.md · "Overview (light and dark)" / "Reports (light and dark)"**

- trigger: No capability mentions dark mode, yet 3 of the 9 authority frames are dark and the repo has `pnpm test:e2e:theme`. CAP-6 says "both breakpoints", not "both themes".
- guard: "**CAP-7 — Themes:** every Sessions surface renders in the existing light and dark tokens; all five dark-checkable frames match; `test:e2e:theme` gains Sessions assertions."
- consequence: Dark frames ship unbuilt or unchecked, and the theme suite reports green because it asserts nothing about the new surface.

**19. data-model.md · Status derivation, lines 206–215**

- trigger: The terminal branch `else if session_date ... / else -> Live now` makes any session with NULL `session_date`, NULL `attendance_opens_at` and NULL `attendance_closes_at` read `Live now` forever; the same branch keeps an open-ended session live indefinitely.
- guard: "If `closes` is NULL, derive it as `opens + coalesce(duration_minutes, 60) * interval '1 minute'`; if `opens` is still NULL, fall back to `startOfDay(session_date)`; if all three are NULL, the status is `Completed` — never `Live now`."
- consequence: Legacy and imported rows advertise a live session with a public attendance link that `/attend` rejects, indefinitely.

**20. SPEC.md · CAP-2 line 29 + data-model.md line 293; `sessions` field list, line 182**

- trigger: `public_attendance_enabled` is absent from both the field list and the status derivation, but it is the first gate in `lib/attendance-session.ts` — a session with it false is not live and its link 403s.
- guard: Add `public_attendance_enabled` to the `sessions` field list and to the derivation: "`false` → never `Live now`, and no attendance link is exposed."
- consequence: The overview shows a `Live now` chip whose "Copy attendance link" leads to a 403, with no way for staff to tell why.

**21. SPEC.md · Constraints, line 58**

- trigger: "**`session_date` is text** (`YYYY-MM-DD`)" — `20261010000000_contacts_date_columns_to_date.sql` converted `public.sessions.session_date` to `DATE`, alongside `contacts.initial_contact`. The pseudocode then does string comparison (`session_date < today`) and the note says "parse as a local date, not a UTC timestamp", which only applies to text.
- guard: "`session_date` is `DATE`; format with the programme timezone (`Asia/Kolkata`) and never `Date.parse` it. `coalesce(attendance_opens_at, startOfDay(session_date))` needs the date cast to `timestamptz` explicitly."
- consequence: Implementer builds against a type that no longer exists; date comparisons silently run against whatever string the client library returns, and boundary tests pass in UTC but fail in IST.

**22. data-model.md · Overview query, lines 223–241**

- trigger: "One read of the scoped sessions … with an attendance count" cannot produce the design's four stat cards: `Attendees 1,284`, `Avg attendance 27 (+4 vs last month)`, `Repeat attendees 312 / 24% of attendees`, `Upcoming 6`. `attendance(count)` is per session; repeat attendees needs distinct contacts across sessions; "+4 vs last month" needs a previous period.
- guard: Add an "Overview stats" table defining each: Sessions = count in scope; Upcoming = count where `now < opens`; Attendees = Σ session counts; Avg attendance = attendees ÷ sessions; Repeat attendees = distinct contacts with ≥2 attendance rows ÷ distinct contacts in scope. Delete the delta unless a previous-period read is specified.
- consequence: The four cards — the most prominent element on the overview — are implemented to four different invented definitions, and "Avg attendance" and the month-over-month delta cannot be verified at all.

**23. data-model.md · Status derivation, line 220–221; SPEC.md · CAP-2**

- trigger: "`Upcoming` is supported for completeness; the current creation flow opens the window immediately, so new sessions are `Live now`" — yet the desktop Sessions card says "6 upcoming", the mobile tile counts `Upcoming`, and two designed rows are `Upcoming`. The status will be 0 and those rows unreachable.
- guard: "Upcoming is 0 for every session created by `POST /api/sessions` until scheduling exists; the designed `6 upcoming` and its two rows are sample data. The tile still renders, showing `0`."
- consequence: The built overview shows `0 upcoming` and no Upcoming chips where the design shows `6` and two rows — the conformance check fails on the single most visible number, or the builder invents a scheduling path the non-goals forbid.

**24. data-model.md · Session detail, line 258; design-reference.md line 142**

- trigger: "Attendee ordering follows the design: attendance order, then contact name" while the design places a `Sort` control in the `Attendees · 42` header with no options specified anywhere.
- guard: "`Sort` toggles Attendance order (default, `attendance.created_at`) and Name (A–Z); the control is hidden below 2 attendees" — or remove the control and fix the order.
- consequence: A dead control ships in the primary screen of the feature, and no test can assert list order.

**25. data-model.md · Session detail, line 254**

- trigger: "first contact (`contacts.created_at`)" — `contacts.initial_contact` is a real `DATE` column (converted in `20261010000000`) that means exactly "first contact"; `created_at` is the row-creation timestamp and is wrong whenever the record was backfilled.
- guard: "`first contact` = `contacts.initial_contact`; fall back to `contacts.created_at` only when it is null, and render `—` when both are missing."
- consequence: Every imported contact shows the migration date rather than the date they were first contacted — a silently wrong fact on the screen whose whole purpose is contact history.

**26. data-model.md · Edge cases, lines 288–292**

- trigger: "A deleted contact cannot orphan attendance" is true, but `sessions.preacher_id` and `sessions.created_by` are both `ON DELETE SET NULL` (`20261006000000`), so deleting a staff user nulls both and the session drops out of every Preacher/Assistant scope.
- guard: Add: "When `created_by` and `preacher_id` are both NULL (staff user deleted), only Admin sees the session," plus a test that nulls both columns.
- consequence: Handing over or removing a staff account silently erases their session history from the preacher who took over — the list just gets shorter, with no error.

**27. SPEC.md · Open Questions, line 82**

- trigger: The question offers "Add an expected-attendees field" while Constraint 49 says "No schema change" and Non-goal 63 says "Capacity … or per-session expected headcount" are out of scope. Two of the three answers are unbuildable under the spec's own constraints.
- guard: Delete the option and make the answer explicit: "`Needs attention` means zero check-ins until a capacity column exists; adding one is out of scope for this spec."
- consequence: Whoever answers the open question picks a path the constraints forbid, and the contradiction lands on the implementer as a scope change mid-build.

**28. SPEC.md · Open Questions, line 81**

- trigger: "The saved design no longer contains a desktop `Session detail` frame. Restore it…" — no saved revision ever contained one (both `sessions.figcraft` and `sessions-saved-0842.figcraft` are 9 frames across 2 pages), yet `sessions-design-set-summary.md` still says 10 frames and lists a desktop Session detail, and `preview/sessions-desktop/Sessions — Session detail (light).png` still exists.
- guard: Close the question: "No desktop Session detail frame exists in any saved revision. Delete the stale preview PNG and correct `sessions-design-set-summary.md` (10 frames, desktop detail) to 9 frames."
- consequence: The builder spends time restoring a frame that was never in the file, or the question stays open and blocks the entire desktop table plus the `Open ›` affordance indefinitely.

**29. SPEC.md · Open Questions, line 83**

- trigger: "Should `New session` open the existing form as a dialog from the overview, or keep the current inline form?" — the design has no dialog frame, and Constraint 54 says "do not invent chrome".
- guard: Resolve it: "Inline on `/sessions`, because the authority contains no modal frame and new chrome is forbidden; the header action scrolls to and focuses the form."
- consequence: A modal is built from nothing, reviewed against no frame, and CAP-6's side-by-side check cannot cover it.

**30. SPEC.md · general (absent section)**

- trigger: The spec has no verification section: no spec file names, no `test:e2e:sessions` script (none exists in `package.json`), no rows in `matrix-coverage-map.md`, and it touches `lib/supabase/data.ts`, which `docs/architecture/testing.md` line 282 sends to the full `pnpm test:e2e`.
- guard: Add `## Verification` naming `e2e/specs/sessions-overview.spec.ts`, `sessions-reports.spec.ts`, `sessions-mobile-detail.spec.ts`, a `test:e2e:sessions` script, the matrix rows claimed, and "full `pnpm test:e2e` before PR because `lib/supabase/data.ts` is shared."
- consequence: Nothing verifies the new surface; CI stays green because CI does not run e2e, and the empty-state/status/report bugs above reach production unmeasured.

**31. SPEC.md · frontmatter, line 13 (`companions` note) with the set as a whole**

- trigger: The documents are declared "the complete, **preservation-validated** contract", yet they contradict each other on the authorization rule (SPEC 52 vs data-model 200), the mobile detail title (CAP-6 vs reference 139), `Needs attention` (CAP-4 vs reference 121), `Absent` (reference 149 vs schema), `session_date`'s type (SPEC 58 vs migration), and the desktop detail frame (SPEC 81 vs the 9-frame file and the 10-frame summary).
- guard: Add a one-line precedence rule per field ("design frames win on layout; `data-model.md` wins on types and queries; SPEC wins on behaviour") and delete or fix each listed contradiction before the contract is called preserved.
- consequence: Every contradiction becomes an implementer coin-flip resolved differently in code, tests, and review, and the "preservation-validated" claim stops being a gate.


## edge-case-hunter

**1. data-model.md:207 (SPEC.md:58)**

- trigger: session_date fallback parsed as a 'local date' for a DATE column
- guard: opens = attendance_opens_at ?? parseDateOnlyInProgramTz(session_date); // never new Date("YYYY-MM-DD")
- consequence: Server (UTC) and browser (IST) derive different statuses; hydration flip

**2. data-model.md:209-215**

- trigger: attendance_opens_at, attendance_closes_at and session_date all NULL
- guard: if (!opens && !closes) return "Unknown"; // not "Live now"
- consequence: Undated legacy session reads Live now forever, sorts first, drops from reports

**3. data-model.md:208**

- trigger: attendance_closes_at NULL and duration_minutes NULL together
- guard: closes = s.duration_minutes == null ? null : opens + s.duration_minutes * 60000
- consequence: NaN/zero closes makes Completed fire at opens or never

**4. data-model.md:229-235**

- trigger: ORDER BY coalesces timestamptz attendance_opens_at with session_date, which SPEC.md calls text
- guard: order by coalesce(attendance_opens_at, session_date::timestamptz) desc nulls last
- consequence: Following the spec's text premise makes COALESCE unplannable; DATE casts at UTC midnight

**5. data-model.md:262-263**

- trigger: Range predicate calls JS startOfDay inside SQL and never fixes the range end
- guard: where coalesce(attendance_opens_at, session_date::timestamptz) >= :from and coalesce(attendance_opens_at, session_date::timestamptz) < :to
- consequence: Sessions at the midnight boundary land in one report and not another

**6. data-model.md:266-274**

- trigger: Attendance row whose created_at is NULL (backfill maps unparseable times to null)
- guard: bucket = date_trunc('week', coalesce(a.created_at, s.session_date::timestamptz))
- consequence: Weekly bars omit rows that Total attendance counts

**7. data-model.md:272**

- trigger: Check-in between 00:00 and 05:30 IST on a Monday
- guard: date_trunc('week', a.created_at at time zone 'Asia/Kolkata')
- consequence: IT Monday-early check-ins land in the previous ISO week and bar

**8. data-model.md:270**

- trigger: Range contains sessions but zero distinct contacts attended
- guard: repeatRate = contactsInRange === 0 ? 0 : repeatContacts / contactsInRange
- consequence: Repeat rate renders NaN% on the card

**9. data-model.md:271**

- trigger: Every in-range session has zero attendance, or none are in range
- guard: const scale = Math.max(1, ...counts.map(c => c.count))
- consequence: Bar width becomes 0/0 and the card renders broken

**10. SPEC.md:37 (CAP-4)**

- trigger: More than four in-range sessions feed the report cards
- guard: assert sum(attendance by session) === rangeTotal; top-4 display must not stand in for the total
- consequence: The stated acceptance invariant cannot pass on a real programme

**11. data-model.md:198**

- trigger: Assistant with assigned_preacher_id NULL reads the overview
- guard: if (staff.role === "Assistant" && !staff.assignedPreacherUserId) return []
- consequence: Filter errors or drops, yielding a 500 or whole-programme rows

**12. data-model.md:198**

- trigger: Assistant reassigned to another preacher after creating sessions
- guard: or preacher_id = assigned_preacher_id or created_by = staff.userId
- consequence: Assistant loses every session they created

**13. data-model.md:197**

- trigger: Migrated session with preacher_id NULL and created_by NULL
- guard: surface rows where preacher_id is null and created_by is null for backfill; do not leave them Admin-only silently
- consequence: Preacher and Assistant never see sessions they own

**14. SPEC.md:52**

- trigger: Any read path uses the user-scoped client instead of service role
- guard: create policy ... or (role in ('Preacher','Assistant') and preacher_id = auth.uid())
- consequence: Widened Preacher scope returns zero rows under existing RLS

**15. SPEC.md:52**

- trigger: Preacher opens a location session owned by another preacher
- guard: detail scope = preacher_id = caller or location_id in caller.locationIds or assigned-preacher match
- consequence: Live dashboard readable at /attendance but session detail 404s

**16. data-model.md:204-221**

- trigger: Session inside its window with public_attendance_enabled false
- guard: status = attendanceEnabled && inWindow ? "Live now" : deriveFromWindow()
- consequence: Row reads Live now and exposes a link that returns 403

**17. data-model.md:208**

- trigger: public_attendance_enabled true and attendance_closes_at NULL
- guard: eligibility closes = attendance_closes_at ?? opens + duration_minutes
- consequence: Status reads Completed while /attend keeps accepting check-ins

**18. data-model.md:218-219**

- trigger: Overview has several Live or Upcoming rows and reuses the dashboard timer
- guard: arm one timer at the earliest per-row boundary and re-arm after each fire
- consequence: Only one row flips; the rest stay stale until reload

**19. data-model.md:245**

- trigger: Detail URL id is not a UUID, e.g. /sessions/abc
- guard: if (!UUID_RE.test(id)) notFound()
- consequence: Postgres 22P02 surfaces as a 500 instead of the promised 404

**20. data-model.md:249-255**

- trigger: Attendee has attendance in sessions outside the viewer's scope
- guard: count and list attendance only where session_id in (scopedSessionIds)
- consequence: Count and history expose other preachers' session names and dates

**21. data-model.md:249**

- trigger: Session detail renders an attendee list of hundreds
- guard: select contact_id, count(*) from attendance where contact_id in (...) group by 1
- consequence: Per-attendee rollup queries make the detail O(n) round-trips

**22. data-model.md:253**

- trigger: Contact record requested for the mobile contact screen
- guard: email = contact.email ?? "—"; // contacts has no email column and no auth link
- consequence: Every contact renders an em dash where the design shows an email

**23. data-model.md:254**

- trigger: Contact created by backfill with created_at NULL
- guard: firstContact = contacts.initial_contact ?? contacts.created_at ?? "—"
- consequence: Design's 'Contact · since …' renders blank or the Airtable record date

**24. design-reference.md:141**

- trigger: Mobile session detail renders Invited, First-timers and Returning
- guard: firstTimer = min(session_date across contact's attendance) === this session; Invited has no source
- consequence: Invited has no data; the other two tiles have no definition

**25. design-reference.md:149**

- trigger: Attendance history row for a session the contact did not attend
- guard: history = attended sessions only; remove the Absent state or add absence data
- consequence: Absent can never render; the design's history control is dead

**26. data-model.md:274**

- trigger: In-range session still Upcoming or Live with zero check-ins
- guard: needsAttention = inRange && closes < now && attendanceCount === 0
- consequence: Running sessions are flagged as needing attention; Sessions run counts them

**27. data-model.md:237-241**

- trigger: Session with location_id NULL or pointing at a deleted location
- guard: left join locations l on l.id = s.location_id; render l.name ?? "—" and keep the row under All locations
- consequence: Row disappears under every location filter and shows a blank location

**28. data-model.md:241**

- trigger: Selected location filter matches no sessions
- guard: distinguish scope-empty from filter-empty in the empty state copy
- consequence: Programme-empty copy appears for a filter that has rows elsewhere

**29. data-model.md:240**

- trigger: Virtualised table footer reports 'the visible count'
- guard: footer shows filteredCount, not the number of mounted rows
- consequence: The footer number changes while the user scrolls

**30. data-model.md:271-273**

- trigger: Attendance counts tie across the top-4 and top-3 cards
- guard: order by count desc, coalesce(attendance_opens_at, session_date) desc, id
- consequence: Cards reshuffle between two identical reads

**31. SPEC.md:41 (CAP-5)**

- trigger: Admin whose location_ids is a subset opens New session
- guard: filter the form's location options to ids the POST will accept, or widen the Admin check
- consequence: Picker offers locations that the POST rejects with 403

**32. data-model.md:293-294**

- trigger: Live session whose attendance_url is NULL (legacy row or failed second write)
- guard: attendanceUrl ?? `${siteUrl}/attend?session=${session.id}`
- consequence: Live row exposes no link; CAP-5's 'link is available' fails


## structure

| # | Location / pass | Original | Revised | Why |
|---|---|---|---|---|
| 1 | structure | design-reference §Desktop Overview card 4 "Repeat attendees" vs §Mobile Overview tile 4 "Upcoming" vs §Mobile Session detail stats "Invited, Attended, First-timers, Returning" (~20 words of tile names across 3 passages) | QUESTION + add one `Figures` table (or one-line cross-reference per tile) mapping every stat card, tile and detail stat to its definition. Desktop and mobile must not disagree on which metric occupies slot 4 | The Reports figures get an 8-row definitions table in `data-model.md`; the Overview's four cards/tiles and the detail screen's four stats get none. Seven of eight overview figures are undefined, the fourth differs by breakpoint, and `Invited` has no source at all — it also contradicts §Constraints "no status, capacity or invite column". This is the only hole that stops a builder starting the overview screen. ~+15 words |
| 2 | structure | Desktop-detail decision, stated four times: §Constraints bullet 8 (~24 w), §Non-goals bullet 5 (~11 w), §Assumptions bullet 4 (~12 w), design-reference §Deltas bullet 1 (~18 w) | MERGE to two: keep §Open Questions #1 as the decision record and §Non-goals bullet 5 as the scope line. CONDENSE the Constraints bullet to "The desktop table's `Open ›` is inert until open question 1 is resolved." (~10 w). CUT §Assumptions bullet 4 | One unresolved fact told in four registers — constraint, non-goal, assumption, design history — so a reader cannot tell which statement governs when the question is answered. Two lines carry the same build instruction. Saves ~36 words |
| 3 | structure | CAP-6 success — mobile screens show "`Sessions ⌄`, `Reports ⌄` and `Session detail ⌄`" (~14 w) | QUESTION: design-reference § Session detail titles that screen "`Weekend Camp 2026 ⌄`" — the session's name, not a literal label. Reword CAP-6 to "session-name chevron title" or state the literal | The acceptance test and the authority it names disagree, so the side-by-side conformance check CAP-6 requires cannot pass whichever string the builder ships. Wording only; the requirement is untouched. 0 words |
| 4 | structure | §Open Questions — last section, after §Non-goals, §Success signal and §Assumptions (~74 w) | MOVE to directly after §Constraints. Order the three by what they block: desktop detail (blocks CAP-6 conformance) → capacity (blocks the design's `42 of 60`) → dialog-or-inline (cosmetic) | The three unresolved decisions are what a reader must settle first, and they are filed last — while §Assumptions above them already answers questions 1 and 2, so a linear reader meets the answers before the questions. Cheap fix, largest ordering gain. 0 words |
| 5 | structure | §Constraints — 10 flat bullets, 202 w, mixing hard rules, definitions and implementation contracts | Restructure into two labelled groups (or a two-column table): **Rules** (No schema change · Scope · Read path · Reports computed on read) and **Fixed behaviour** (Attendance total · Creation · Design authority · Mobile read-only · Desktop drill-down · `session_date` text) | Longest block in the folder and the most skimmed. Three different kinds of statement carry identical weight, so the four things a builder must never break are visually indistinguishable from settled detail. For human readers this is the pacing problem: 200 words of unbroken bold-lead bullets with no table, callout or grouping in the whole SPEC. ~0 words |
| 6 | structure | design-reference §Deltas from the first render — all four bullets (59 w) | CUT the section. Its content already exists at the point of use: the light/dark Needs-attention note is inline in §Desktop Reports item 6, "No action buttons" is inline in §Attendee contact, and the removed desktop frame is §Open Questions #1 | A change log inside a contract. Every delta is already recorded where the builder checks it, so the section is pure restatement — and keeping it is what makes the frame inventories read as revision history instead of target state. Saves 59 words. Alternative if this file doubles as the design's change record: keep §Deltas and instead strip the inline "(removed in the saved revision)" / "(only in the dark frame — …)" annotations (saves 17) |
| 7 | structure | data-model §Scope closing paragraph — "The current `GET /api/sessions` narrows to `created_by` only; … Reads still use the service-role client after the staff assertion." (27 w) | CONDENSE to "Today `/api/sessions` narrows to `created_by`; the spec widens a Preacher to their owned sessions." (~15 w) | The rest repeats the SPEC's scope bullet and its read-path bullet in a second wording. The predicate table above it is the section's real contribution; the prose adds a third version of one rule. Saves ~15 words |
| 8 | structure | SPEC preamble, second sentence — "Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits." (46 w callout total) | CONDENSE the callout into a file map: "`SPEC.md` is the contract; `design-reference.md` is the visual authority; `data-model.md` is the query contract. Read § Open Questions first." (~30 w) | Points the reader at `sources: []` — an empty list — and never says how the three files relate, which is the one thing a folder-level contract owes its reader. Same space, useful content. Saves ~16 words |
| 9 | structure | design-reference §Mobile — coverage ends at §Overview (dark); no dark §Reports or §Attendee contact, and nothing states whether that is a decision | QUESTION: add one line under §Mobile — "Dark frames rendered for Overview only" — or note it as a design gap | This file is the authority for CAP-6 ("matches Campaign on both breakpoints") and claims 9 frames, which arithmetically allows only one dark mobile screen. A builder checking dark conformance cannot tell a deliberate omission from a missing frame. ~+10 words |
| 10 | structure | design-reference §Mobile — §Overview (dark) (7 w), filed last, after §Attendee contact | MOVE under §Mobile §Overview and retitle "Overview (light and dark)", matching §Desktop | A dark variant of screen 1 is filed after screen 4, and desktop folds light and dark into one section while mobile splits them out. Same-document schema should be identical; the Reference model scores this as a schema violation. 0 words |
| 11 | structure | data-model §Session detail query, step 4 — "Contact record for the side panel / mobile screen…" (~40 w of the step) | CONDENSE: name the mobile screen only, or mark the side panel "deferred with desktop detail (§ Open Questions #1)" | "Side panel" is a desktop surface §Non-goals explicitly puts out of scope, so the step specifies a read path for a screen that does not exist. One of the two nouns has to go. 0 words |
| 12 | structure | §Success signal (60 w); §Why diagnosis (87 w); §Capabilities intent/success schema (386 w); data-model §Edge cases (113 w) | PRESERVE as written | §Success signal restates CAP-1…CAP-4 outcomes and reads cuttable — but at folder altitude it is the definition of done a human reviewer needs before opening three files, and the human-reader rules treat summaries as reinforcement. §Why is the only passage explaining why the module changes at all. The intent/success pair is the schema that makes capabilities citable. §Edge cases is genuinely MECE and earns its 113 words. Keep all four |
| 13 | structure | Minor, rolled up: "No scheduling." in §Constraints duplicates §Non-goals bullet 1; §Constraints "No aggregate table, materialized view, cron or stored status" already subsumes data-model.md's "No aggregate table or cached rollup" and "Never persist the result"; CAP-5's success criterion restates §Constraints "Creation keeps today's behaviour" timing; `sessions.figcraft` appears bare in §Constraints and as a full path in the companion; CAP-1…CAP-6 carry no inbound reference from any constraint or query section | CONDENSE each: drop the duplicate scheduling clause; let SPEC's no-aggregate line be the single statement of the rule; shrink the creation constraint to endpoint + public-attendance; use the full asset path once; either cite the CAP ids from data-model's query sections or stop numbering | Six small duplicate-or-dangling items; any one is trivial, together ≈24 words and several small stumbles. N further minor fixes; ask to expand. |

## prose

| # | Location / pass | Original | Revised | Why |
|---|---|---|---|---|
| 1 | prose | SPEC CAP-4: "attendance by session, weekly check-ins, top sessions and sessions with no check-ins" and "the attention card lists only in-range sessions with zero check-ins"; Assumptions defines the attention card as "sessions with zero check-ins"; data-model: "Needs attention — in-range sessions with zero attendance" | Name each card once, as the design does: "attendance by session, Attendance trend (weekly check-ins), Top sessions, Needs attention (sessions with no check-ins)", then reuse those names: "the `Needs attention` card lists only in-range sessions with zero check-ins"; Assumptions identifies the same card; data-model keeps `Needs attention` | One card answers to four names (weekly check-ins, attendance trend, attention card, Needs attention) and one condition to three (no check-ins, zero check-ins, zero attendance). A builder reconciling SPEC, design and data model cannot tell how many figures exist. Keeps the four-item list and its terse colon form. |
| 2 | prose | SPEC Success signal: "A session left open across its `attendance_closes_at` flips to `Completed` without a manual write." | "A page left open across a session's `attendance_closes_at` shows that session as `Completed` without a manual write." | "A session left open" also describes an attendance window left open — which is exactly what the creation flow does. `data-model.md` means the browser page ("an open page flips `Live now` → `Completed`"). Only the subject is wrong; the behaviour stated is unchanged. |
| 3 | prose | SPEC Constraints: "**Scope reuses the staff gate.** Admin sees the programme; Preacher sees sessions where they are the owning preacher; Assistant sees their assigned preacher's." and "after the staff assertion"; data-model Scope: "the spec widens a Preacher to their owned sessions" | "**Scope reuses the existing staff authorization check.** Admin sees the programme; a Preacher sees the sessions where they are the named preacher; an Assistant sees their assigned preacher's sessions." / "after that check" / "the spec widens a Preacher's scope to the sessions they own" | "Gate", "assertion" and `getStaffContext()` name one step three ways, and "gate" is a metaphor the document never introduces. "Owning preacher" and "owned sessions" are coined here and defined nowhere. "Their assigned preacher's" ends on a possessive with no noun; "widens a Preacher" widens a person rather than a scope. No authorization rule changes. |
| 4 | prose | SPEC CAP-5: "its attendance link is available"; Constraints: "and enables public attendance" | "its public attendance link (`/attend?session=<id>`) is available"; "and enables the public attendance link" | Both terms arrive before anything defines them; the contract names the route only on the last line of `data-model.md`. Naming it at first use keeps SPEC.md readable alone — the same route the contract already fixes, not a new one. |
| 5 | prose | SPEC CAP-5: "submitting it creates a session with attendance open now and closing at now + duration" | "submitting it creates a session whose attendance opens at that moment and closes at `now + duration_minutes`" | "With attendance open now" parses as the current state — attendance is open now — rather than the opening event the Constraints describe. "now + duration" is also a third notation alongside `duration_minutes` and "name, location, duration". |
| 6 | prose | SPEC CAP-6: "a side-by-side check against `design-reference.md` matches layout, type, spacing and tokens." | "a side-by-side comparison with `design-reference.md` shows matching layout, type, spacing and tokens." | The subject of "matches" is "a check", and a check is not what matches the design. Same requirement, same words otherwise. |
| 7 | prose | SPEC Why: "The design set gives Sessions…"; Open Questions: "The saved design no longer contains…"; Constraints: "**Design authority** is `sessions.figcraft`"; design-reference: "Authority: …" and "the light frame dropped it in the saved revision" | Introduce it once — "the saved design (`sessions.figcraft`)" — then "the saved design" throughout; keep "Authority:" in the companion as a heading-level pointer | Five names for one artifact: design set, the design, the saved design, the saved revision, design authority. A reader cannot tell whether the design set and the saved revision are the same thing, or which one is normative when they disagree. |
| 8 | prose | data-model: "Missing email renders `—`; the design's `priya.raman@gmail.com` is sample data."; design-reference frames: "48 sessions · folk programme", "Weekend Camp 2026", "42 of 60", "Sep 2025" | Keep "Missing email renders `—`" and add one line under the `design-reference.md` title: "All names, figures and dates in these frames are sample data." | Exactly one frame value is marked as sample data; the rest read as requirements. Stating it once where the frames live covers every value and drops the one-off caveat. |
| 9 | prose | SPEC CAP-1: "an empty programme renders the designed empty state"; CAP-3: "selecting one shows the designed record with phone, email…" | "renders the empty state specified in `design-reference.md`"; "shows the record specified in `design-reference.md`" | "Designed" is the only pointer to a companion file, and the body never names `design-reference.md` until CAP-6. A reader holding SPEC.md alone cannot find either definition. |
| 10 | prose | SPEC Open Questions: "The saved design no longer contains a desktop `Session detail` frame. Restore it, or is desktop limited to Overview and Reports?"; "…there is no capacity or invite data. Add an expected-attendees field, or show totals only?"; "or keep the current inline form on `/sessions`?" | "Should the desktop `Session detail` frame be restored, or is desktop limited to Overview and Reports?"; "Should an expected-attendees field be added, or should the report show totals only?"; "…or should `/sessions` keep the current inline form?" | Each pairs an imperative with an interrogative, so it is unclear whether the reader is told to act or asked to decide. The third also shifts subject from `New session` to an unnamed keeper of the form. Apply wherever the section lands; "under-filled sessions" is also a state the design never shows — consider "sessions below the shown capacity". |
| 11 | prose | SPEC Why: "Sessions is where the programme records who actually came, but today `/sessions` is a live check-in manager: staff start a session, watch the attendance dashboard, and the record then leaves their view." | Consider: "The Sessions module is where the programme records who actually came, but today `/sessions` is only a live check-in screen: staff start a session, watch the attendance dashboard, and then the record leaves their view." | "Manager" reads as a staff role in a document that names three roles two sections later. "Sessions" arrives as a bare plural before the module name is established. The third item in a list of staff actions is an outcome, not an action. The "record leaves their view" image is worth keeping. |
| 12 | prose | data-model Edge cases: "Attendance links stay the existing `/attend?session=<id>` route; the overview exposes the link for a Live session only." | "Attendance links use the existing `/attend?session=<id>` route; the overview exposes the link only while the session reads `Live now`." | "A Live session" reads as a fourth status beside `Upcoming`, `Live now` and `Completed`; the token is the one that exists. "Stay" describes the document, not the link. |
| 13 | prose | SPEC CAP-3: "an attendee's full contact record"; Constraints: "the attendee record joins `contacts`"; data-model: "Contact record for…" (the panel clause goes with the structure pass); Edge cases: "the contact panel always resolves" | "contact record" in all four places; Edge cases: "the contact record is always found" | One surface, four names. "Resolves" is jargon for "is found". The record joins `contacts`, so "contact record" is the accurate term — "attendee record" implies a second entity. |
| 14 | prose | SPEC CAP-1: "attendee total"; Constraints: "**Attendance total** is the count of `attendance` rows for the session"; Success signal: "the correct headcount"; design-reference: "attendee total" | "attendance total" in the prose; keep `Attendees` only where it quotes a card or column label | One figure, three names. The Constraints already define it as "Attendance total", so the other two can go without touching the definition. |
| 15 | prose | SPEC CAP-3: "first contact, sessions attended and last attended"; data-model: "first contact (`contacts.created_at`)" | "first contact date (`contacts.created_at`)" | "First contact" reads as a person or an event; the parenthetical shows it is a date, and its neighbours (`sessions attended`, `last attended`) are counts. |
| 16 | prose | design-reference: "The saved design removed `Open`, `Draft` and `Scheduled`; there is no manual status." | "The saved design removed the `Open`, `Draft` and `Scheduled` statuses; there is no manual status." | `Open` is also the row action `Open ›` six lines above and the verb in "attendance opens at …". Naming the three as statuses costs two words and removes the collision. |
| 17 | prose | SPEC Non-goals: "Per-session CSV export; call, disposition or Campaign integration." | "Per-session CSV export; call logging, disposition or Campaign integration." | "Call" is also a removed contact button, so the item can read as reinstating that button rather than excluding telephony features; "disposition" confirms the telephony sense, so only the noun is missing. |
| 18 | prose | design-reference: "primary `+ New session`" (Overview 2, Reports 2) vs "`+ New session` primary button right"; "Navy bar, logo left, moon/logout right"; "The builder is `build_sessions_designs.py`" vs "Campaign builder tokens" | "primary button `+ New session`" in all three; "moon and logout icons right"; "The design builder is `build_sessions_designs.py`" or leave the script bare, and "Campaign design-builder tokens" | Three micro-fixes in one file: "primary" alone can be read as priority or placement, and the mobile section already supplies the noun; "moon/logout" leaves open whether that is one control or two; "builder" names the Python script and a token set two rows apart, so the second use reads as the script's output. |
| 19 | prose | SPEC "## Open Questions"; "The reports totals match a direct count of `attendance`…"; data-model "(virtualised table)"; SPEC CAP-5 "without leaving the sessions flow" vs Why "without leaving the module" | "## Open questions"; "The report totals match…"; "(virtualized table)"; "without leaving the module" | Four small fixes: the only title-case heading among sentence-case siblings; "reports totals" reads as a missing possessive for a single figure; the corpus mixes -ise and -ize ("materialized view" in Constraints, "virtualised" here) and Microsoft style asks for -ize; "flow" and "module" name the same container, and "flow" also names the whole document. |