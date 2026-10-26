---
name: hedgehog-authored-loop
description: Use for every unit of change-work on an adopted core (`.hedgehog/core.yaml` present, written by `hedgehog-adopt`) — building one layer per claimed packet, gated by `hedgehog verify` and committed one layer at a time. Triggers on "next step", "what's next", "build this", or the start of any work session on an adopted repo. Also covers the Correction Protocol and the per-change Stop Condition.
---

# Hedgehog Authored Loop

The operating loop for a repo Hedgehog was adopted onto: `hedgehog
claim` reserves the packet(s) for ready layers, `layer-eng` builds each,
`hedgehog verify` gates and commits it. The build graph
(`.hedgehog/hedgehog.db`) is the live list — query it via `hedgehog
status`/`hedgehog ready`, never re-derive state from prose.

## Where this core's shape lives

Two files carry the layer sequence, and both are locked:
**`.hedgehog/core.yaml`** is the design authority, always a linear chain
(no module axis); **`.hedgehog/adoption.md`** is the rationale: the
repo's own commands and their source, why the layers are ordered the way
they are, and what was deliberately left unmodeled (see `hedgehog-adopt`'s
"No global Stop Condition" and "Coverage is partial" — both apply here
and are not repeated below).

`.hedgehog/core.yaml` is what the compiler and every command below
actually read. Read `adoption.md` at the start of a session to know what
this adopted repo's discipline is — `layer-eng` reads it before writing
any layer. `adoption.md`'s "Repo shape" section is a dated snapshot, not
a live model — treat it as calibration for how new code should look, and
read the actual files it describes when precision matters more than a
snapshot can offer.

### core.yaml vs. the packet

`hedgehog plan` **copies** each layer's scope globs, verify command and
commit message onto every task row when it compiles. From that moment
the row — which is what the packet shows — is what `hedgehog claim` hands
out and what `hedgehog verify` gates against. `core.yaml` is no longer
consulted for a task that already exists.

So an edit to `core.yaml` after `plan` has run does **not** reach
already-compiled tasks, and re-running `hedgehog plan` won't apply it
either: compiling an intent flips it to `active`, and `plan` only reads
`proposed`/`planned` intents, so it reports "0 intent(s) compiled" and
changes nothing.

If the packet and `core.yaml` disagree, the packet is what your work will
actually be judged by. Reconcile, don't pick a winner:

1. `hedgehog status` prints a **DRIFT** section: every task whose
   compiled fields no longer match `core.yaml`, field by field, with
   `core.yaml`'s value against the task's.
2. `hedgehog plan --recompile` rewrites those fields from the current
   `core.yaml` on tasks nothing has acted on yet (`proposed`, `planned`,
   `ready`), and refuses `building`, `verifying`, `complete` and
   `blocked` tasks, naming each and why. `--dry-run` previews it;
   `--include-blocked` opts in the blocked ones (their working-tree work
   was done against the old scope, so check it after);  `--strict` exits
   non-zero when drift remains.
3. Drift `--recompile` won't touch — a task already built or committed, a
   layer dropped from `core.yaml`, a changed `depends_on` — is a
   Correction Protocol case (below), not a field rewrite.

Never patch a task row in SQLite by hand to work around this. The DB is
derived and gitignored; `hedgehog db rebuild` re-derives every task from
`core.yaml` and the committed intents, so a hand-patched row silently
disappears on the next rebuild or fresh clone.

## Linear chain only

An adopted core is always a linear chain: one pass total, one task per
layer, no `module` dimension, no `{module}` anywhere in `core.yaml`. Each
batch of change-work walks the same fixed sequence `hedgehog-adopt`
locked at adoption time. `hedgehog claim --count N` naturally returns at
most one task at a time — there's no fan-out to gain from a linear chain,
so concurrent execution buys nothing here.

## The Loop (every unit of work)

1. **Run `hedgehog claim --count N --owner <owner>`.** `<owner>` is this
   session. Claim is atomic and lease-based, and returns up to N task
   packets (STATUS/INTENT/RELEVANT RULES/INHERITED DEBT/WHY NOW/BLOCKED
   DOWNSTREAM/ALLOWED SCOPE/VERIFICATION/HONESTY each) that the
   scheduler has already verified are safe to run together — trust it:
   a packet is never handed out unless its dependencies are `complete`
   and it doesn't conflict with anything else in the batch. `--count`
   is a maximum, not a promise; on a linear chain it naturally returns 1
   regardless of `N`. `hedgehog ready` previews the claimable/held-back
   split without claiming anything.
