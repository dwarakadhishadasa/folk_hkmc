## 2026-10-26T02:26:27.625Z

A layer-eng dispatch that takes longer than the 45-minute lease expires it, and hedgehog verify then refuses to run ('not leased to owner', task blocked with 'lease expired'). Recovery is hedgehog retry + targeted claim, and the work is intact. The lease must be renewed (hedgehog renew <task-id> --owner <owner> [--minutes <n>]) while a long dispatch is in flight — there is no automatic renewal.

