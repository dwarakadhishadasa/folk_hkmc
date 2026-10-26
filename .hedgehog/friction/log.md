## 2026-10-26T02:26:27.625Z

A layer-eng dispatch that takes longer than the 45-minute lease expires it, and hedgehog verify then refuses to run ('not leased to owner', task blocked with 'lease expired'). Recovery is hedgehog retry + targeted claim, and the work is intact. The lease must be renewed (hedgehog renew <task-id> --owner <owner> [--minutes <n>]) while a long dispatch is in flight — there is no automatic renewal.

## 2026-10-26T15:28:52.078Z STORY-1-3-CAMPAIGN-CHROME-UI

After a layer-eng lease expires, the layer's work is intact on disk but a fresh `hedgehog claim` snapshots it as pre-existing dirt, so `hedgehog verify`'s attribution filter drops every path and the task takes the no-op path: marked complete with no commit, and the files stay uncommitted for every later layer. Recovery has to either commit the layer's paths and run `hedgehog reconcile confirm`, or make a real content change to an in-scope file after the claim so the fingerprint moves.

## 2026-10-26T16:47:41.344Z STORY-1-4-CAMPAIGN-LIFECYCLE-API

The dialer denial sweep writes a temporary probe route under apps/folk/app/api/dialer/ while next dev is running, and Next 16 writes it into .next/dev/types/validator.ts. After the sweep deletes the route, a following pnpm test:static fails typecheck on the stale generated file until .next/dev/types is removed.