2. **For each claimed packet, decide inline vs. dispatch, then act.**
   Default to dispatching to a `layer-eng` subagent, along with the
   reminder to read `.hedgehog/adoption.md` for what its layer owns.
   Build or confirm the packet directly instead, with no subagent, only
   when the packet clears one of these from the packet alone:
   - **ALLOWED SCOPE** names a small, bounded set of files the
     orchestrator can read directly without ballooning its own context.
   - **RELEVANT RULES** make the layer's irrelevance checkable in one
     read — the change's own rules describe a concern that plainly
     doesn't touch this layer's area.
   - The change, once its shape is known, is small and mechanical — a
     rename, an import fix, a one-line registration — rather than
     something needing a subagent's isolated, fresh-context judgment.

   Escalate to a full `layer-eng` dispatch mid-layer the moment any of
   these turns out false — a "quick check" that surfaces real
   cross-file reasoning, an unclear scope, or a diff bigger than
   expected. Never lock in "inline" once guessed. Either way, the
   layer's own VERIFICATION command and ALLOWED SCOPE gate apply
   identically in step 4 — this choice changes who reads, writes, and
   checks, never what gets checked before it's accepted. A no-op found
   inline is still reported per the packet's HONESTY rules, never
   assumed.
3. Whoever built the packet — the `layer-eng` agent, or the orchestrator
   itself when it went inline — **runs the packet's VERIFICATION command
   on that work** as a sanity check before reporting back — necessary,
   not sufficient. Per task: the work is reported as done; the task is
   not moved and nothing is committed yet.
4. **As each report arrives, verify it — one at a time, serially.** Run
   `hedgehog verify <task-id> --owner <owner>`. It checks the touched
   files against the packet's ALLOWED SCOPE, runs the layer's
   VERIFICATION command, and on a pass writes the commit (the exact
   message from `core.yaml`, plus the updated build graph) and unlocks
   the next layer. On a scope violation or a failing check, the task
   moves to `blocked` with a `blocked_reason` of `scope_violation` or
   `verification_failed`, and nothing downstream unlocks. Fix the work,
   then run `hedgehog retry <task-id>` to return the task to `planned`,
   claim it again (by task id — see below), and verify again —
   `hedgehog verify` only accepts a task you currently hold in
   `building`, so a blocked task has to go back through `retry` and
   `claim` first. Don't hand-commit around it.

   A `blocked` task anywhere in the graph — in this layer or any other —
   makes `hedgehog claim --count N` refuse to hand out anything at all,
   with a non-zero exit naming the blocked task(s). `hedgehog status`
   lists them too, under NEEDS ATTENTION. Fix and `retry` the named
   task(s) before claiming more. A **targeted** `hedgehog claim <task-id>
   --owner <owner>` is exempt — that's how the just-retried task gets
   reclaimed in the step above. A lease the same `claim` call reaps for
   having just expired is exempt too: that call still claims whatever
   else is ready, and the reaped task lands in NEEDS ATTENTION for the
   next `claim` call to stop on.
5. **Repeat** — `hedgehog claim --count N --owner <owner>` again for the
   next batch.

Each `hedgehog verify` call commits exactly one layer, built right for
what's known now; a wrong layer is fixed forward later via the Correction
Protocol.

## The packet's INTENT is the whole intent

The packet's **INTENT** block carries the goal and outcome of the intent
this layer belongs to — not a restatement of the layer's own objective
("domain-service for card"), which says what kind of thing to build and
nothing about what it's for. This matters because a layer's `verify`
command runs the tests that layer itself wrote: it measures internal
consistency, never coverage of what was asked. A layer that builds half
the intent's goal and tests that half exhaustively is green.

So: build the layer's share of the goal, and report anything the goal
asks for that the packet's scope and rules don't account for — that's a
`planner` or Correction Protocol call, not something to quietly drop.

When `hedgehog verify` closes the **last** layer of an intent, it prints
the goal and outcome back out as an **INTENT CHECK**. Read the work built
across that intent's layers against it before moving on. It isn't a gate
and can't be one — it's the only point in the circuit where what was
built is compared to what was requested.

## Declared debt between layers

A layer that hits a real limitation the next layer has to compensate for
declares it:

```
hedgehog debt add <task-id> "<note>"
```

The note lands in the **INHERITED DEBT** section of the packet of every
task that depends on that one, so it reaches the layer that inherits the
problem. A "KNOWN LIMITATION" comment in a source file is not a
mechanism — the inheriting task's packet is assembled from the graph, and
nothing reads that comment. `hedgehog debt list [<task-id>]` reads them
back.

Debt lives in the build graph only (not a committed log), so it does not
survive `hedgehog db rebuild` — declare it while the chain is live, which
is when it's needed.

## Intra-layer conventions

An adopted repo's stack is whatever it already was before adoption, so
the conventions inside a layer come from two places: the repo's own
existing idioms (its error-handling style, its naming), and whatever the
earlier layers already established on disk for this change. Read before
writing, and stay consistent with what's there.

Two hold regardless of stack:

