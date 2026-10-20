# Airtable "Admin Portal: Attendance" — interface findings

Scope: the Airtable Interface page `pagiq9sGceEPvTIGQ` (nav entry "Attendance") in base
`appqea9DRLOXqErXb`, observed live via REA's CDP browser provider and via a user-recorded
HAR. PII-free: no record values, names, phone numbers or record ids are included.

## 1. Shape of the interface

The nav entry "Attendance" is a two-canvas page:

- `pelOLLZKm8GojnA5D` — type `inbox` (the record list), querying table `tbltzdtCmCHf6gJKD`
- `pelwY5LhxLnxB5fkX` — type `queryContainer` (the detail pane)

Its expanded row page `pagcLd2QJIas0dpEx` ("Inbox: Contact Detail 2") holds 15 elements:
a large primary-header cell, a formula cell labelled "Number of sessions attended in past 2 months",
two Occupation cells, a read-only `levels` grid over the Sessions table, and a grey
`button` whose action is `navigateToSelectedPage -> paglQ8Ap69TqRidpA` ("Contact Details").
Layout slots: `title`, `section`, `sectionGridRows`, `sectionGridRowChildren`, `callToAction`.
Layout schema version: 26.

## 2. Data model

Seven tables: Contacts `tbltzdtCmCHf6gJKD`, Attendance `tblxfB2W2l6OXc2IX`, Sessions
`tbl9AbwkiIaAwK20X`, Users `tbl2aiD2NfvrBMnfI`, Analytics `tbldQTIJb7EgPIDVE`, Locations
`tbl5IOOcS2RUkXzyG`, Forms `tbl9WvM4v2CFsMSBY`. 111 fields recovered (see
`airtable-legacy-schema.json`).

Fields the Attendance page binds:

| field id | name / type | role |
|---|---|---|
| fld8SsX2vXZU3uE1g | Name (text) | list card + detail heading |
| fld746R8PKbcKRXse | Phone (text) | list card |
| fldwl5gdCfcFhMT77 | Photo (multipleAttachment) | list card thumbnail |
| fldS01FusXYZWa2Fw | Visible To (lookup of Assigned Preacher) | list filter — per-preacher visibility |
| fldxdZSq7gfqfgueW | TotalAttendanceCount (count) | list sort, descending |
| fldL6lzjy9Vh9EljR | Past60DayAttendanceCount (rollup -> SUM(values)) | labelled "Number of sessions attended in past 2 months" |
| fldtbZToYqsJx3O1m / fldZGRXtDgGGHdlk9 | College / Company (text) | Occupation section |
| fldJ9Yhz6NbrE6MhR / fldF7ABQORmBaJerW | Session (foreignKey) / Session Date (lookup) | "Records" grid columns |
| fldWzRkO3NtRFGLVO | Attendance Records (foreignKey -> Attendance) | link expanded by the grid |

## 3. Connection

Verified load order (from the recording): `GET /v0.3/application/{app}/readForPages`
(layout + preload, params `includeDataForPageId`, `expectedPageLayoutSchemaVersion=26`,
`navigationMode=preview`, `urlSearch`, `shouldPreloadQueries`, `allowMsgpackOfResultIfEnabled`)
-> `GET /v0.3/page/{pageId}/readDraft` (page layouts) -> `POST /v0.3/application/{app}/readQueries`
(data) -> `POST .../getRowPagesReferenceData` -> realtime `GET /singleApplicationRealtime/withCompression/info`
-> `wss://.../websocket` (plus `xhr_send`/`xhr_streaming` over the same socket family) and a
second `/rt3/sockjs_with_compression/...` channel. Telemetry: `/internal/stats-batch`,
`/internal/beacon-batch`, `/internal/exposures`, `/internal/log`, `/internal/tracing`.

Query specs carry `filterSourcePageElementId`, tying each query to the layout element that
owns it; list queries filter `Visible To = <preview user>`, detail queries filter
`rowIds = <selected record>`, and the linked grid uses a `foreignKey` source
(table Sessions, foreign column `fldWzRkO3NtRFGLVO`).

Client bundles: 661 unique chunks, 28.8 MB, from `static.airtable.com/esbuild/by_sha/8979430b/br/chunks/`
(including `lazy_page_creator_implementation-KOBK6V2U.js`).

## 4. The "review" question — a negative result

The base defines `Status` (select) and `Next Follow-up` (date) on Contacts, and the base
also holds `Interest`, `Last Contacted On`, `Initial Contact`, `Branch`, `Notes`, `Assignee`.
Across all 11 interface pages and their page types, **`Status` and `Next Follow-up` have zero
field bindings** — no page renders them. The Contact Details type renders Name, Phone, Photo,
Interest, Last Contacted On, Date of Birth, Branch, Notes, AttendanceLog, WhatsappEnabled?,
TotalAttendanceCount, Past60DayAttendanceCount — all read-only.

Conclusion: the "Record Review" surface is a **read-only attendance review** (a per-preacher
roster sorted by attendance), not an approval/follow-up workflow. Any such workflow must live
outside this interface bundle (a base view, an automation, or a different app).

## 5. Payload encoding (Airtable application/msgpack)

- every container is preceded by a `fixext1('r', 0x40+depth)` marker (the payload byte is the
  nesting depth);
- maps are encoded flat: `fixarray(k)` of key strings followed by k values;
- schema field descriptors are positional triples `[fldId][name][type]`;
- link cardinality and attachment flags appear as `many` / `automatic` / `unique` / `unreversed`;
- record payloads decode to `tableDataById -> tableId -> partialRowById -> rowId -> {id,
  createdTime, cellValuesByColumnId{fldId: value}}`.

## 6. Open items (recorded in the REA session)

- per-page `readDraft` drafts were not captured, so a page could override the type's field set;
- the `withCompression` realtime stream body remains opaque.

## 7. Provenance

Evidence: `ev_11060e4feee1…` (payload capture, `historical-reference`), `ev_b741c173fd7e…` and
`ev_5e07125d3090…` (live CDP observation), `ev_87083775aa71…` (static bundle analysis),
`ev_58bef09178b7…` (screenshot), `ev_4ca5e35bee3d…` / `ev_12b2cf91c18d…` (structural captures).
Derived, body-free artifacts: `airtable-legacy-schema.json`, `airtable-legacy-pages.json`.

The capture session itself was lost when the machine's `/tmp` was wiped; the committed
documentation and these derived artifacts are the durable output. See
`docs/airtable-legacy-base.md` for the full reference.
