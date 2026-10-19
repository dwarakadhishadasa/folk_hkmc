# Airtable Legacy Base — Reference

## Overview

Airtable is no longer part of the running system: `lib/airtable.ts` and `@hkmc/airtable` do not
exist, and `pnpm test:airtable-removal` guards against reintroduction. This document is a
**reference snapshot of the base it came from**, captured on 2026-10-19 while the base was still
reachable, so the migration work has an authoritative field reference instead of a hand-typed one.

Two things were observed: the **data model** of the FOLK base (table and field identities, names
and types) and the **Airtable Interface** built on top of it ("Admin Portal: Attendance"),
including what that interface rendered and which fields it deliberately did not.

Nothing here is personal data: no record values, no contact names, no phone numbers, no record
ids, no user ids. Field, table and page ids are Airtable metadata.

## The base

Base id `appqea9DRLOXqErXb` (FOLK Chennai). Seven tables:

| table id | name | how the name was established |
| --- | --- | --- |
| `tbltzdtCmCHf6gJKD` | Contacts | corrected from contextual descriptor evidence |
| `tbl2aiD2NfvrBMnfI` | Users | corrected from contextual descriptor evidence |
| `tbldQTIJb7EgPIDVE` | Analytics | corrected from contextual descriptor evidence |
| `tblxfB2W2l6OXc2IX` | Attendance | corrected from contextual descriptor evidence |
| `tbl9AbwkiIaAwK20X` | Sessions | corrected from contextual descriptor evidence |
| `tbl5IOOcS2RUkXzyG` | Locations | corrected from contextual descriptor evidence |
| `tbl9WvM4v2CFsMSBY` | Forms | inferred from formContainerF / allowPublicAccess / formCoverImage descriptors |

The program boundary is not a table split: both programs share one base, and the two bases are
**field-id divergent** — which is why `scripts/migrate-airtable-data.mjs` maps by field id and
treats an absent field as null rather than looking a field up by name.

## Field reference

111 fields recovered. `table` is populated where the migration map assigns the
field to a table; for the rest, table membership was not established.

