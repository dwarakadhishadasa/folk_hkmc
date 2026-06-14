---
title: 'Gita Life Contact Registration Fields'
type: 'feature'
created: '2026-06-14'
status: 'in-review'
baseline_commit: '140fe4f06c9bcc405f60f081773907115007b4d7'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Gita Life public registration form and staff contact form collect different visible profile fields, and registration still asks for Age/Student/Year while the requested Gita Life capture set is Full Name, Mobile Number, Date of Birth, Occupation, and Address. This creates inconsistent participant records and extra form decisions for operators.

**Approach:** Align Gita Life registration and contact capture around the same visible base fields: Full Name, Mobile Number, Date of Birth, Occupation with `Working Professional` and `Housewife`, and Address. Preserve the existing Working Professional behavior by revealing and submitting Company only when that occupation is selected, while keeping staff-only ownership routing hidden where the contact workflow requires it.

## Boundaries & Constraints

**Always:** Keep mobile normalization to 10 digits on client and server. Preserve the HKMC `source=hkmc-gita-life` success return behavior on registration. Preserve session-backed registration attendance completion and duplicate mobile handling. Continue storing Address through the existing contact location pathway unless an existing Address Airtable field is discovered in the current mapping. Keep the staff-only assigned Preacher controls for Admins because they are authorization/routing data, not participant profile fields.

**Ask First:** If implementation requires a new Airtable `Address` or `Occupation` column, a new migration/config mapping, or a change to session location routing semantics, halt and ask before changing schema or data ownership behavior.

**Never:** Do not modify FOLK registration field behavior unless a shared component change makes a minimal compatible adjustment unavoidable. Do not remove staff role routing, assigned Preacher validation, duplicate prevention, offline queue paths, or registration attendance handoff. Do not reintroduce Student, Year, College, Age, or Comments into the visible Gita Life capture field set.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Public registration, housewife | Name, 10-digit mobile, DOB, occupation `Housewife`, address, no session | `/register` submits the base field set to `/api/registration`; API creates a contact without Age/Year/College/Company and stores address via the existing location pathway. | Invalid mobile/name remain 400 or disabled client-side; invalid DOB returns a clear 400. |
| Public registration, working professional | Occupation `Working Professional` selected | Company field appears; submitted company is stored; switching away clears company. | Empty company is allowed unless existing code already requires it. |
| Staff contact capture | Authorized staff opens `/contact` | Form shows Full Name, Mobile Number, Date of Birth, Occupation, Address, and Company only for Working Professional; Admin still sees Assigned Preacher. | Existing staff auth/assignment errors remain unchanged. |
| Existing mobile registration | Public registration mobile already exists and no session ID is present | Duplicate response remains `409` with `alreadyRegistered`; no duplicate contact is created. | Existing duplicate message remains understandable. |
| Session-backed registration | Registration includes `sessionId` from attendance handoff | New profile fields are accepted without breaking session eligibility, contact create/reuse, attendance creation, and completion response. | Closed/invalid/misconfigured session errors remain unchanged. |

</frozen-after-approval>

## Code Map

- `apps/gita-life/app/register/page.tsx` -- Gita Life public registration UI state, validation, field rendering, HKMC return success state, and `/api/registration` submission.
- `apps/gita-life/app/api/registration/route.ts` -- Public registration payload validation and Airtable contact creation/reuse, including session-backed attendance.
- `components/contact-form.tsx` -- Shared staff contact capture UI used by Gita Life `/contact`; currently includes student/year/college/company/location/comments.
- `apps/gita-life/app/api/contact/route.ts` -- Staff contact payload validation, role-based assigned Preacher routing, DOB validation, duplicate prevention, and Airtable contact creation.
- `lib/airtable.ts` -- Existing contact mapper/create helper supports `Date of Birth`, `Company`, and location/address storage path.

## Tasks & Acceptance

**Execution:**
- [x] `apps/gita-life/app/register/page.tsx` -- Replace `age` with `dateOfBirth`, replace `location` label/copy with Address while preserving payload compatibility, restrict occupation choices to Working Professional and Housewife, and render Company only for Working Professional.
- [x] `apps/gita-life/app/api/registration/route.ts` -- Accept and validate optional `dateOfBirth`, accept `company` for Working Professional, stop relying on Age/Student/Year for Gita Life submissions, and forward address/location through the existing `createContact` contract without breaking session-backed registration.
- [x] `components/contact-form.tsx` -- Align visible contact fields with the requested Gita Life set by removing Student/Year/College and Comments from the form, limiting occupation choices to Working Professional and Housewife, relabeling Location as Address, and preserving Company-on-Working plus Admin assigned Preacher controls.
- [x] `apps/gita-life/app/api/contact/route.ts` -- Accept the narrowed contact payload, keep DOB validation, keep Working Professional company forwarding, and ignore removed student/comment fields without creating stale Airtable writes.
- [x] `lib/airtable.ts` -- Only adjust if the existing create contract needs a naming alias for address; do not add schema fields without approval.

**Acceptance Criteria:**
- Given a Gita Life public visitor opens `/register`, when the form renders, then the base visible fields are Full Name, Mobile Number, Date of Birth, Occupation, and Address, with only Working Professional and Housewife occupation choices.
- Given Working Professional is selected on registration or contact capture, when the user enters Company and submits, then Company is sent and stored; when the user switches to Housewife, then Company is cleared and not sent.
- Given an authorized Gita Life staff user opens `/contact`, when the form renders, then it matches the requested base field set while still showing required staff routing controls only where the role requires them.
- Given a session-backed registration is submitted, when contact creation or reuse succeeds, then attendance completion behavior remains unchanged.
- Given invalid DOB is submitted to registration or contact, when the API validates the payload, then it returns a clear 400 response without creating a contact.

## Spec Change Log

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: TypeScript passes across workspace packages/apps.
- `pnpm guardrails` -- expected: monorepo import/server-only guardrails pass.

**Manual checks:**
- Open Gita Life `/register` and verify the requested field set, Working Professional Company reveal/clear behavior, HKMC source success button, duplicate handling copy, and session-backed attendance message.
- Open Gita Life `/contact` as a role with access and verify the requested field set plus any role-required routing controls.
