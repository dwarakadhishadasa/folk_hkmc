# Airtable views — observed behaviour

Observation of the live `airtable.com` views feature, used as the reference for
the saved-views rebuild in this repository. Everything below is either observed
at runtime or marked as inference.

| | |
|---|---|
| Date | 2026-11-05 |
| Base | `appqea9DRLOXqErXb` (FOLK Chennai: Contacts) |
| Table | `tbltzdtCmCHf6gJKD` (Contacts) |
| Browser | Chrome 154.0.8037.92, CDP on `127.0.0.1:9222` |
| Airtable client build | `ffd39fc396c1522edc89da2fce4c2f1051c31800` |
| Client entry | `static.airtable.com/esbuild/by_sha/ffd39fc3/br/client/entrypoints/liveapp/run_liveapp.js` |

## How the evidence was collected

1. `list_browser_targets` on the loopback CDP endpoint established the target
   (REA evidence `ev_6cc1a898d95f0b398005e8559fbf3dab11007d38501b6fd03af47fcd87afcd8b`),
   and `capture_web_screenshot` captured the surface
   (`ev_87415286debdc7d4fd9fe3f39d31c7cdc841f42ff205bd0ebf1c55ade0d929fd`).
2. REA's `capture_browser_scenario` (connect mode) could not attach: it reported
   `protocol_error` from the Playwright-based provider, then
   `cleanup_incomplete` / `target_not_allowed`. The raw-CDP REA tools
   (`list_browser_targets`, `capture_web_screenshot`) worked, so the failure is
   in that provider's attach, not in the endpoint. **Limitation, and a real one
   for this investigation.**
3. Because the scenario provider could not drive the page, interactions were
   driven with a small CDP script (`/tmp/opencode/drive.mjs`, not committed)
   that dispatches real `Input.dispatchMouseEvent` / `dispatchKeyEvent` events
   and records `Network.requestWillBeSent` / `responseReceived` /
   `loadingFinished` plus `initiator.stack`. Every action below was performed by
   the agent, not by the operator.
4. Raw capture logs: `/tmp/opencode/run5.jsonl` … `run17.jsonl` (session
   artifacts, not committed). The pruned, per-view extract is committed at
   `evidence/requests.json`.

The views this was observed on belong to the operator's real base. One view was
created for the create-flow capture (`Grid 15`, id `viwfq9xMondrMilX9`) and was
deleted after the evidence was taken; the temporary duplicate
(`viwsNqwbrDcRayGwI`) was deleted too. Two `showOrHideColumns` calls were made
and reversed on `Grid 11`.

## Page structure

Root routes: `/app{baseId}/{tableId}/{viewId}` with an optional `?blocks=hide`
that collapses the right-hand blocks panel. Observed URLs:

- `https://airtable.com/appqea9DRLOXqErXb/tbltzdtCmCHf6gJKD/viwutCRv6OWfwMvzy?blocks=hide`

The page is a single application shell around one table:

1. **App bar** — base switcher, `Data / Automations / Interfaces / Forms`, save
   state ("All changes saved"), `Launch`, `Share`.
2. **Table tabs** — one per table, plus `+`; `Tools` on the right.
3. **Grid top bar** — sidebar toggle, table icon, **view name button**
   (`data-testid="viewName"`, toggles the view menu), then the toolbar:
   `Hide fields`, `Filter`, `Group`, `Sort`, `Color`, row height, `Share and
   sync`, search.
4. **Views sidebar** (`#viewSidebarContent`, 280px) —
   - `Create new...` (`data-tutorial-selector-id="viewSidebarCreateViewButton"`),
   - `Find a view` search input,
   - `View list options` gear,
   - the view list: one draggable row per view
     (`data-rfd-draggable-id="viw…"`) with a type icon
     (`GridFeature`, `GalleryFeature`, `KanbanFeature`, `Form`, `ListFeature`),
   - footer icons (help, feedback, notifications, avatar).
5. **Grid** — column header row, numbered rows, frozen `Name` column, footer with
   the row count ("1,152 contacts" / "32 contacts" on a filtered view).

### View menu (clicking the view name)

```
Collaborative view — Editors and up can edit the view configuration   ▸
Assign as personal view
Rename view
Edit view description
Duplicate view
Copy another view's configuration
Download CSV
Print view
Delete view
```

### Create-new-view menu (`Create new...`)

```
Grid
Calendar
Gallery
Kanban
Timeline
List
Gantt
────────────
Form
Section
```