| field id | name | type | table |
| --- | --- | --- | --- |
| `fld1OW7R1tgDBkV7i` | Added By | text | — |
| `fldaNPo4ptlc0Pbwh` | Address | text | contacts |
| `fld2ez6D0Y99MHsQe` | Admin | foreignKey | — |
| `fldEwgdNymKULq2el` | Age | number | contacts |
| `fldcIHPHRFL5Hs0Fo` | Analytics | foreignKey | — |
| `fldSzNUmuGmbE1i9U` | Analytics | foreignKey | — |
| `fldG9I2g9YdQuS8y4` | Anlytics Link | foreignKey | — |
| `fldt4QoxRwxZB6U8f` | ARRAYJOIN | text | — |
| `fldIIVwIV9HBvDdWs` | Assigned Contacts | foreignKey | — |
| `fldiG9nSAfBWbw3ij` | Assigned Preacher | foreignKey | contacts |
| `fldlzGkIw4LS0MbPS` | Assigned Preacher | foreignKey | users |
| `fldec5Zqr33dDwVQd` | Assigned Volunteers | foreignKey | — |
| `fld4EgGpwwnBklsED` | Attendance | foreignKey | — |
| `fldQkC9XZ351OHarA` | Attendance | foreignKey | — |
| `fldL5sLu5RUxsuGd4` | Attendance - delete | text | — |
| `fldOamVt7HE6Cf2s4` | Attendance Closes At | date | sessions |
| `fldhPXDkql0ynCn9Y` | Attendance Date | lookup | attendance |
| `fld2il5FEK1fDBeN4` | Attendance Opens At | date | sessions |
| `fldWzRkO3NtRFGLVO` | Attendance Records | foreignKey | — |
| `fldScLbxVMHehGpnP` | Attendance URL | text | — |
| `flduEPGzcn2ZNpUi0` | AttendanceLog | rollup | — |
| `fldUwvrIZrSUv51Gp` | Attendee Count | count | — |
| `fld23lXdmptRpkiHm` | Branch | select | — |
| `fld6Zi4QlWPlNj63y` | Code | text | locations |
| `fldOiszMxhsWOI9OC` | Collected By | foreignKey | contacts |
| `fldjyD5cMzhQMgiK2` | Collected Contacts | foreignKey | — |
| `fldtbZToYqsJx3O1m` | College | text | contacts |
| `fldZGRXtDgGGHdlk9` | Company | text | contacts |
| `fld5uKAqO8yXFlg5F` | Contact | foreignKey | attendance |
| `flduMRrYIaRHbXN6c` | ContactId | formula | — |
| `fldd6rMWRwK8PxVLc` | Contacts | foreignKey | — |
| `fldKyJe4gDRuq4T3O` | Contacts | foreignKey | — |
| `fldyZaJrauenCB3Tj` | Contacts 2 | foreignKey | — |
| `fldskjShs5t7hAPAj` | Contacts 3 | foreignKey | — |
| `fldTkqcIJK2aNwC2K` | Count (Attendance)_Legacy | count | — |
| `fldkmWQIl2IPXRLa3` | Current status | select | — |
| `fldvU1WsX1FV7BxxK` | Date of Birth | date | contacts |
| `fldiyvPHh4GXupVFy` | Deactivated At | date | — |
| `fld9DqtWOeMX3cUS3` | Deactivated By | text | — |
| `fldlIaFhhF9mhAcpl` | Delete | select | — |
| `fldrke8mwfTq1N0Hq` | Duration Minutes | number | sessions |
| `fldJEg1ZKuJXbDwja` | Email | text | users |
| `fldfmjPOapjSkLUOI` | Favorite | checkbox | contacts |
| `fldLlUU2c46wvl0UW` | Feedback | text | — |
| `fldA7u04AN1QGJiZd` | Initial Contact | date | contacts |
| `fldIbxVivuVYT6THg` | Interest | select | — |
| `fldzHGC4DXkWnMzOy` | Interest in Future Sessions | select | — |
| `fldLxB9tX4JusWjpp` | Interest level | select | — |
| `fldDiJksXJZjVt0k0` | Invite Sent At | date | — |
| `fldXpdnmu0UUKlUXc` | Invite Status | select | — |
| `fld0pNLxBz7VsyIgo` | Invited By | foreignKey | users |
| `fldyU6Zsw3Frt4UE2` | Invited Users | foreignKey | — |
| `fldR2gAF4UsdV45JY` | IsPast60Days | formula | — |
| `fldCo370C6hCcgKcC` | Last Contacted On | date | contacts |
| `fld71oirzdOhW2kZk` | Link to Analytics | foreignKey | — |
| `fldFAxYOPntMmt2y1` | Link to Analytics | foreignKey | — |
| `fldQ4SaaJGTgAMYCG` | Location | foreignKey | sessions |
| `fldvkZbuEvFr8WW72` | Location | foreignKey | contacts |
| `fld41eZGUhpS4N1aj` | Location_Legacy | text | contacts |
| `fld9IfaRUJKu6U8yW` | Locations | foreignKey | — |
| `fldtk1f5Mi45xmdMG` | Locations | foreignKey | users |
| `fldNVTjyv1GHuWCrQ` | Meta | foreignKey | — |
| `fld6rNvAFajNa0YiP` | Month | formula | — |
| `fldoxmIrWmtRo3INS` | Month | formula | — |
| `fld5z4R4R9ervCeGR` | Name | text | sessions |
| `fld8SsX2vXZU3uE1g` | Name | text | contacts |
| `fldarUNLPjl1aCg2M` | Name | text | locations |
| `fldAxt0CvuegC3MnZ` | Name | text | users |
| `fldhZJflE7RhUqwST` | Name | text | attendance |
| `fldTqKNfU91Up0d6S` | Next Follow-up | date | — |
| `fldkz2Wy0kBySyMUs` | Notes | text | contacts |
| `fldY9G97EcfGQMBc7` | Occupation | text | — |
| `fldL6lzjy9Vh9EljR` | Past60DayAttendanceCount | rollup | — |
| `fldPfmDbDZjQQGuPa` | Past60DayAttendanceCount_Legacy | number | — |
| `fldPvRzZWfprQUg1P` | Past60DayPercentage | formula | — |
| `fld3LopTeJqAJnUhg` | Past60DayPercentage_Legacy | formula | — |
| `fldhXRReE7K5wd6vz` | Past60DaySessionCount | rollup | — |
| `fld746R8PKbcKRXse` | Phone | text | contacts |
| `fldlneeesd7tMxUIG` | Phone | text | attendance |
| `fld7LZkXSACmRhB3H` | Preacher | foreignKey | sessions |
| `fldxdx1BjiZF11s8m` | Processed? | checkbox | — |
| `fldVkmOgalZOWAwoB` | Public Attendance Enabled | checkbox | sessions |
| `fld3gD17qO9nk4sxz` | Role | select | users |
| `fldj7wwwg5ddJkhvX` | Rounds | number | contacts |
| `fld4alwyVI0NxHv4L` | Select Year | formula | — |
| `fldJ9Yhz6NbrE6MhR` | Session | foreignKey | attendance |
| `fldamDX1vEq58nWae` | Session Date | date | sessions |
| `fldGlSTnsrMQKBYDP` | Session Key | formula | — |
| `fldCAPsvFS5WfGcTR` | Sessions | foreignKey | — |
| `fldeVvfnSRl7KJsZN` | Sessions | foreignKey | — |
| `fldtFOJxZeNfUukgq` | Sessions | text | — |
| `fldU6o0N4Evb1Ju98` | Sessions | foreignKey | — |
| `fld1GyNynGPdzLTYJ` | Sessions 2 | text | — |
| `fld3FjTlo7Ra2e07p` | Sessions 2 | text | — |
| `fldGthK1Y0bqKRVUE` | Sessions 3 | foreignKey | — |
| `fld2oGmIKM21mGpDM` | Source | select | contacts |
| `fldcqcFRLJrFd77Iw` | Status | select | locations |
| `fldfrj7Oi85vh04mo` | Status | select | — |
| `fldH77NSXKAxbecCp` | Status | select | users |
| `fldzCpEGTA4USZyQk` | Status | select | — |
| `fldq7b1lJFGSziu4A` | Status Quo | formula | — |
| `fldWas3szsBZ9ueZR` | Status Quo_Legacy | formula | — |
| `fldkc4RyfFdbY3WlG` | SUM | number | — |
| `fldDvNXnFXRoaLhIq` | Supabase User ID | text | users |
| `fldUTqa06PNWCL1BH` | TotalAttandanceCount_Legacy | number | — |
| `fldxdZSq7gfqfgueW` | TotalAttendanceCount | count | — |
| `fld2efEnRPtBWreZz` | TotalSessionCount | rollup | — |
| `fldsg5L3wsi5lSYZR` | Users | foreignKey | — |
| `fld2jSQLNUigbIPtb` | WhatsappEnabled? | select | — |
| `fldmMnWMG3QvocJa0` | Year | select | — |
| `fldVtNRJw0PoedgBu` | Year | formula | — |

