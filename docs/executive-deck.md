# FOLK HKMC Digital Operations Platform

---

## 1. Introduction

FOLK HKMC now has a working role-based digital platform that can be used to manage our FOLK operations:

- Students can register and mark attendance.
- Preachers can invite Volunteers, start attendance sessions, and monitor live turnout.
- Volunteers add new contacts.
- Airtable remains the central operations database and the single source of truth.

Role-based operations tool for registration, contact capture, attendance, and session visibility.

---

## 2. What We Have Built So Far

| Area | Built Capability | Why It Matters |
| --- | --- | --- |
| Public experience | FOLK Chennai landing page with program story, topics, and testimonials | Gives Students a clear entry point |
| Registration | Mobile-friendly form for new Students | Captures Student details without paper handoffs |
| Attendance | Session-specific QR/link check-in by mobile number | Speeds up session entry and reduces confusion |
| Contact capture | Volunteer and Preacher contact-entry flows | Keeps outreach data organized by owner |
| Live visibility | Real-time attendance dashboard for active sessions | Lets Preachers see turnout while the session is happening |
| Role access | Preacher and Volunteer access rules | Keeps each role focused on the right actions |
| Invites | Preacher invite flow for Volunteers | Makes Volunteer onboarding controlled and traceable |
| Offline support | Queues selected contact collection and attendance submissions during weak connectivity | Helps during real-world session conditions |

---

## 3. The Student Journey

1. A Student learns about FOLK Chennai on the public site.
2. The Student receives or scans a session-specific attendance link.
3. They enter their 10-digit mobile number.
4. If already registered, attendance is marked.
5. If not registered, they are guided to registration.
6. For session-based registration, attendance is completed after registration.
7. Duplicate attendance for the same session is prevented.

---

## 4. The Preacher Journey

1. A Preacher signs in through invited email access.
2. The Preacher invites and manages Volunteers.
3. The Preacher starts an attendance session for an assigned location.
4. The platform creates a session-specific attendance link and QR code.
5. Students use that link to check in.
6. The Preacher watches the live attendance count and list update during the session.

**Result:** Preachers get control of session attendance without waiting for manual end-of-session reconciliation.

---

## 5. The Volunteer Journey

1. A Volunteer signs in through invited email access.
2. The Volunteer adds new contacts from outreach or pass distribution.
3. Volunteers are assigned to their respective Preachers.
4. The form collects useful follow-up details: mobile, date of birth, occupation, college/company, location, and comments.
5. Duplicate mobile numbers are blocked before creating another record.

**Result:** Volunteers can capture outreach data quickly while preserving ownership and follow-up context.

---

## 6. Operational Value

The platform improves four high-friction areas:

- **Check-in speed:** Students use a QR/link and mobile number instead of manual registration desks.
- **Cleaner records:** duplicate attendance and duplicate contacts are handled at save time.
- **Live awareness:** Preachers can see attendance during a session, not after the session.
- **Role clarity:** Preachers and Volunteers each see the workflows relevant to their responsibilities.

---

## 7. Data And Ownership

The system is designed around a simple operating model:

- Airtable is the central database for contacts, sessions, locations, users, and attendance.
- Each attendance session has a specific location, Preacher, time window, and QR/link.
- Contacts can be assigned to a Volunteer for follow-up.
- Volunteers can add contacts and are assigned to respective Preachers.

**Why it matters:** the platform supports accountability, not just data entry.

---

## 8. Current State

- Session-specific registration and attendance are now connected.
- Contact collection is now connected to the central database.
- Role-based access with Preachers, Volunteers, Students, and Admin roles.
- Contact collection and attendance can work offline as well.

---

## 9. What This Enables

With the current build, FOLK HKMC can pilot a more reliable session workflow:

- Preachers start a session and share a QR code.
- Students self-check-in.
- New Students register and complete attendance in one path.
- Volunteers capture outreach contacts.
- Preachers can invite and manage Volunteers.
- Airtable remains the single source of truth for managing contact related data and useful insights through dashboards.
