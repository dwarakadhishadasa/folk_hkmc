# Manage Interface (Airtable Interface Replacement)

What the Airtable "Admin Portal" interface does today (from user-provided screenshots, 2026-10-05), and therefore what the in-app `/manage` replacement (CAP-9) must cover. Roles today: Admin and Preacher only (enforced by `/manage`).

## Access & scoping model

- **Admin, admin mode:** cumulative data across **all preachers** in the program (e.g. 1,030 total contacts).
- **Admin, preacher mode:** only their own data, as if they were a preacher (e.g. 440 contacts). The interface supports both views; the replacement must too.
- **Preacher:** only their own data — contacts, sessions, attendance scoped to them.
- The RLS layer (`rls-policy-matrix.md`) already grants Admin program-wide reads and Preacher self-scoped reads; "admin vs preacher mode" for an Admin is an **app-layer filter** on top of their program-wide RLS scope, not an RLS change.

## Screens

### 1. Dashboard
- **Statistics:** Total Contacts count.
- **Contact Generation:** line chart, new contacts per quarter.
- **Recent sessions:** pie chart, past-60-day session attendance "Status Quo" (e.g. 10–50% vs 0% buckets, ~96% in the 0% bucket).
- **Sessions:** bar chart by preacher, stacked by location (Karapakkam, Taramani, Thoraipakkam…), Month + Year filters with Reset.
- **Attendance:** bar chart of student counts by preacher, stacked by location, Month + Year filters with Reset.

### 2. Contacts
Table with group / filter / sort / search. Columns:
`Name`, `Phone`, `Location`, `TotalAttendanceCount`, `Past60DayAttendanceCount`, `Last Contacted On`, `Notes`, `Collected By`.

### 3. Sessions
Record list **grouped by Location**. Columns: `Session Date`, `Name`, `Attendance` (attendee name chips), `Attendee Count` (with column sum).

### 4. Attendance
- Location multi-select filter + sortable contact list (name + phone).
- Per-contact panel: "Number of sessions attended in past 2 months" (implemented as a rolling 60-day window — assumed 2026-10-06; the interface's own contacts column is `Past60DayAttendanceCount`), and a **Records** table (`Session`, `Session Date`) — the contact's attendance history.

### 5. Favorites
- Searchable contact list filterable by location.
- Editable contact detail form: `Photo` (file upload), `Name`, `Phone`, `College`, `Rounds`, `Books Read` (select), `Company`, `Date of Birth`, `Notes`, `Initial Contact`, computed `Total Sessions Attended`, computed `Sessions attended in past two months`, `Location`.

## Data implications

See `data-model-mapping.md` — the interface uses contact fields the app never needed before (`Photo`, `Rounds`, `Books Read`, favorite marker) and two computed counts (`TotalAttendanceCount`, `Past60DayAttendanceCount`), which in Supabase become SQL views/queries rather than stored columns. Photos move from Airtable attachments to Supabase Storage.

## Explicitly not replicated

- Airtable chrome: "Add a description" placeholders, interface navigation, "Go to interface" buttons, record-coloring, Airtable filter-builder UI. The replacement uses the app's existing design language; feature parity is about the data and the views, not pixel-copying Airtable.
