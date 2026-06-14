# Source Tree Analysis

## Repository Shape

The project is a pnpm/Turborepo monorepo with two program-scoped Next.js applications and shared root packages/services. Product code lives mainly in `apps/`, `components/`, `lib/`, `packages/`, `public/`, `scripts/`, and `supabase/`.

```text
folk_hkmc/
├── apps/
│   ├── folk/                    # FOLK Chennai Next.js app workspace (@hkmc/folk)
│   │   ├── app/                 # FOLK pages and route handlers
│   │   │   ├── api/             # Auth/contact/registration/sessions/admin/volunteer APIs
│   │   │   ├── attendance/      # Public POST + protected staff GET API at /attendance
│   │   │   ├── auth/            # Supabase callback, hash callback, signout, error UI
│   │   │   ├── contact/         # Staff contact capture page
│   │   │   ├── dashboard/       # Staff live attendance dashboard
│   │   │   ├── sessions/        # Session manager page
│   │   │   ├── volunteers/      # Volunteer invite page
│   │   │   ├── admin/           # Admin invite/location pages
│   │   │   ├── manage/          # Airtable interface redirect
│   │   │   ├── register/        # Public registration page
│   │   │   ├── attend/          # Public attendance page
│   │   │   ├── page.tsx         # FOLK landing page
│   │   │   ├── layout.tsx       # Program metadata/fonts/providers
│   │   │   └── globals.css      # FOLK Tailwind/theme CSS
│   │   ├── proxy.ts             # App-local proxy wrapper around root proxy
│   │   └── package.json         # PROGRAM_ID=folk scripts
│   └── gita-life/               # Gita Life Next.js app workspace (@hkmc/gita-life)
│       ├── app/                 # Gita Life pages and matching route handlers
│       │   ├── manifest.ts      # Program-specific web app manifest route
│       │   └── ...              # Same operational route/page shape as FOLK
│       ├── proxy.ts             # App-local proxy wrapper around root proxy
│       └── package.json         # PROGRAM_ID=gita-life scripts
├── components/
│   ├── ui/                      # shadcn/Radix-style UI primitives
│   ├── attendance-form.tsx      # Public attendance form
│   ├── contact-form.tsx         # Staff contact form
│   ├── invite-user-form.tsx     # Admin/volunteer invite form
│   ├── live-attendance-dashboard.tsx
│   ├── sessions-manager.tsx
│   ├── header.tsx
│   ├── providers.tsx
│   ├── staff-auth-shell.tsx
│   ├── service-worker-register.tsx
│   └── offline-indicator.tsx
├── lib/
│   ├── airtable.ts              # Server-only Airtable REST integration
│   ├── auth-context.tsx         # Client auth provider and OTP flow
│   ├── authz.ts                 # Program-scoped staff context, sync, role guards, audit events
│   ├── current-program.ts       # Browser-safe public program profile lookup
│   ├── supabase/                # Browser/server/admin/proxy Supabase clients
│   ├── attendance-session.ts    # Session attendance window eligibility
│   ├── invite-log.ts            # Supabase invite_log writer
│   ├── offline-sync.ts          # Legacy localStorage offline helper, not mounted
│   └── store.ts                 # Legacy in-memory registration/attendance store
├── packages/
│   ├── airtable/                # Workspace export shim for server Airtable helpers
│   ├── authz/                   # Workspace export shim for server auth helpers
│   ├── data-contracts/          # Browser-safe program/staff DTOs and validators
│   ├── program-config/          # Program branding, module flags, Airtable table/interface maps
│   └── ui/                      # Workspace export shim for shared UI primitives
├── public/
│   ├── sw.js                    # Service worker and IndexedDB POST queue
│   ├── manifest.json            # PWA manifest
│   ├── offline.html             # Offline fallback shell
│   ├── icons/                   # PWA icons
│   └── images/                  # FOLK assets
├── supabase/
│   ├── config.toml              # Local Supabase configuration
│   ├── seed.sql                 # Empty stable local seed hook
│   └── migrations/              # staff profiles, memberships, programs, identities, audit, invite log
├── scripts/
│   ├── use-local-supabase-env.sh
│   ├── verify-monorepo-guardrails.mjs
│   └── verify-program-readiness.mjs
├── .github/
│   ├── workflows/pr-branch-policy.yml
│   ├── workflows/quality-gates.yml
│   ├── CODEOWNERS
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── copilot-instructions.md
├── docs/                        # Generated project documentation
├── _bmad-output/                # Planning and implementation artifacts
├── package.json
├── next.config.mjs
├── eslint.config.mjs
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── tsconfig.json
└── proxy.ts                     # Shared Next proxy for Supabase cookie/session refresh
```