Choosing a type opens a dialog: an inline-editable name pre-filled with the next
`Grid <n>`, `Who can edit` (`Collaborative` / `Personal` / `Locked`), `Cancel`,
`Create new view`.

### Delete

`Delete view` performs `destroy` immediately — no confirmation dialog was shown,
and the client fell back to the first view in the list ("Contacts", a List
view).

## Client routes and navigation

| Action | Route effect |
|---|---|
| Open a view directly | `GET /app{base}/{table}/{viewId}?blocks=hide` — full document load |
| Switch view in-app | `history.pushState` to the new view's path; **no document request**; `history.length` 18 → 19 |
| Create / duplicate | `pushState` to the new view's path after the create call |
| Delete | `pushState` to the fallback view's path |

Confirmed from run 16: switching from the List view to `Grid 11` changed the URL
and issued only `GET /v0.3/table/{tableId}/readData` and
`POST /v0.3/view/{viewId}/setAsLastUsed`; the 681 loaded scripts were not
re-fetched, and there was no `Document` request.

## API calls per view

Every view type is one table read plus one "last used" write. The **only**
view-specific request parameter is the view id — the type changes which
component renders, not which endpoint is called.

Full method/URL/status/params for each view is in `evidence/requests.json`.

| View type | View id | Requests on load |
|---|---|---|
| Grid | `viwutCRv6OWfwMvzy` | `GET /v0.3/application/{appId}/read` `{includeDataForTableIds:[tbl…], includeDataForViewIds:["viwut…"]}` · `POST /v0.3/view/{id}/setAsLastUsed` |
| Gallery | `viwdoum0yAnXFEcz5` | `GET …/read` with `includeDataForViewIds:["viwdou…"]` · `POST /v0.3/view/{id}/setAsLastUsed` |
| Kanban | `viweCLwoTq8zvGeOX` | `GET …/read` with `includeDataForViewIds:["viweCL…"]` · `POST /v0.3/view/{id}/setAsLastUsed` |
| Form | `viwpXmxM6qbYusBSX` | `GET …/read` with `includeDataForViewIds:["viwpXm…"]` · `POST /v0.3/view/{id}/setAsLastUsed` |
| List | `viwwJxrUngvx58yGJ` | `GET …/read` with `includeDataForViewIds:["viwwJx…"]` · `POST /v0.3/application/{appId}/readQueries` |

`read` carries the full load: table schema, the named view's configuration, and
the row/cell data for the included views
(`mayOnlyIncludeRowAndCellDataForIncludedViews: true`,
`allowMsgpackOfResult: true`). Response bodies are msgpack, so their internal
shape was **not** decoded — the config field names below come from the write
endpoints, not from the read.

The List view is the exception: it issues `readQueries` with a server-side query
spec rather than relying on the rows inlined by `read`:

```json
{"queries":[{"id":"qry…","spec":{
  "source":{"type":"table","tableId":"tbltzdtCmCHf6gJKD"},
  "columnIds":["fld…","fld…","fld…","fld…"],
  "filters":{"conjunction":"and","filterSet":[
    {"columnId":"fld…","operator":"contains","value":"ram"},
    {"columnId":"fld…","operator":"contains","value":"95"}]},
  "sorts":[],
  "virtualColumns":{"commentCounts":{"includeRowLevelComments":true,"columnIds":[]}}},
  "realm":{"type":"application"},"mayHaveAcceptableAuthorizationError":false}],
 "subscribeToRealtimeUpdates":true,"allowMsgpackOfResult":true,"isBackgroundRequest":false}
```

## View lifecycle calls

Captured while driving the create/rename/duplicate/delete flows. `+` in a
decoded name is the form-encoding of a space.

| Action | Request |
|---|---|
| Create (type menu → Grid) | `POST /v0.3/view/{newViewId}/create`<br>`{"tableId":"tbltzdtCmCHf6gJKD","name":"Grid 15","type":"grid","copyFromViewId":"viwutCRv6OWfwMvzy","copyMode":"new","personalForUserId":null,"lock":null}` |
| after create | `GET /v0.3/table/{tableId}/readData` `{includeDataForViewIds:[newViewId]}` then `POST /v0.3/view/{newViewId}/setAsLastUsed` |
| Rename | `POST /v0.3/view/{viewId}/updateName` `{"name":"Views probe","origin":"viewName"}` |
| Duplicate | `POST /v0.3/view/{newViewId}/create` `{…,"name":"Views probe copy","copyFromViewId":"viwfq9xMondrMilX9","copyMode":"duplicate",…}` then `readData` for the copy |
| Hide a field | `POST /v0.3/view/{viewId}/showOrHideColumns` `{"columnIds":["fld2oGmIKM21mGpDM"],"visibility":false}` |
| Show it again | same endpoint, `"visibility":true` |
| Delete | `POST /v0.3/view/{viewId}/destroy` `{}` then `readData` for the fallback view |