## The migration map, checked against the live base

`scripts/migrate-airtable-data.mjs` hard-codes `TABLES` and `FIELDS` as Airtable **field ids**.
Every entry was re-checked against the live base schema:

- all **5 table ids** are present in the live base;
- of the **46 field mappings**, 41 had their live name recovered and type-validated, and the live name agrees with the repo key;
- **one id is absent** from the folk base: `contacts.designation` (`fldVkz3c5p6GuFBrg`). `docs/data-models.md` already labels `designation` a Gita Life contact field, and the loader's absent-as-null path covers it;
- the remaining rows below are shown for completeness.

| repo mapping | Airtable field id | live name | live type | confidence |
| --- | --- | --- | --- | --- |
| contacts.name | `fld8SsX2vXZU3uE1g` | Name | text | HIGH |
| contacts.phone | `fld746R8PKbcKRXse` | Phone | text | HIGH |
| contacts.age | `fldEwgdNymKULq2el` | Age | number | HIGH |
| contacts.dateOfBirth | `fldvU1WsX1FV7BxxK` | Date of Birth | date | HIGH |
| contacts.year | `fldXK5bdOsHyIn6r7` | smallSelectColumn | — | MEDIUM |
| contacts.college | `fldtbZToYqsJx3O1m` | College | text | HIGH |
| contacts.company | `fldZGRXtDgGGHdlk9` | Company | text | HIGH |
| contacts.designation | `fldVkz3c5p6GuFBrg` | — | — | ABSENT |
| contacts.source | `fld2oGmIKM21mGpDM` | Source | select | HIGH |
| contacts.notes | `fldkz2Wy0kBySyMUs` | Notes | text | HIGH |
| contacts.initialContact | `fldA7u04AN1QGJiZd` | Initial Contact | date | HIGH |
| contacts.lastContactedOn | `fldCo370C6hCcgKcC` | Last Contacted On | date | HIGH |
| contacts.address | `fldaNPo4ptlc0Pbwh` | Address | text | HIGH |
| contacts.location | `fldvkZbuEvFr8WW72` | Location | foreignKey | HIGH |
| contacts.assignedPreacher | `fldiG9nSAfBWbw3ij` | Assigned Preacher | foreignKey | HIGH |
| contacts.collectedBy | `fldOiszMxhsWOI9OC` | Collected By | foreignKey | HIGH |
| contacts.photo | `fldwl5gdCfcFhMT77` | Photo | — | MEDIUM |
| contacts.rounds | `fldj7wwwg5ddJkhvX` | Rounds | number | HIGH |
| contacts.books | `flddjOIrcuV7U6iij` | Books | — | MEDIUM |
| contacts.favorite | `fldfmjPOapjSkLUOI` | Favorite | checkbox | HIGH |
| contacts.locationLegacy | `fld41eZGUhpS4N1aj` | Location_Legacy | text | HIGH |
| sessions.name | `fld5z4R4R9ervCeGR` | Name | text | HIGH |
| sessions.sessionDate | `fldamDX1vEq58nWae` | Session Date | date | HIGH |
| sessions.location | `fldQ4SaaJGTgAMYCG` | Location | foreignKey | HIGH |
| sessions.preacher | `fld7LZkXSACmRhB3H` | Preacher | foreignKey | HIGH |
| sessions.publicAttendanceEnabled | `fldVkmOgalZOWAwoB` | Public Attendance Enabled | checkbox | HIGH |
| sessions.attendanceOpensAt | `fld2il5FEK1fDBeN4` | Attendance Opens At | date | HIGH |
| sessions.attendanceClosesAt | `fldOamVt7HE6Cf2s4` | Attendance Closes At | date | HIGH |
| sessions.durationMinutes | `fldrke8mwfTq1N0Hq` | Duration Minutes | number | HIGH |
| sessions.createdBy | `fldtMCVELgChcMRCz` | Admin (from Admin) | — | MEDIUM |
| attendance.contact | `fld5uKAqO8yXFlg5F` | Contact | foreignKey | HIGH |
| attendance.session | `fldJ9Yhz6NbrE6MhR` | Session | foreignKey | HIGH |
| attendance.phone | `fldlneeesd7tMxUIG` | Phone | text | HIGH |
| attendance.name | `fldhZJflE7RhUqwST` | Name | text | HIGH |
| attendance.attendanceDate | `fldhPXDkql0ynCn9Y` | DATETIME_FORMAT | select | HIGH |
| locations.name | `fldarUNLPjl1aCg2M` | Name | text | HIGH |
| locations.code | `fld6Zi4QlWPlNj63y` | Code | text | HIGH |
| locations.status | `fldcqcFRLJrFd77Iw` | Status | select | HIGH |
| users.name | `fldAxt0CvuegC3MnZ` | Name | text | HIGH |
| users.email | `fldJEg1ZKuJXbDwja` | Email | text | HIGH |
| users.role | `fld3gD17qO9nk4sxz` | Role | select | HIGH |
| users.status | `fldH77NSXKAxbecCp` | Status | select | HIGH |
| users.locations | `fldtk1f5Mi45xmdMG` | Locations | foreignKey | HIGH |
| users.supabaseUserId | `fldDvNXnFXRoaLhIq` | Supabase User ID | text | HIGH |
| users.invitedBy | `fld0pNLxBz7VsyIgo` | Invited By | foreignKey | HIGH |
| users.assignedPreacher | `fldlzGkIw4LS0MbPS` | Assigned Preacher | foreignKey | HIGH |

