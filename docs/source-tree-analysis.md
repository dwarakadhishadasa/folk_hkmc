# Source Tree Analysis

## Repository Shape

The project is a single Next.js application with supporting BMAD/planning artifacts. Product code lives mainly in `app/`, `components/`, `lib/`, `public/`, `scripts/`, and `supabase/`.

```text
folk_hkmc/
├── app/                         # Next.js App Router pages and route handlers
│   ├── api/                     # API route handlers under /api
│   │   ├── admin/               # Admin invite and location routes
│   │   ├── auth/                # Staff auth helper routes
│   │   ├── contact/             # Staff contact creation
│   │   ├── registration/        # Public registration and session-backed attendance
│   │   ├── sessions/            # Staff session list/create API
│   │   └── volunteers/          # Volunteer invite API
│   ├── attendance/route.ts      # Public POST + protected staff GET attendance API at /attendance
│   ├── auth/                    # Supabase callback, hash callback, signout, error UI
│   ├── contact/                 # Staff contact capture page
│   ├── dashboard/               # Staff live attendance dashboard
│   ├── sessions/                # Staff session manager page
│   ├── volunteers/              # Volunteer invite page
│   ├── admin/invite/            # Admin staff invite page
│   ├── manage/                  # Airtable interface redirect
│   ├── register/                # Active public registration page
│   ├── attend/                  # Public attendance page
│   ├── page.tsx                 # Public landing page
│   ├── layout.tsx               # Root layout, metadata, fonts, providers
│   └── globals.css              # Active Tailwind/theme CSS
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
│   ├── authz.ts                 # Server-side staff context and role guards
│   ├── supabase/                # Browser/server/admin/proxy Supabase clients
│   ├── attendance-session.ts    # Session attendance window eligibility
│   ├── invite-log.ts            # Supabase invite_log writer
│   ├── offline-sync.ts          # Legacy localStorage offline helper, not mounted
│   └── store.ts                 # Legacy in-memory registration/attendance store
├── public/
│   ├── sw.js                    # Service worker and IndexedDB POST queue
│   ├── manifest.json            # PWA manifest
│   ├── offline.html             # Offline fallback shell
│   ├── icons/                   # PWA icons
│   └── images/                  # FOLK assets
├── supabase/
│   ├── config.toml              # Local Supabase configuration
│   ├── seed.sql                 # Empty stable local seed hook
│   └── migrations/              # staff_profiles and invite_log migrations
├── scripts/
│   └── use-local-supabase-env.sh
├── .github/
│   ├── workflows/pr-branch-policy.yml
│   ├── CODEOWNERS
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── copilot-instructions.md
├── docs/                        # Generated project documentation
├── _bmad-output/                # Planning and implementation artifacts
├── package.json
├── next.config.mjs
├── eslint.config.mjs
├── tsconfig.json
└── proxy.ts                     # Next proxy for Supabase cookie/session refresh
```

## Entry Points

| Entry point | Purpose |
| --- | --- |
| `app/layout.tsx` | App metadata, fonts, root providers, Speed Insights |
| `components/providers.tsx` | Wraps navigation feedback, auth provider, hash callback, service worker, offline indicator |
| `proxy.ts` | Refreshes Supabase session cookies for protected app/API paths |
| `app/page.tsx` | Public marketing/landing surface |
| `app/register/page.tsx` | Active public registration UI |
| `app/attend/page.tsx` | Public attendance UI |
| `app/attendance/route.ts` | Attendance API at `/attendance` |

## Critical Directories

### `app/api`

Contains implemented server routes for auth, contact creation, registration, sessions, admin location/invite, and volunteer invite. These are the first files to inspect before changing any client `fetch()` calls.

### `app/auth`

Contains Supabase callback handling:

- `confirm/route.ts`: code/token hash callback and staff profile sync
- `signout/route.ts`: server signout redirect
- `hash-callback/page.tsx`: client-side implicit callback bridge
- `error/page.tsx`: staff auth error page

### `lib/supabase`

Defines browser, server, admin, proxy, env, and typed database helpers. `admin.ts` uses the service-role key and must remain server-only.

### `lib/airtable.ts`

Server-only integration for all Airtable operational records. Table IDs are environment-driven. This file also contains cache helpers for locations and active Preachers.

### `supabase/migrations`

Defines the local Postgres auth bridge:

- `staff_profiles`
- `invite_log`
- indexes, updated-at trigger, scope fields

### `public/sw.js`

Owns PWA caching and offline queue behavior. Changes to public POST route paths must be mirrored here.

## Legacy Or Low-Confidence Files

These files are present but not currently part of the active mounted runtime path:

- `components/registration-form.tsx`: alternate registration component; active registration is inline in `app/register/page.tsx`.
- `components/offline-sync-provider.tsx`: context provider not mounted in `components/providers.tsx`.
- `lib/offline-sync.ts`: localStorage offline helper only used by `OfflineSyncProvider`.
- `lib/store.ts`: in-memory store types from an older implementation.
- `styles/globals.css`: additional CSS file outside the active `app/globals.css` import path.

Treat these as legacy unless a future change explicitly reconnects them.