Note the create call carries `copyFromViewId`: a "new" view starts from the view
you were looking at, and `copyMode:"duplicate"` is the same call with the copy
named after its source.

Telemetry alongside every action (not part of the feature): `/internal/page_view`,
`/internal/beacon-batch`, `/internal/log`, `/internal/stats-batch`,
`/internal/exposures`, plus a consent wrapper at
`transcend-cdn.com/cm/619e6e3b-…/airgap.js`.

## Scripts

- Every view type load requested **the same 686 scripts**; the only set
  difference between view types was a per-load `blob:` worker URL. There is no
  per-view-type bundle: the view type selects a component inside one client.
- Entry point:
  `static.airtable.com/esbuild/by_sha/ffd39fc3/br/client/entrypoints/liveapp/run_liveapp.js`
- Chunks: `static.airtable.com/esbuild/by_sha/ffd39fc3/br/chunks/chunk-*.js`, e.g.
  `chunk-JVS7T67S.js`, `chunk-JBCRGJAE.js`, `chunk-432O5QUF.js`,
  `chunk-G73XDNIK.js`, `chunk-KKP6R7R7.js`, `chunk-K7CL4W7Y.js`,
  `chunk-M2P6M4QW.js`, `chunk-KQMBCIQ3.js`, `chunk-FLKVFBVC.js`,
  `chunk-GKOZQJTC.js`.
- Third-party libraries loaded as separate scripts include
  `static.airtable.com/js/lib/jquery/2.1.4/jquery-mod2.min.js`,
  `jquery-ui-1.11.4.custom.mod7.min.js`, `regenerator-runtime.min.js`.
- Initiator stacks: Airtable routes XHR through a telemetry wrapper, so the
  first frames of every stack are `airgap.js` → jQuery `$.ajax`. With a deeper
  stack capture (20 frames), the application frames for
  `showOrHideColumns` and `setAsLastUsed` were both
  `chunks/chunk-EZYS7MH5.js` — one shared view-model chunk, not a per-view-type
  chunk.

**Limitation:** hashed chunk names cannot be mapped to source feature names
without downloading and searching the chunks, which was out of scope. What is
established is the *set* of scripts (identical per view type) and the chunk that
issues the view-config writes.

## State management pattern (observed)

1. **Server-authoritative view model.** The view's configuration (filter, sort,
   visible fields, order, row height) comes down with the table read and is
   changed through narrow, typed endpoints — `updateName`, `showOrHideColumns`,
   `destroy` — not by sending a whole document back.
2. **Optimistic client.** The UI applies the change immediately; the endpoint
   persists it. There is no explicit Save, and the app bar reports "All changes
   saved" rather than a per-view save control.
3. **Per-user view memory.** `setAsLastUsed` records which view this user last
   opened, so a bare table URL returns them there. It is a separate write from
   the view configuration and is not shared.
4. **One data read per view.** Switching views re-reads row data scoped by the
   view id (`readData` in-app, `read` on a cold load), rather than filtering the
   already-loaded rows. The List view goes further and uses server-side
   `readQueries`.
5. **Client-side routing.** View id is a path segment; switching is a
   `pushState`, so shell, scripts and unshared state survive.
6. **View types are components, not endpoints.** The type is stored on the view
   and decides what renders; all five observed types use the same read/write
   calls.

### Inferred, not observed

- The exact JSON shape stored for a view (filter tree, sort list, column set,
  row height) — the read response is msgpack and was not decoded.
- Whether `filter`/`sort` changes write through endpoints named
  `updateFilters`/`updateSorts` (the naming is inferred from `updateName` and
  `showOrHideColumns`). Only field visibility and rename were captured.
- Collaborative/Personal/Locked enforcement — the dialog was seen, the
  permission behaviour was not exercised.

## What this repository built from it

See `implementation.md`. Deliberate deviations: views live in this app's
database rather than Airtable's; the view id is a query parameter
(`/contacts/grid?view=<uuid>`) because the grid's whole arrangement already
lives in the query string; deleting asks for confirmation; and collaboration
scopes are not implemented.