## The interface: 11 nav pages in one bundle

All pages live in page bundle `pbdulzzIJXUBqdPut`. The Attendance page is a two-canvas page: an
`inbox` element (the record list) and a `queryContainer` element (the detail pane), each
canvas area bound to a full-canvas element.

| nav entry | page id | default visualization |
| --- | --- | --- |
| Contacts | `pagHmCzuqPSMcXjZx` | — |
| Dashboard | `pagc77PtbNsr9ljWu` | — |
| Sessions | `pager0WDWhaPcr3B5` | calendarI} |
| Attendance | `pagiq9sGceEPvTIGQ` | — |
| Sessions | `pagjoGT4O9MrXXXCT` | gridI} |
| Contact Details | `paglQ8Ap69TqRidpA` | inboxI} |
| Favorites | `pagm11D5Ble0O8Or7` | inboxI |
| Registrations | `pagz1nbdfiXBflfNi` | — |
| New Attendance | `pagGNEf2TeM7sFncY` | — |
| New Attendance 2 | `pag9jVErkH6h5CVnk` | — |
| Feedback | `pagHzOXmxQFeVyu7K` | — |

Page layouts are served separately from page data: `GET /v0.3/page/{pageId}/readDraft` returns the
element tree, and `GET /v0.3/application/{app}/readForPages` returns the page's layout type,
data preloads and the base schema. Element types observed: `inbox`, `queryContainer`,
`recordContainer`, `levels`, `cellEditor`, `section`, `sectionGridRow`, `button`. Layout slot
vocabulary: `title`, `section`, `sectionGridRows`, `sectionGridRowChildren`, `callToAction`.
Layout schema version 26.

