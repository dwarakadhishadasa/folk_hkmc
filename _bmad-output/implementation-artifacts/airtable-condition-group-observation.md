# Airtable condition-group observation — 2026-10-29

Target: `https://airtable.com/appqea9DRLOXqErXb/tbltzdtCmCHf6gJKD/viwSEPxjXAN17fCdv`
(Contacts — Grid view), observed in a dedicated Chrome profile with REA's CDP
provider while Dwaraka used **Filter → + Add condition group**.

## Evidence

| Evidence | REA id / path | What it covers |
| --- | --- | --- |
| Baseline page inspection | `ev_6a2b57e20a772b554032cc89c46d0dbbdbca3c578ec9b5a511e7278e762d165a` | Grid before the filter panel, 3,749 DOM nodes, 16 same-origin scripts. |
| 60 s execution observation | `ev_5c9101c15b1f677b4b2d8d0cfbb73a7a5e085f4c7cc700ed5303db4440d31fd1` | 69 retained requests with initiators/callsites, 30 excluded, 696 script sources. |
| Final filter-panel screenshot | `ev_20c27178374be089bc2430b2159f44c56fc3216ae025f2810d000ef983229886` | Root condition, OR group, nested AND group, footer actions. |
| `updateFilters` bodies | `/tmp/opencode/airtable-updatefilters.jsonl` (local CDP listener) | 10 full request bodies, all `200 application/json`. |
| Exported evidence bundle | `/tmp/opencode/rea-airtable-exec.evidence` | The retained execution observation above. |

## Per-view requests and scripts

### View 1 — Grid, filter closed

No filter mutation request. The page had already bootstrapped before REA
attached; the baseline inspection reports the grid DOM and the same-origin
scripts. The filter is a client-side view configuration, not a page load.

### View 2 — Filter panel opened, Add condition group clicked

| Request | Count | Note |
| --- | --- | --- |
| `GET /v0.3/application/<appId>/getAvailableAiModels?surface=Filter%20Assistant` | 1 | The AI filter-assistant box; out of scope for this rebuild. |
| `POST /v0.3/view/<viewId>/updateFilters` | see below | The complete filter tree, immediately on the group add. |
| `GET /v0.3/application/<appId>/getDependencyGraph` | 14 total | Refetched after view configuration changes; spread across the whole interaction. |
| `POST /internal/beacon-batch`, `/internal/log`, `/internal/tracing`, `/internal/stats-batch`, `/internal/exposures` | 14, 13, 7, 6, 1 total | Telemetry/consent traffic; not filter state. |

The filter builder itself is in:

| Script | Observed symbols / strings | Role |
| --- | --- | --- |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-SGCPF62W.js` | `addNewEmptyFilterGroup`, `Add condition group`, `Add condition`, `All of the following are true…`, `Any of the following are true…`, `xt` (group box), `Dr` (group `+` menu), `Sr` (conjunction picker) | Group rendering and add/remove controls. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-ZMKTFLND.js` | `addConditionGroupString`, `deleteConditionGroupString`, `maxDepthReachedMessage`, operator selector | Condition row, operator vocabulary, group strings. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-3LV7HESQ.js` | `type:"nested"`, `conjunction`, `filterSet`, `Uo` (depth/child validation), `Ho` (insert), `Go` (remove), `r_` (update conjunction), `am` (depth) | Filter tree model and mutation rules. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-HG27DKXO.js` | `addNewEmptyFilterGroup`, `addNewEmptyFilter`, `_syncFiltersAndRecalculateAllRowVisibilities`, `updateFiltersFromServer` | View-model methods that persist and re-evaluate the tree. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-KRFILSYV.js` | `Condition group`, `Add condition`, `zo` → `{conjunction:"and", filterSet:[]}`, `zs` | The newer filter UI's empty-group constructor and active-filter check. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-PBCZARBJ.js` | `updateFilters` in the operation list, `_sendRequest` | Request layer; initiator callsite for the POST. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-JI2XBHCK.js` | `case "updateFilters"` in the view-diff switch | Treats a filter change as a view-configuration change. |
| `https://static.airtable.com/esbuild/by_sha/3efd5398/br/chunks/chunk-AMUDOPBM.js` | `view.updateFilters,overall` | Analytics event only. |

