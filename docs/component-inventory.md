# Component Inventory

## Active Product Components

| Component | Type | Active usage |
| --- | --- | --- |
| `Header` | Navigation/app chrome | Used across public and staff pages |
| `AttendanceForm` | Public feature form | `/attend` attendance marking |
| `ContactForm` | Staff feature form | `/contact` outreach contact creation |
| `SessionsManager` | Staff feature surface | `/sessions` session creation and active-session handoff |
| `LiveAttendanceDashboard` | Staff dashboard | `/dashboard` and active session view inside `/sessions` |
| `InviteUserForm` | Staff/admin form | `/volunteers` and `/admin/invite` |
| `StaffAuthShell` | Auth hydration bridge | Seeds `AuthProvider` with server-validated staff |
| `AuthHashCallback` | Auth callback helper | Mounted globally in `Providers` |
| `AuthErrorContent` | Auth error UI | `/auth/error` |

## Infrastructure Components

| Component | Responsibility |
| --- | --- |
| `Providers` | Root client providers, auth, service worker, offline indicator, navigation feedback |
| `ServiceWorkerRegister` | Registers `/sw.js` in secure contexts |
| `OfflineIndicator` | Shows offline/pending queue state and triggers service worker sync |
| `PWAInstallPrompt` | Staff-only install banner with per-staff daily dismissal |
| `NavigationFeedbackProvider` | Tracks pending internal navigation |
| `RouteProgressBar` | GSAP-driven top/bottom route progress indicator in header |
| `PageTransitionController` | GSAP page transition on route changes |
| `ThemeProvider` | Present for `next-themes`; not mounted in current `Providers` |

## Page-Owned UI

Some active UI is implemented directly in pages rather than reusable components:

| File | UI |
| --- | --- |
| `app/page.tsx` | Landing page hero, topic cards, testimonials, footer |
| `app/register/page.tsx` | Active public registration form and session-backed registration logic |
| `app/login/login-page-client.tsx` | Email OTP login and verification form |
| `app/manage/page.tsx` | Airtable interface redirect fallback UI |
| `app/auth/hash-callback/page.tsx` | Minimal callback loading UI |
| `app/auth/error/page.tsx` | Auth error page shell |

## UI Primitive Library

`components/ui/` contains 57 shadcn/Radix-style primitives, including:

- Inputs/forms: `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `form`, `label`
- Layout/display: `card`, `table`, `tabs`, `accordion`, `badge`, `skeleton`, `separator`, `empty`
- Overlay/navigation: `dialog`, `alert-dialog`, `dropdown-menu`, `popover`, `sheet`, `drawer`, `tooltip`, `navigation-menu`
- Feedback: `toast`, `toaster`, `sonner`, `progress`, `spinner`, `alert`

Not all primitives are used by active product flows, but they are available and consistent with the local design-system style.

## Styling Patterns

- Active global CSS is `app/globals.css`.
- Fonts are `Inter` and `Poppins` from `next/font/google`.
- Brand colors are royal blue `#0F1E54`, saffron `#F98B1C`, ivory `#FFF9F0`, and charcoal `#24324A`.
- Many feature components use direct Tailwind utility classes instead of only the `components/ui` primitives.
- GSAP is registered centrally in `lib/gsap.ts` and used for route/session loading motion.

## Active Flow Map

| User flow | Components/pages |
| --- | --- |
| Public registration | `app/register/page.tsx` |
| Public attendance | `app/attend/page.tsx`, `AttendanceForm` |
| Staff login | `app/login/login-page-client.tsx`, `AuthHashCallback`, `AuthProvider` |
| Staff contact creation | `app/contact/page.tsx`, `StaffAuthShell`, `ContactForm` |
| Session creation | `app/sessions/page.tsx`, `SessionsManager` |
| Live attendance | `LiveAttendanceDashboard` |
| Staff invite | `InviteUserForm` |
| PWA/offline | `ServiceWorkerRegister`, `OfflineIndicator`, `PWAInstallPrompt` |

## Legacy Or Not Mounted

| File | Status |
| --- | --- |
| `components/registration-form.tsx` | Alternate registration component; active UI is `app/register/page.tsx` |
| `components/offline-sync-provider.tsx` | Not mounted in `Providers` |
| `lib/offline-sync.ts` | Only used by unmounted offline provider |
| `lib/store.ts` | Legacy in-memory store, not used by current route handlers |
| `styles/globals.css` | Separate global stylesheet not imported by `app/layout.tsx` |

Before deleting these, search for references and check planning artifacts; they may be intentionally retained for migration context.
