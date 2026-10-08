# Auth and fixtures

How a spec starts already signed in, and why this is automated rather than stubbed.

## The sign-in flow as it exists today

Traced from source, because a test harness built on a guess about this flow will be wrong:

1. `apps/folk/app/login/login-page-client.tsx` collects an email, calls `login(email)` from `lib/auth-context.tsx`.
2. `login` (`lib/auth-context.tsx:118`) POSTs `/api/auth/signin`, then calls `supabase.auth.signInWithOtp({ email, shouldCreateUser: false })`.
   - `shouldCreateUser: false` matters: an unknown email must **fail**, not silently provision an account. A test that signs in with a typo'd address expects failure, and this flag is why it fails.
3. Supabase auth emails a **6-digit OTP** (`MIN_EMAIL_OTP_LENGTH = 6`; `verifyLoginCode` strips non-digits, so the code must be numeric).
4. Locally, `[auth.email.smtp]` in `supabase/config.toml` points at `mailpit:1025`, so the message lands in the Mailpit container.
5. `verifyLoginCode(email, token)` (`lib/auth-context.tsx:148`) calls `supabase.auth.verifyOtp({ type: "email" })`, then `completeStaffProfileSync()` and sets staff context.

## Reading the OTP programmatically

Mailpit exposes an HTTP API on `:8025`. This is the integration seam — **target Mailpit's HTTP API, not Supabase internals.** Supabase's email-delivery internals can change under us; Mailpit's message API is a stable, documented HTTP surface.

```
GET  /api/v1/messages        → { messages: [{ ID, To: [{Address}], Subject, ... }] }
GET  /api/v1/message/{ID}    → { ... Text, HTML }
```

The flow a fixture performs:

1. `GET /api/v1/messages`, find the newest message whose `To` address matches the seeded fixture email.
2. `GET /api/v1/message/{ID}`, extract the 6-digit code from `Text`.
3. Submit it to `/login`.

**Poll with a bounded retry; never `waitForTimeout`.** Mail delivery is asynchronous and is the single most flake-prone step in the suite. Key the poll on the *recipient address* rather than "the newest message" — otherwise a parallel spec's mail gets read by the wrong fixture. Bound it (a few seconds) and on timeout fail with the captured message ids and subjects; "timed out waiting for OTP" with no context is the worst possible failure message.

Optionally narrow with `?query=` if the Mailpit build supports it, but do not depend on it — filter client-side from the full list.

## `storageState` reuse

Signing in per spec is slow and couples every spec to Mailpit. Instead: sign in **once**, save `storageState` to a gitignored file, and reuse it.

```
# auth.setup.ts — runs once
→ sign in as Admin fixture → storageState: e2e/.auth/admin.json
→ sign in as Preacher fixture → storageState: e2e/.auth/preacher.json
→ sign in as Volunteer fixture → storageState: e2e/.auth/volunteer.json
```

Then ordinary specs declare `test.use({ storageState: 'e2e/.auth/admin.json' })` and never touch `/login`.

**`storageState` must be gitignored.** It contains live Supabase session tokens for seeded fixture accounts. The repo's `.gitignore` has `.env*` and `.bmad-loop/runs/` rules but no `*.json`-token rule, so add an explicit entry. This is the one genuinely sensitive artifact this spec produces.

`storageState` files go stale when a session expires or `supabase:reset` rotates keys. The setup project regenerates them every run, so staleness cannot silently poison a run — but a *cached* `storageState` with a dead token fails with a confusing 401 rather than a clean "please re-run setup".

## Roles and what they unlock

The seed creates four staff per program. `landingPathForRole` (`login-page-client.tsx`) routes **Volunteer** and **Assistant** to `/contact`; **Admin** and **Preacher** land on `/`.

The bulk-contact route requires `requireRole(staff, ["Admin", "Preacher"])` (`lib/manage/api-handlers.ts`). So:

| Fixture | Reaches `/manage` | Can bulk-edit contacts |
|---|---|---|
| Admin | yes | yes |
| Preacher | yes | yes — scoped to assigned contacts |
| Volunteer | no (`/contact`) | no |
| Assistant | no (`/contact`) | no |

Preacher mode is the interesting one for scope tests: the matrix row *"per-item isolation when a single `contactId` is not a UUID"* and the spec's scope assertions both depend on a row that is **in scope** for the signed-in Preacher. Seeded fixtures include exactly one out-of-scope contact per program for that purpose.

## Test-owned fixtures

Specs that need a specific row (a contact with a known phone, a deliberately empty field) seed their own tagged rows rather than mutating shared fixtures:

- Tag every row `preview-fixture-` so `--wipe` and cleanup find it.
- Clean up in `afterEach`/`afterAll`; never depend on rows a previous spec left behind.
- Reusing `scripts/seed-preview-fixtures.mjs`'s Supabase client pattern keeps this consistent — it takes a service-role key and applies the DW-3 assertion.

## What not to do

- **Do not stub Supabase auth.** The OTP path is the thing most likely to break silently, and a stub is exactly what would hide that break.
- **Do not seed a staff user whose `public.users.id` ≠ `auth.users.id`.** Unfixable corrupt data; the seed script exits 1 rather than write it.
- **Do not point the suite at the hosted project.** It is pre-cutover and disposable; mutating its data from a test run is not acceptable.
- **Do not commit `storageState`** — see above.