### View 3 — Group edited, nested group added, group deleted

Every edit sent the **whole tree** to the same endpoint; there is no Apply
button and no separate group endpoint. The 10 captured bodies show the sequence:

| # | Change | Root | Nested shape |
| --- | --- | --- | --- |
| 1 | Group added / existing tree | `and` | `and` root, `or` group, `and` group inside it |
| 2 | Date value set to `oneMonthAgo` | `and` | Date leaf value is an object |
| 3 | Date operator changed to `<` | `and` | leaf operator changes |
| 4 | Date operator changed back to `=` | `and` | leaf operator changes |
| 5 | Exact date chosen (`2026-10-30`) | `and` | date object `{mode:"exactDate",...}` |
| 6 | Condition added inside nested group | `and` | duplicate `columnId` appears in a different branch |
| 7 | That condition switched to a multiselect field | `and` | operator `\|`, value `null` |
| 8 | One option ticked | `and` | value `["sel…"]` |
| 9 | Second option ticked | `and` | value `["sel…","sel…"]` |
| 10 | That condition deleted | `and` | back to the date branch |

All ten requests were `POST /v0.3/view/<viewId>/updateFilters` with
`Content-Type: application/x-www-form-urlencoded` and a body of the form:

```
stringifiedObjectParams={"filters":{"conjunction":"and","filterSet":[...]}}
&requestId=...
&secretSocketId=...
```

All ten responses were `200 application/json`.

## State model observed

```json
{
  "conjunction": "and",
  "filterSet": [
    { "id": "flt…", "columnId": "fld…", "operator": "contains", "value": null, "type": "columnComparison" },
    {
      "id": "flt…",
      "type": "nested",
      "conjunction": "or",
      "filterSet": [
        { "id": "flt…", "columnId": "fld…", "operator": "contains", "value": "text" },
        {
          "id": "flt…",
          "type": "nested",
          "conjunction": "and",
          "filterSet": [
            { "id": "flt…", "columnId": "fld…", "operator": "=", "value": "sel…" }
          ]
        }
      ]
    }
  ]
}
```

- Root and every group are `{ conjunction, filterSet }`.
- A group is `{ type: "nested", conjunction, filterSet }`.
- A leaf is `{ columnId, operator, value }`; `value` is a string, `null`, a list,
  or a date object.
- The group's conjunction governs its direct children; the parent's conjunction
  governs the group as one item.
- Airtable allowed the same `columnId` to appear in more than one branch. This
  grid keeps its existing one-condition-per-column product rule; that is the one
  deliberate divergence, recorded here so it is not mistaken for a parser bug.

## Rebuild mapping

| Observed Airtable | This grid |
| --- | --- |
| `filters` body | `fg` URL query value (same `conjunction`/`filterSet` shape, no Airtable ids) |
| Flat conditions | Existing `f.<colId>=<operator>:<value>` / `fa.<colId>` links, unchanged |
| Group model | `GridFilterGroup` / `GridFilterNode` in `components/grid/grid-filter-tree.ts` |
| Evaluation | `evaluateFilterGroup` (all/any per group; empty groups ignored) |
| Add group | Footer `+ Add condition group`; group `+` menu also adds conditions/groups |
| Group connective | Row-2 `and`/`or` selector, or a header selector when the group has ≤1 child |
| Delete group | Group-header trash button; removes the subtree |
| Immediate persistence | URL write: debounced `replace` for typing, `push` for structural edits |
| Drag handle / Copy from another view / Ask AI | Deliberately not rebuilt; the existing surface excludes them |
| Max group depth | 3 (Airtable enforces its own limit and reports it in `maxDepthReachedMessage`) |
