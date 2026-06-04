# FOLK HKMC Digital Operations Platform

**Executive progress deck**
**Audience:** Non-technical leaders and program owners
**Date:** 2026-06-04

---

## 1. Executive Headline

FOLK HKMC now has a working digital platform that supports the full event-day loop:

- Participants discover the program, register, and mark attendance.
- Preachers start attendance sessions and monitor live turnout.
- Volunteers add new contacts with the right ownership.
- Admins invite role-based users and manage access.
- Airtable remains the central operations database.

**Plain-language takeaway:** the platform has moved from a simple web presence into a role-based operations tool for registration, contact capture, attendance, and event visibility.

---

## 2. What We Have Built So Far

| Area | Built Capability | Why It Matters |
| --- | --- | --- |
| Public experience | FOLK Chennai landing page with program story, topics, and testimonials | Gives participants a clear entry point |
| Registration | Mobile-friendly form for new participants | Captures participant details without paper handoffs |
| Attendance | Session-specific QR/link check-in by mobile number | Speeds up event entry and reduces confusion |
| Contact capture | Volunteer, Preacher, and Admin contact-entry flows | Keeps outreach data organized by owner |
| Live visibility | Real-time attendance dashboard for active sessions | Lets Preachers see turnout while the session is happening |
| Role access | Admin, Preacher, and Volunteer access rules | Keeps each role focused on the right actions |
| Invites | Admin and Preacher invite flows | Makes onboarding new role users controlled and traceable |
| Offline support | Queues selected public submissions during weak connectivity | Helps during real-world event conditions |

---

## 3. The Participant Journey

1. A participant learns about FOLK Chennai on the public site.
2. The participant receives or scans a session-specific attendance link.
3. They enter their 10-digit mobile number.
4. If already registered, attendance is marked.
5. If not registered, they are guided to registration.
6. For session-based registration, attendance is completed after registration.
7. Duplicate attendance for the same session is prevented.

**Result:** participants get a clear, forgiving flow instead of needing manual lookup or coordinator intervention.

---

## 4. The Preacher Journey

1. A Preacher signs in through invited email access.
2. The Preacher starts an attendance session for an assigned location.
3. The platform creates a session-specific attendance link and QR code.
4. Participants use that link to check in.
5. The Preacher watches the live attendance count and list update during the session.
6. The Preacher can invite Volunteers and open the Airtable management interface when needed.

**Result:** Preachers get control of session attendance without waiting for manual end-of-day reconciliation.

---

## 5. The Volunteer Journey

1. A Volunteer signs in through invited email access.
2. The Volunteer adds new contacts from outreach or pass distribution.
3. Contacts are routed to the assigned Preacher.
4. The form collects useful follow-up details: mobile, date of birth, occupation, college/company, location, and comments.
5. Duplicate mobile numbers are blocked before creating another record.

**Result:** Volunteers can capture outreach data quickly while preserving ownership and follow-up context.

---

## 6. The Admin Journey

1. Admins can invite Admins, Preachers, and Volunteers.
2. Admins assign Volunteers to active Preachers.
3. Admins can route role access by location where required.
4. Invite attempts are logged for traceability.
5. Admins can access broader management through Airtable.

**Result:** Admins have a controlled way to expand the operating team without sharing passwords or informal access.

---

## 7. Operational Value

The platform improves four high-friction areas:

- **Check-in speed:** participants use a QR/link and mobile number instead of manual registration desks.
- **Cleaner records:** duplicate attendance and duplicate contacts are handled at save time.
- **Live awareness:** Preachers can see attendance during a session, not after the event.
- **Role clarity:** Admins, Preachers, and Volunteers each see the workflows relevant to their responsibilities.

**Most important shift:** event operations can become more distributed without losing central visibility.

---

## 8. Data And Ownership

The system is designed around a simple operating model:

- Airtable is the central database for contacts, sessions, locations, users, and attendance.
- Each attendance session has a specific location, Preacher, time window, and QR/link.
- Contacts can be assigned to a Preacher for follow-up.
- Volunteers can add contacts within their assignment path.
- Admins can control access and assignments.

**Executive meaning:** the platform supports accountability, not just data entry.

---

## 9. Reliability And Readiness

Completed readiness work:

- Session-specific registration and attendance are now connected.
- Contact creation is now connected to the central database.
- Role-based access has moved beyond local browser-only access.
- Public registration and attendance can queue during connectivity loss.
- Live dashboard refresh has been improved to avoid unnecessary repeated work.
- Core build checks have passed in the documented implementation pass.
- Code-quality tooling is now installed.

Remaining readiness work:

- Run full Admin, Preacher, and Volunteer walkthrough checks with real test accounts.
- Complete code-quality cleanup so checks pass cleanly.
- Add required automated checks for pull requests.
- Verify production environment settings before launch.
- Validate real Airtable saving and lookup behavior in the target environment.

---

## 10. What This Enables

With the current build, FOLK HKMC can pilot a more reliable event workflow:

- Preachers start a session and share a QR code.
- Participants self-check-in.
- New participants register and complete attendance in one path.
- Volunteers capture outreach contacts.
- Admins invite and manage role users.
- Airtable remains the operating record for follow-up and reporting.

**Pilot-ready shape:** the product is suitable for controlled field testing with known role users and supervised data validation.

---

## 11. Key Risks To Manage

| Risk | Why It Matters | Recommended Action |
| --- | --- | --- |
| Incomplete full-role walkthrough testing | Real users may hit role-specific issues | Test Admin, Preacher, Volunteer, and Participant flows before launch |
| Code-quality cleanup remains | Quality gates are not yet clean | Finish cleanup and make it part of pull-request checks |
| Production configuration required | Attendance links and database writes depend on correct settings | Verify environment values before live use |
| Offline replay depends on user/session context | Some queued actions may need a valid signed-in session later | Treat offline as helpful support, not a substitute for connectivity planning |
| No full automated test suite yet | Regression risk remains higher than ideal | Add focused tests around attendance, registration, invites, and access rules |

---

## 12. Recommended Next Decisions

1. **Pilot scope:** choose one session, one location, and a small set of Admin, Preacher, and Volunteer users.
2. **Success metrics:** track check-in completion, duplicate prevention, registration completion, and dashboard usefulness.
3. **Launch checklist:** verify production settings, Airtable field mappings, role assignments, and email invites.
4. **Quality gate:** require build, code-quality, and secret-scan checks before merging future changes.
5. **Operating support:** prepare a short role guide for Admins, Preachers, and Volunteers.

---

## 13. 30-Day Roadmap

| Phase | Focus | Outcome |
| --- | --- | --- |
| Week 1 | Controlled pilot setup | Real accounts, real location, real Airtable validation |
| Week 2 | Event-day pilot | Observe participant check-in, Volunteer contact capture, and Preacher dashboard usage |
| Week 3 | Stabilization | Fix pilot issues, finish code-quality cleanup, add pull-request checks |
| Week 4 | Broader rollout preparation | Document role workflows, confirm reporting needs, prepare next-location expansion |

---

## Appendix: Evidence Used

This deck was prepared from the current repository state and implementation artifacts, including:

- Current app routes for registration, attendance, contacts, sessions, dashboard, invites, and management.
- Current role-based access logic for Admins, Preachers, and Volunteers.
- Offline queue behavior for selected submissions.
- Implementation reports under `_bmad-output/implementation-artifacts/`.
- Project documentation under `docs/`.

**Note:** this deck intentionally avoids implementation detail so it can be used with non-technical audiences.