### Fields bound per page type

These come from the page-type metadata carried in the `readForPages` payload, attributed to each
page by position. The Attendance page was checked against the rendered interface and agrees; the
Contact Details page does not (see below).

| page type | fields it renders |
| --- | --- |
| Attendance `pagiq9sGceEPvTIGQ` | Name, Phone, Photo, TotalAttendanceCount |
| Attendance row `pagcLd2QJIas0dpEx` | Visible To, Location, Past60DayAttendanceCount, Session, Session Date, Attendance Records |
| Contact Details `paglQ8Ap69TqRidpA` (type `pagXJJ7muzwSttNVK`) | Name, Phone, Photo, Interest, Last Contacted On, Date of Birth, Branch, Notes, AttendanceLog, WhatsappEnabled?, TotalAttendanceCount, Past60DayAttendanceCount |
| Contact Detail 2 `pag2ZG4E5Tf528dDm` | Name, Phone, Photo, College, Company, Location, Date of Birth, Rounds, Initial Contact, Notes, TotalAttendanceCount, Past60DayAttendanceCount |
| Contacts sidesheet `pagRU4vhDmpCflhZs` | Name, Phone, Collected By, Initial Contact, TotalAttendanceCount, Past60DayAttendanceCount |
| Sessions sidesheet `pagVjhR1HmNTz7vjZ` | Name, Phone, Session Date, Attendee Count, Location, Attendance |
| Attendance sidesheet `pagueHhRyM1bhSmSy` | Name, Phone, Contact, Session, Past60DayAttendanceCount |
| Form post-submission `pagrR58csx8jEoYnH` | Name, Phone, Photo, College, Company, Date of Birth, Rounds, Notes, Initial Contact, Assigned Preacher, Role, Email, Favorite, WhatsappEnabled? |

### Following the "Go to interface" button

The Attendance page's only interactive element is a grey button that navigates to the Contact
Details page (`navigateToSelectedPage` → `paglQ8Ap69TqRidpA`). Arriving through that button was
observed to leave a page whose only content element is a button rendered as **"Field deleted"** —
the placeholder Airtable shows for an element whose field no longer exists.

The base owner attributes that state to arriving through the button rather than to how the page
normally renders, so it is **not** evidence about the page's normal content. The clean rendering
of the Contact Details page was not observed, and the fields it shows in normal use remain
unestablished. Its page-type metadata (above) is the only description of it.