## Entry Points

| Entry point | Purpose |
| --- | --- |
| `apps/folk/app/layout.tsx` | FOLK metadata, fonts, root providers, Speed Insights |
| `apps/gita-life/app/layout.tsx` | Gita Life metadata, fonts, root providers, Speed Insights |
| `components/providers.tsx` | Wraps navigation feedback, auth provider, hash callback, service worker, offline indicator |
| `apps/*/proxy.ts` and root `proxy.ts` | Refresh Supabase session cookies for protected app/API paths |
| `apps/*/app/page.tsx` | Program-branded public landing surface |
| `apps/*/app/register/page.tsx` | Active public registration UI |
| `apps/*/app/attend/page.tsx` | Public attendance UI |
| `apps/*/app/attendance/route.ts` | Attendance API at `/attendance` within each program app |

## Critical Directories

### `apps/*/app/api`

Each program app contains implemented server routes for auth, contact creation, registration, sessions, admin location/invite, and volunteer invite. These are the first files to inspect before changing any client `fetch()` calls. Keep FOLK and Gita Life route behavior aligned unless a program-specific requirement says otherwise.

### `apps/*/app/auth`

Contains Supabase callback handling:

- `confirm/route.ts`: code/token hash callback and staff profile sync
- `signout/route.ts`: server signout redirect
- `hash-callback/page.tsx`: client-side implicit callback bridge
- `error/page.tsx`: staff auth error page

### `packages/program-config`

Defines public branding/module flags and server Airtable metadata for each program. Server helpers resolve `PROGRAM_ID`/`NEXT_PUBLIC_PROGRAM_ID`, program-prefixed env variables, and Airtable management URLs.

### `packages/data-contracts`

Contains browser-safe `ProgramId`, staff role/status unions, shared DTOs, and validators used by both app and package code.

### `lib/supabase`

Defines browser, server, admin, proxy, env, and typed database helpers. `admin.ts` uses the service-role key and must remain server-only.

### `lib/airtable.ts`

Server-only integration for all Airtable operational records. It resolves the active program, accepts program-scoped env overrides, falls back to `packages/program-config` table mappings, and contains cache helpers for locations and active Preachers.

### `supabase/migrations`

Defines the local Postgres auth bridge:

- `programs`
- `staff_profiles`
- `staff_memberships`
- `airtable_identities`
- `airtable_sync_state`
- `audit_events`
- `invite_log`
- indexes, updated-at trigger, scope fields

### `public/sw.js`

Owns PWA caching and offline queue behavior. Changes to public POST route paths must be mirrored here.

## Legacy Or Low-Confidence Files

These files are present but not currently part of the active mounted runtime path:

- `components/registration-form.tsx`: alternate registration component; active registration is inline in `apps/*/app/register/page.tsx`.
- `components/offline-sync-provider.tsx`: context provider not mounted in `components/providers.tsx`.
- `lib/offline-sync.ts`: localStorage offline helper only used by `OfflineSyncProvider`.
- `lib/store.ts`: in-memory store types from an older implementation.

Treat these as legacy unless a future change explicitly reconnects them.