- **A layer owns one artifact, reached through the interface the
  rationale file named** (or, on an adopted core, the seam it named). The
  layer below is consumed through that interface, not reached around —
  the boundary is what makes the layer independently verifiable.
- **Each layer's tests live inside that layer's scope** and run under its
  own `verify` command. A layer whose command passes with no tests
  certifies nothing.

## Friction log

Same mechanic as `hedgehog-loop`'s Friction log — log real friction via
`hedgehog friction add "<note>" [--task <task-id>]`. `tweaker`'s job 2
wakes on the log itself, not a build boundary: once three or more rows
have accumulated since the last `reviewed:` marker.

## Correction Protocol

Same 5-step mechanic as `hedgehog-loop`'s Correction Protocol (quiesce,
patch the upstream layer in place, fast-forward every dependent layer as
its own commit, commit messages as the explanation, resume the loop with
`hedgehog claim`) — read that skill's version for the full statement,
including why quiescing rather than stopping in-flight work is strictly
correct. One difference: if the patched layer produces a build artifact
that downstream layers or a running dev process consume (a compiled
package, a generated client, a bundled asset), rebuild it before
re-verifying — an unbuilt patch looks unchanged to anything reading the
built output. Before patching, check the host's LSP tool, when the
project's language has LSP support, for what already references the
symbol being changed — the one thing a per-repo stack can't fix in
advance is whether that tooling exists at all.

When the correction is to the **layer sequence itself** — a layer in the
wrong place, a missing layer, a scope glob that never fits — that's a
`hedgehog-adopt` re-run, not a patch: `.hedgehog/core.yaml` and
`adoption.md` are locked outside that path, and changing them re-shapes
every task the graph compiles. Stop, say what the design got wrong, and
hand to `hedgehog-adopt`.

Once `hedgehog-adopt` has changed `core.yaml`, the edit still has to be
pushed into the already-compiled graph — run `hedgehog plan --recompile`
(see "core.yaml vs. the packet" above) and read what it reports. Tasks it
refuses are the ones this Correction Protocol has to fix forward in
commits instead.

### Post-build entry

There is no build to be "post" on an adopted core — see "No global Stop
Condition" below. A structural correction on already-`complete` tasks is
still fixed forward in new commits, same shape as `hedgehog-loop`'s
Post-build entry: there's no task to stop and no loop to resume, every
touched task stays `complete`. Verify each patched layer with its own
`verify` command from `.hedgehog/core.yaml`.

## Layer Transition Checks

Before starting a layer that depends on an earlier one, confirm the
earlier layer's task is `complete` in `hedgehog status` — `hedgehog claim`
already guarantees this, so this check matters only when picking work up
by hand after an interruption.

Use the `reviewer` agent at the last layer of a batch of change-work — it
checks what the mechanical gate can't: whether the layer boundary
`adoption.md` described actually held, and whether the interfaces
between layers stayed the ones that were designed.

## Rules

- **A layer starts only once the one before it passes its own
  verification.** Only one task is ever ready at a time on a linear
  chain.
- **A wrong layer gets fixed at its source** — the Correction Protocol,
  not a downstream workaround.
- **The layer's own `verify` command gates every commit.** Never weaken
  it to clear a gate.
- **Scope is the boundary.** A layer writes inside its ALLOWED SCOPE and
  nowhere else; a change that needs to land elsewhere is a correction,
  not a wider write.
- **`.hedgehog/core.yaml` and `adoption.md` are locked** (except
  `adoption.md`'s "Repo shape" section, refreshable via `hedgehog-adopt`).
  Changing anything else is a `hedgehog-adopt` re-run.

## Stop Condition

**No global Stop Condition** — there is no whole-graph framing to apply
here. Adoption is the permanent way change lands on the repo, not a
build that finishes. Only the mid-build `hedgehog boundary` check below
applies, per change, forever. See `hedgehog-adopt`'s "No global Stop
Condition".

The layer boundary this core clears context at is the same question: run
`hedgehog boundary` before `/clear` rather than judging it. It exits 0
only when nothing is in flight, the working tree is clean, and the last
closed task completed its intent. It exits non-zero otherwise, naming
which of the three failed. `hedgehog quiesce` answers only the in-flight
third, which is why it's the check the Correction Protocol above uses and
not the one for clearing. The next session opens on `hedgehog boundary
--handoff`.

**New change-work** — a new intent, anything beyond adjusting what
exists — goes to `hedgehog-adopt`'s "Adding the first (or next)
change-work" instead of a re-entry pass: there is no BMAD archive here to
read as context. Changing the **layer sequence itself** is the separate
case above — a Correction Protocol entry through `hedgehog-adopt`, not
new change-work.

Don't start making tweaks or planning new scope in the current,
already-large context; that's what the fresh session is for.