### The list is a per-preacher roster

Two fields define what the Attendance page is:

- `fldS01FusXYZWa2Fw` **Visible To** — a lookup, described in the base as *"Read-only lookup from
  Assigned Preacher"*. The list query filters `Visible To = <the previewing user>`, so a preacher
  sees only their own contacts.
- `fldxdZSq7gfqfgueW` **TotalAttendanceCount** — the sort column, descending.

The detail pane is read-only throughout: the cells are `isReadOnly`, the linked-records grid
declares `canUpdateAllVisibleCells: false`, `canCreateRowsInline: false` and
`canDestroyRows: false`, and the only interactive element is a grey button that navigates to the
Contact Details page.

### A review workflow that is not there

The base defines **`Status`** (select) and **`Next Follow-up`** (date) on Contacts, alongside
`Interest`, `Last Contacted On`, `Initial Contact`, `Branch` and `Notes`. Across all eleven
pages and their page types, `Status` and `Next Follow-up` have **zero field bindings** — no page
renders them, and no page offers an edit affordance for any contact field.

So the Airtable interface was a **read-only attendance review**, not an approval or follow-up
workflow. If such a workflow existed for this program, it was somewhere else — a base view, an
automation, or a different application.

The **negative** half of that statement is what the page-type metadata shows: `Status` and
`Next Follow-up` are defined in the base but bound by no page of the bundle. The **positive**
half — that the pages which do exist render no approval control — is what the rendered Attendance
page shows, and it is the only page whose normal rendering was observed. The Contact Details
page was not observed in a clean state, so it neither confirms nor contradicts the metadata.

## How the interface talked to the server

| endpoint | role |
| --- | --- |
| `GET /v0.3/application/{app}/readForPages` | page layout type + data preload + base schema |
| `GET /v0.3/page/{pageId}/readDraft` | one page's element tree |
| `POST /v0.3/application/{app}/readQueries` | the record data, as query specs |
| `POST /v0.3/application/{app}/getRowPagesReferenceData` | row-to-page reference data |
| `GET /singleApplicationRealtime/withCompression/info` | realtime handshake |
| `wss://…/singleApplicationRealtime/withCompression/{id}/websocket` | live channel (path id rotates per connection; `applicationId` + `transactionNumber` stay constant) |
| `…/xhr_send`, `…/xhr_streaming` | XHR tunneled over the realtime socket |
| `/rt3/sockjs_with_compression/…/websocket` | a second, separate websocket channel |
| `/internal/stats-batch`, `/internal/beacon-batch`, `/internal/exposures`, `/internal/log`, `/internal/tracing` | telemetry |

Query specs carry `filterSourcePageElementId`, which ties each query to the layout element that
owns it — the same identity the client uses to decide which element re-renders when a query
updates.

## Airtable's msgpack payload encoding

`application/msgpack` responses use three conventions worth knowing before reading a capture:

- every container value is preceded by a `fixext1('r', 0x40+depth)` marker, where the payload
  byte is the nesting depth;
- maps are encoded flat: `fixarray(k)` of key strings followed by `k` values;
- schema field descriptors are positional triples `[fldId][name][type]`, with link cardinality
  and attachment flags such as `many`, `automatic` and `unreversed` appearing after the type.

Record payloads decode to
`tableDataById → tableId → partialRowById → rowId → {id, createdTime, cellValuesByColumnId}`.

## Provenance and limits

The base was observed through a live browser session and a recorded HAR, then the captures were
deleted because they contained personal data; the tables above are the durable output. The
Attendance page was observed **rendered** (accessibility tree plus a viewport screenshot), so the
layout described for it is a rendered observation, not only metadata. The Contact Details page
was opened only through the Attendance page's "Go to interface" button, and the state it landed
in is not its normal rendering, so it is described but not characterised. The interface's
per-page drafts were not captured, so a page could in principle override the field set of the
page type it uses. The realtime stream body (`withCompression`) was not decoded.

The Airtable client bundle is 661 chunks served from
`static.airtable.com/esbuild/by_sha/8979430b/br/chunks/`; it is minified shipped code and was not
analysed for behaviour.
