---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
inputDocuments:
  - docs/index.md
  - docs/architecture.md
  - docs/api-contracts.md
  - docs/data-models.md
workflowType: 'prd'
status: 'complete'
project_name: 'folk_hkmc'
user_name: 'Dwaraka'
date: '2026-04-23'
projectContext: 'brownfield'
---

# Product Requirements Document - folk_hkmc

**Author:** Dwaraka
**Date:** 2026-04-23

## Executive Summary

This brownfield PRD captures the current product behavior and operating constraints of the FOLK Chennai frontend system. The application serves two related purposes: public participant engagement and lightweight staff operations. Public users can learn about the program, register, and mark attendance. Staff users can log in, add contacts, and, if they have preacher privileges, monitor live attendance.

The current implementation succeeds as a lightweight operational tool, but it is not a complete full-stack platform. The attendance workflow is fully wired to Airtable through an implemented server route, while registration and contact creation still depend on route contracts that are referenced by the UI but missing from this repository. Any future planning should therefore treat this PRD as both a product baseline and a brownfield gap map.

## Product Context

### Product Purpose

Enable FOLK Chennai to:

- present the program publicly
- onboard new participants
- record attendance by mobile number
- let staff maintain contact information
- give preachers a live operational view of attendance

### Current Delivery Model

- Single Next.js web app
- Client-heavy UI with local auth
- Airtable as the live data backend
- PWA/offline support for selected flows

## Users and Roles

### Participant

- discovers the program from the homepage
- registers if not already known
- marks attendance using a mobile number

### Volunteer

- logs in with local credentials
- accesses the contact creation screen

### Preacher

- has all volunteer abilities
- can access the live attendance dashboard

### Operations Team

- relies on Airtable as the operational source of truth
- expects participant and attendance data to remain consistent across manual and digital workflows

## Success Criteria

The current system should support the following outcomes reliably:

- participants can move from attendance lookup to registration when they are not already known
- duplicate attendance for the same participant on the same day is prevented
- staff can access role-appropriate interfaces after logging in
- the dashboard reflects new attendance records during active usage windows
- offline users receive clear feedback when a request is queued instead of immediately processed

## Current User Journeys

### 1. Learn About the Program

1. Visitor lands on `/`
2. Visitor reads the FOLK program overview, course topics, and testimonials
3. Visitor chooses to learn more externally or continue into product flows

### 2. Register as a New Participant

1. User opens `/register` directly or is redirected there after an attendance lookup miss
2. User enters name, mobile, age, occupation, year, and location
3. UI submits registration data to `/api/registration`
4. On success, user is redirected to `/attend`
5. If offline, the intended behavior is to queue the request and notify the user

### 3. Mark Attendance

1. User opens `/attend`
2. User enters a 10-digit mobile number
3. System checks Airtable for a matching contact
4. If found and not already marked today, attendance is recorded
5. If not found, the user is redirected to registration
6. If already marked, the user receives a friendly duplicate message

### 4. Add a Contact as Staff

1. Volunteer or preacher logs in at `/login`
2. User is redirected to `/contact`
3. User submits contact details
4. UI expects `/api/contact` to persist the record

### 5. Monitor Attendance as a Preacher

1. Preacher logs in
2. User opens `/dashboard`
3. Dashboard polls attendance records for the current date
4. QR code is shown to direct participants to `/attend`

## Functional Requirements

### FR1. Public Program Discovery

- The system shall provide a public homepage describing the FOLK Chennai program.
- The homepage shall communicate core topics, transformation stories, and program branding.

### FR2. Participant Registration

- The system shall capture participant details: name, mobile, age, occupation, year, and location.
- The system shall normalize mobile numbers to 10 digits.
- The system shall redirect successful registrants to the attendance flow.
- The system shall recognize already-registered cases if the registration API provides that signal.

### FR3. Attendance Capture

- The system shall accept mobile-number-based attendance submissions.
- The system shall reject invalid mobile numbers.
- The system shall reject unknown participants and guide them to registration.
- The system shall prevent duplicate attendance for the same mobile number on the same day.

### FR4. Staff Login and Role Gating

- The system shall support volunteer and preacher roles.
- The system shall persist client-side auth state across refreshes.
- The system shall restrict dashboard access to preacher users.

### FR5. Contact Entry

- The system shall provide a staff-only contact creation interface.
- The system shall validate 10-digit mobile numbers before submission.
- The system shall collect name, mobile, age, occupation, year, and location.

### FR6. Live Dashboard

- The system shall display a current-day attendance list.
- The system shall periodically refresh attendance records.
- The system shall surface a QR code that points users to the attendance page.

### FR7. Offline and Installable Experience

- The system shall register a service worker in secure contexts.
- The system shall precache essential assets for offline availability.
- The system shall queue selected POST requests when offline.
- The system shall expose pending sync state to the user.

## Non-Functional Requirements

### Reliability

- Attendance reads and writes must fail visibly rather than silently when Airtable is unavailable.
- Offline submissions must clearly communicate that they are queued and not yet processed.

### Usability

- Core participant flows must work well on mobile devices.
- Brand styling must remain consistent with the FOLK Chennai visual system.

### Security

- Staff-only screens must remain inaccessible through normal navigation without client auth.
- Brownfield note: the current implementation does not provide server-enforced authorization.

### Maintainability

- Payload shapes for attendance, registration, and contact data should remain stable across UI and backend layers.
- Mobile normalization must stay consistent wherever user data is entered or checked.

## Brownfield Constraints and Existing Assets

### Existing Assets to Reuse

- Landing page and route structure in `app/`
- Airtable helpers in `lib/airtable.ts`
- Brand tokens in `app/globals.css`
- Shared navigation and infrastructure widgets in `components/`
- Existing brownfield docs under `docs/`

### Constraints

- Auth is local-only and hardcoded
- Only `/attendance` is implemented server-side in this repository
- Offline behavior spans both service worker logic and client assumptions
- `next build` is configured to ignore TypeScript errors

## Known Gaps and Risks

- `/api/registration` is required by the UI but missing from the repo
- `/api/contact` is required by the UI but missing from the repo
- Dashboard protection is UI-level; the underlying HTTP route is not auth-protected
- A likely unused registration component remains in the codebase and may cause confusion
- Legacy in-memory store types no longer reflect the active Airtable-backed flow

## References

- `docs/index.md`
- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/data-models.md`
