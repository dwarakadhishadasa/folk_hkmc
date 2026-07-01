---
title: 'Contact Location Dropdown Designation'
type: 'feature'
created: '2026-07-01'
status: 'in-progress'
baseline_commit: '9643fef46cf79be99d0e9df49c7aa72b96361906'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** The FOLK staff contact form currently asks staff to type a location even though the contact endpoint and Airtable Contacts table are meant to use the linked Location records. Gita Life staff contacts currently label the location pathway as Address, but the Gita Life Airtable Contacts table has a dedicated `Address` field; working-professional contacts also need a Designation value written to Airtable Contacts `Designation`.

**Approach:** Restore FOLK contact location selection to an Airtable-backed dropdown that submits `locationId`, while keeping Gita Life's address text input and mapping it to Airtable `Address` instead of linked `Location`. Add a Gita Life-only Designation input that appears only for Working Professional, clears when another occupation is selected, and is forwarded to Airtable through the contact API.

## Boundaries & Constraints

**Always:** Preserve Supabase staff authorization and staff routing rules. Keep Airtable access server-only. Use existing contact form styling and state patterns. For FOLK, location choices must come from the app contact page via `listLocations()` and must submit a record id through `locationId`. For Gita Life, free-text Address must write to Airtable Contacts `Address`, not `Location` or `Location_Legacy`; Designation behavior should mirror Company visibility and reset behavior.

**Ask First:** If the Airtable Contacts table lacks a writable `Address` or `Designation` field in the real base, stop and report the schema mismatch rather than inventing a different field name.

**Never:** Do not change session location behavior, staff invite location management, auth logic, or Airtable table ids. Do not make Gita Life use the FOLK location dropdown unless explicitly requested.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| FOLK staff contact location | FOLK contact page loads with active locations | Contact form shows a required Location dropdown and saves selected record id as `locationId` | Disable save or show validation until a location is selected |
| Gita Life staff contact address | Gita Life contact page uses Address text input | Submitted address is written to Airtable Contacts `Address`, with no linked `Location` value for address-only contact creation | Empty address is rejected with the existing address-required message |
| Gita Life working professional | Occupation is Working Professional/Working | Company and Designation inputs appear; submitted payload includes both values | Empty optional values are omitted from Airtable writes |
| Gita Life public registration | Public registration uses Address and Working Professional | Address writes to Airtable Contacts `Address`; Working Professional shows and submits Company plus Designation | Session-backed registration keeps using session linked Location for attendance routing |
| Occupation switch | User enters Company/Designation, then changes occupation away from Working | Company and Designation are cleared and hidden | Hidden stale values must not be submitted |

</frozen-after-approval>

## Code Map

- `components/contact-form.tsx` -- shared staff contact form; currently owns occupation-specific fields and free-text location/address behavior.
- `apps/folk/app/contact/page.tsx` -- FOLK contact page; should load Airtable locations and pass them to the form.
- `apps/gita-life/app/contact/page.tsx` -- Gita Life contact page; should continue using the shared form without location options.
- `apps/gita-life/app/register/page.tsx` -- Gita Life public registration form; should mirror Working Professional Designation behavior.
- `apps/folk/app/api/contact/route.ts` -- FOLK staff contact endpoint; should prefer/validate linked `locationId` for FOLK contact creation.
- `apps/gita-life/app/api/contact/route.ts` -- Gita Life staff contact endpoint; should accept Address and forward working-professional Designation.
- `apps/gita-life/app/api/registration/route.ts` -- Gita Life public registration endpoint; should write address-only registrations to Airtable Address and include Designation when applicable.
- `lib/airtable.ts` -- server-only Airtable contact field mapping and create payload builder.
- `packages/program-config/src/programs/shared-airtable.ts` -- documented Airtable Contacts field metadata.

## Tasks & Acceptance

**Execution:**
- [ ] `components/contact-form.tsx` -- add optional `locations` prop, split FOLK dropdown vs Gita Life address input, add `locationId` and `designation` state, and clear Designation with Company when occupation is not Working.
- [ ] `apps/folk/app/contact/page.tsx` -- fetch `listLocations()` with existing preacher loading and pass mapped location options into `ContactForm`.
- [ ] `apps/gita-life/app/contact/page.tsx` -- keep current call shape unless the shared form requires an explicit prop to preserve address-text mode.
- [ ] `apps/gita-life/app/register/page.tsx` -- show Designation with Company for Working Professional and clear both when another occupation is selected.
- [ ] `apps/folk/app/api/contact/route.ts` -- require `locationId`, validate it with `findLocationById`, and pass `locationId` to `createContact` instead of location text.
- [ ] `apps/gita-life/app/api/contact/route.ts` -- accept `address`, pass it as Airtable Address, and forward `designation` only when occupation is Working/Working Professional.
- [ ] `apps/gita-life/app/api/registration/route.ts` -- write public address-only registrations to Airtable Address and forward working-professional Designation without changing session linked Location routing.
- [ ] `lib/airtable.ts` and `packages/program-config/src/programs/shared-airtable.ts` -- add `Address` and `Designation` to contact types, mapping, create writes, and field metadata using the actual Airtable field names.

**Acceptance Criteria:**
- Given a FOLK staff user with available locations, when they open `/contact`, then the Location control is a dropdown populated from Airtable locations.
- Given a FOLK staff user has not selected a location, when they try to save, then the form/API prevents contact creation with a clear location-required error.
- Given a FOLK staff user saves a contact with a selected location, when the API creates the Airtable record, then Contacts `Location` receives the selected linked record id.
- Given a Gita Life staff user saves a contact with Address, when the API creates the Airtable record, then Contacts `Address` receives the text and Contacts `Location` is not used for that address.
- Given a Gita Life staff user selects Working Professional, when the form renders, then Company and Designation inputs appear together.
- Given a Gita Life staff user switches away from Working Professional, when they save, then stale Company and Designation values are not sent.
- Given a Gita Life working-professional contact includes Designation, when the API creates the Airtable record, then Contacts `Designation` receives that text.
- Given a Gita Life public visitor registers without a session, when they enter Address, then the created contact writes that value to Airtable Contacts `Address`.

## Verification

**Commands:**
- `pnpm typecheck:workspace` -- expected: TypeScript passes across workspace.
- `pnpm guardrails` -- expected: monorepo guardrails pass after shared code/app edits.
