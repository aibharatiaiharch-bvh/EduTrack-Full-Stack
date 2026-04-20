# EduTrack — Complete Documentation
**Version**: Current build (April 2026)
**Platform**: Web app — React + Node.js + Google Sheets

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Portals](#2-user-roles--portals)
3. [Google Sheet Structure](#3-google-sheet-structure)
4. [User Workflows](#4-user-workflows)
5. [Feature Reference](#5-feature-reference)
6. [API Reference](#6-api-reference)
7. [Processes & Admin Procedures](#7-processes--admin-procedures)
8. [Announcements Management](#8-announcements-management)
9. [Settings & Configuration](#9-settings--configuration)
10. [Demo Data Reference](#10-demo-data-reference)

---

## 1. System Overview

EduTrack is a tutor and coaching centre management platform. It replaces spreadsheet-only workflows with a multi-role web portal while keeping Google Sheets as the live data store — so administrators always retain direct spreadsheet access alongside the app.

**Core capabilities:**
- Multi-role login (principal, tutor, parent, developer)
- Student enrolment requests and approval workflow
- Class scheduling, teacher assignment, and capacity management
- 24-hour cancellation policy with automatic late-fee flagging
- Principal fee override (waive or confirm)
- Announcements broadcast to all logged-in users
- Teacher schedule view filtered to each teacher's own classes
- Browse & join available classes with live capacity counters
- CSV data export and user management

**Technology stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend API | Node.js, Express 5 |
| Authentication | Custom email-only login (no passwords, no Clerk UI) |
| Data store | Google Sheets (via Replit connector) |
| Hosting | Replit (development + published) |

---

## 2. User Roles & Portals

### Role Routing Flow

```
User enters email on /sign-in
        ↓
  GET /api/roles/check?email=…   (looks up the Users tab — the API
                                  falls back to DEFAULT_SHEET_ID when
                                  the client has no sheet linked yet)
        ↓
  ┌─────────────────────────────────────────┐
  │ Role from Users tab → Portal           │
  │  developer / admin  →  /admin          │
  │  principal          →  /principal      │
  │  tutor              →  /dashboard      │
  │  parent             →  /parent         │
  │  student            →  /student        │
  └─────────────────────────────────────────┘
```

There are no passwords. Login is granted purely by the email being present in the Users tab with `Status = Active`.

**If email is NOT found in the Users tab:**
- If the email matches the `DEVELOPER_EMAIL` environment variable → granted `developer` role automatically.
- If the email matches the `PRINCIPAL_EMAIL` environment variable → granted `principal` role automatically.
- Otherwise → access denied; user sees "This email is not registered in the system. Contact your principal to be added."

**Sign-out** clears all `edutrack_*` keys from `localStorage` and returns the user to `/`.

### Role Capabilities

| Capability | Principal | Tutor | Parent | Developer |
|---|:---:|:---:|:---:|:---:|
| View own schedule | — | ✓ | — | — |
| Browse available classes | ✓ | ✓ | ✓ | — |
| Join a class (enrol student) | ✓ | ✓ | ✓ | — |
| Override full class capacity | ✓ | — | — | — |
| Cancel a class | — | — | ✓ | — |
| Review late cancellation fees | ✓ | — | — | — |
| Waive / confirm fee | ✓ | — | — | — |
| Approve enrolment requests | ✓ | — | — | — |
| Add teachers / students | ✓ | — | — | — |
| Assign teachers to classes | ✓ | — | — | — |
| Manage announcements | via Sheet | — | — | — |
| Deactivate / reactivate users | ✓ | — | — | — |
| CSV data backup | ✓ | — | — | — |
| Toggle feature flags | — | — | — | ✓ |
| Load demo data | — | — | — | ✓ |

### Developer Portal (data boundary)

The developer account has **zero access to client data** — no student names, no enrolment records, no parent details. It only manages technical configuration: feature flags, developer contact email, and system health.

---

## 3. Google Sheet Structure

EduTrack uses a single Google Spreadsheet with 9 named tabs. The spreadsheet ID is saved in the user's browser (Settings page) and sent with every API request.

### Tab 1 — Users

**Columns:** `UserID | Email | Role | Name | Added Date | Status`

This is the **single source of truth for login access**. Being listed in the Students or Teachers tab does NOT grant access — the user must also appear here.

| Field | Values / Notes |
|---|---|
| UserID | Role-prefixed: `STU-001`, `TCH-001`, `PAR-001`, `PRN-001`, `ADM-001` |
| Role | `principal`, `tutor`, `parent`, `student`, `developer` |
| Status | `Active` (can log in) · `Inactive` (blocked immediately) · `Pending` |

### Tab 2 — Students

**Columns:** `UserID | Name | Email | Classes | Status | Phone | Parent Email | Parent ID`

| Field | Notes |
|---|---|
| Classes | Semicolon-separated list of enrolled classes |
| Parent ID | Cross-reference to Parents tab `ParentID` column |
| Status | `Active` or `Inactive` |

### Tab 3 — Teachers

**Columns:** `UserID | Name | Email | Subjects | Role | Status | Zoom Link`

| Field | Notes |
|---|---|
| Subjects | Comma-separated list of subjects they teach |
| Zoom Link | Default meeting link used for all their classes |

### Tab 4 — Subjects (per-day rows)

**Columns:** `SubjectID | Name | Type | TeacherID | Room | Days | Time | Status | MaxCapacity`

| Field | Values / Notes |
|---|---|
| SubjectID | Pattern: `SUB-<CLASS3>-<DAY3>` — e.g. `SUB-ENG-TUE`, `SUB-ENG-THU`, `SUB-ENG-FRI`. The 3-letter day suffix is the source of truth for which weekday this row represents. |
| Type | `Individual` or `Group` |
| TeacherID | Cross-reference to a Users-tab tutor (e.g. `TCH-002`) |
| Days | A **single** weekday for this row (e.g. `Tuesday`) |
| Time | Class time range, e.g. `11:00 AM - 12:00 PM` (used to compute hours/week) |
| MaxCapacity | Integer. Falls back to the configurable default if blank. Controls the capacity bar / colour-coding. |

**Each row represents one (Class, Day) combination.** A class that runs on three weekdays is three rows. The Calendar, Analysis, and Enrolment dropdowns all key off `(SubjectID, Days)` — so dropdowns and tables show the day alongside the name (e.g. *English — Tue — 11:00 AM*) to keep otherwise-identical rows distinguishable.

### Tab 5 — Enrollments

**Columns:** `Student Name | Class Name | Class Date | Class Time | Parent Email | Status | Override Action | Teacher | Teacher Email | Zoom Link | Class Type`

This is the central activity log. One row = one student's booking for one class session.

| Status value | Meaning |
|---|---|
| `Active` | Confirmed, upcoming class |
| `Cancelled` | Cancelled with more than 24 hours' notice — no fee |
| `Late Cancellation` | Cancelled within 24 hours — pending principal review |
| `Fee Waived` | Principal reviewed and waived the late fee |
| `Fee Confirmed` | Principal reviewed and confirmed the fee applies |

**Override Action** column: set to `Fee Waived` or `Fee Confirmed` when principal acts; blank otherwise.

When a student joins a class from the Browse page without a specific date yet, `Class Date` and `Class Time` are set to `TBD`. The principal or teacher updates these later.

### Tab 6 — Enrollment Requests

**Columns:** `Student Name | Student Email | Previously Enrolled | Current School | Current Grade | Age | Classes Interested | Parent Email | Parent Phone | Reference | Promo Code | Notes | Submission Date | Status | Request Type`

Populated by the public enrolment form at `/enroll`. Principal approves or rejects from the Principal Dashboard.

| Status | Meaning |
|---|---|
| `Pending` | Awaiting principal review |
| `Approved` | Accepted — principal activates the student separately |
| `Rejected` | Declined |

### Tab 7 — Parents

**Columns:** `Email | Parent Name | Phone | Children | Added Date | Status | ParentID`

| Field | Notes |
|---|---|
| Children | Semicolon-separated student names |
| ParentID | Sequential: `PAR-001`, `PAR-002`, … |
| Status | `Active` or `Inactive` |

### Tab 8 — Archive

**Columns:** `UserID | Email | Role | Name | Added Date | Status | Archived Date`

Users are copied here when deactivated. Numbers are never reused — new users always get a higher number than the highest in both Users and Archive.

### Tab 9 — Announcements

**Columns:** `AnnouncementID | Title | Message | Priority | IsActive`

| Field | Values |
|---|---|
| AnnouncementID | Any unique string, e.g. `ANN-001` |
| Priority | `Urgent` or `Standard` |
| IsActive | `true` or `false` (lowercase string) |

- **Urgent** banners appear in **red** across the top of every page and cannot be dismissed.
- **Standard** banners appear in **amber** and can be dismissed per-user (remembered in browser storage).
- Set `IsActive` to `false` to hide an announcement without deleting it.

---

## 4. User Workflows

### 4.1 New Student Enrolment

```
1. Parent/student visits /enroll (public — no login required)
2. Fills out form:
     - Student name, email, age
     - Current school & grade
     - Previously enrolled? (Yes/No)
     - Classes interested in (dropdown from Subjects tab)
     - Parent email & phone
     - Reference source & promo code (optional)
     - Notes (optional)
3. Form submits → row written to "Enrollment Requests" tab with Status = Pending
4. Principal logs in → Principal Dashboard → Enrollment Requests card
5. Principal reviews and clicks Approve or Reject
6. If Approved:
     - Principal adds the student via "Add Student" form (which creates a Students row + Users row)
     - Student/parent receives their login credentials and can access the portal
```

### 4.2 Class Cancellation (Parent)

```
1. Parent logs in → /parent
2. Finds the upcoming class in their schedule
3. Clicks "Cancel Class"
4. Confirmation dialog appears
5. Parent confirms cancellation → POST /api/enrollments/:row/cancel
6. System checks: does the class start in more than 24 hours?

   YES (> 24h) → Status = "Cancelled"
                  No fee. Confirmation shown to parent.

   NO (≤ 24h)  → Status = "Late Cancellation"
                  Warning shown: "Pending principal review — late cancellation fee may apply"
```

### 4.3 Late Cancellation Fee Review (Principal)

```
1. Principal logs in → /principal
2. "Late Cancellations" section shows all rows with Status = "Late Cancellation"
3. For each row, principal clicks either:
     "Waive Fee"     → POST /api/enrollments/:row/override { action: "Fee Waived" }
     "Confirm Fee"   → POST /api/enrollments/:row/override { action: "Fee Confirmed" }
4. Row Status + Override Action column both update in the sheet
5. Parent portal updates on next load to reflect the new status
```

### 4.4 Joining a Class (Browse Classes)

```
1. Logged-in user navigates to /classes
2. Sees all Active subjects with capacity bars (X / MaxCapacity)
3. If class is not full → "Join Class" button is enabled
   If class is full    → "Class Full" button is disabled
                          (Principal/admin also sees an "Override" button)
4. User clicks "Join Class" or "Override"
5. Mini-form appears: Student Name + Parent Email
6. User fills in details and clicks "Confirm Enrol"
7. POST /api/enrollments/join creates an Enrollments row with:
     - Class Date = "TBD"
     - Class Time = "TBD"
     - Status = "Active"
8. Capacity counter on the page updates on next refresh
```

### 4.5 Teacher Views Their Schedule

```
1. Tutor logs in → /dashboard
2. Clicks "Schedule" in the sidebar → /schedule
3. Page fetches GET /api/enrollments?teacherEmail=<logged-in email>
4. Shows:
     - Active classes: student name, class, date, time, type, Zoom link
     - Past/cancelled classes (muted, grouped below)
```

### 4.6 Adding a Teacher (Principal)

```
1. Principal → /principal → "Add Teacher" form
2. Fills in: Name, Email, Subjects, Zoom Link
3. POST /api/principals/add-teacher
     → Creates row in Teachers tab
     → Creates row in Users tab (Role = tutor, Status = Active)
     → Generates next TCH-XXX UserID automatically
4. Teacher receives login invite via Clerk; on first sign-in → routed to /dashboard
```

### 4.7 Activating a New Parent/Student Account

```
1. Enrolment request approved (see 4.1)
2. Principal → "Add Student" form: Name, Email, Parent Email, Phone, Classes
3. POST /api/principals/add-student
     → Creates row in Students tab
     → Creates row in Users tab (if email provided) with Status = Active
4. If payment confirmation is required before activation:
     - Create student with Status = Inactive in Users tab
     - Once payment confirmed, principal uses "Reactivate" to set Status = Active
```

---

## 5. Feature Reference

### Announcement Banner

Appears at the top of every page for all logged-in users.

- **Urgent** (red): visible to everyone, cannot be dismissed. Use for closures, emergencies, urgent notices.
- **Standard** (amber): dismissible. User's dismissal is stored in their browser. Reappears if they clear browser data.
- Managed directly in the Google Sheet — no app deployment needed to add or change announcements.

### My Schedule (Tutors — `/schedule`)

- Shows all Enrollment rows where the Teacher Email column matches the logged-in tutor.
- Active classes shown first with date, time, student name, class type, and Zoom link.
- Past and cancelled classes shown below in a muted section.

### Browse Classes (`/classes`)

- Lists all Active subjects from the Subjects tab.
- Each card shows: teacher name, days, room, type (Individual/Group), and a live capacity bar.
- Capacity is calculated in real time by counting Active enrollment rows matching the class.
- **Full classes**: Join button disabled. Principal/admin sees an "Override" button to enrol anyway.
- Joining creates an enrollment row with Date/Time = TBD for the principal or teacher to update.

### 24-Hour Cancellation Policy

Enforced automatically by the API:
- `> 24 hours` before class start → Status = `Cancelled` (no fee)
- `≤ 24 hours` before class start → Status = `Late Cancellation` (fee pending review)

The policy uses the `Class Date` and `Class Time` fields in the Enrollment row. If the date or time is missing or `TBD`, the system assumes `> 24 hours` (no fee) as a safe default.

### Feature Flags

Three optional features can be toggled on/off from the Developer Portal (`/admin`). They are stored per-browser and do not affect other users.

| Feature | What it shows/hides |
|---|---|
| `schedule` | Schedule link in the tutor sidebar |
| `assessments` | Assessments link in all sidebars |
| `billing` | Billing link in all sidebars |

---

## 6. API Reference

All endpoints are prefixed with `/api`. Every endpoint that reads from or writes to a sheet requires a `sheetId` parameter (query string, request body, or `X-Sheet-Id` header).

### Roles

| Method | Path | Description |
|---|---|---|
| GET | `/api/roles/check?sheetId=&email=` | Returns `{ role, status, userId }` for a given email. Used on login. |

### Subjects

| Method | Path | Description |
|---|---|---|
| GET | `/api/subjects?sheetId=&status=` | All subjects, optionally filtered by status |
| GET | `/api/subjects/with-capacity?sheetId=&status=` | Subjects enriched with `currentEnrolled`, `MaxCapacity`, `isFull` |
| POST | `/api/subjects` | Create a new subject. Body: `{ name, type, teachers, room, days, maxCapacity }` |
| PATCH | `/api/subjects/:row` | Update subject fields |

### Enrollments

| Method | Path | Description |
|---|---|---|
| GET | `/api/enrollments?sheetId=&parentEmail=&teacherEmail=&status=` | List enrollments with optional filters |
| POST | `/api/enrollments` | Create a new enrollment row |
| POST | `/api/enrollments/join` | Student joins a class from the Browse page. Body: `{ sheetId, studentName, parentEmail, subjectName, subjectType, teacherName }` |
| POST | `/api/enrollments/:row/cancel` | Cancel enrollment with 24h policy check |
| POST | `/api/enrollments/:row/override` | Principal waives or confirms late fee. Body: `{ action: "Fee Waived" \| "Fee Confirmed" }` |
| PUT | `/api/enrollments/:row/assign-teacher` | Assigns a teacher to an enrollment row by copying their name, email, and Zoom link |

### Enrollment Requests

| Method | Path | Description |
|---|---|---|
| GET | `/api/enrollment-requests?sheetId=&status=` | List requests |
| POST | `/api/enrollment-requests/:row/approve` | Approve a pending request |
| POST | `/api/enrollment-requests/:row/reject` | Reject a pending request |

### Users

| Method | Path | Description |
|---|---|---|
| GET | `/api/users?sheetId=` | List all users |
| POST | `/api/users/deactivate` | Set user Status = Inactive + copy to Archive tab |
| POST | `/api/users/reactivate` | Set user Status = Active |
| DELETE | `/api/users/:userId` | Hard delete from Users tab |
| GET | `/api/users/archive?sheetId=` | List archived users |

### Principal actions

| Method | Path | Description |
|---|---|---|
| POST | `/api/principals/add-teacher` | Creates Teachers + Users rows with auto-generated TCH-XXX ID |
| POST | `/api/principals/add-student` | Creates Students row + optional Users row |

### Announcements

| Method | Path | Description |
|---|---|---|
| GET | `/api/announcements?sheetId=` | Returns all announcements where `IsActive = true`. Returns `[]` if tab doesn't exist yet. |

### Sheets (data management)

| Method | Path | Description |
|---|---|---|
| GET | `/api/sheets/drive-files` | Lists Google Drive spreadsheets the user has access to |
| POST | `/api/sheets/create` | Creates a new spreadsheet with all required tabs and headers |
| POST | `/api/sheets/seed` | Loads full demo data into all tabs (destructive — clears first) |
| POST | `/api/sheets/ensure-headers` | Safe: adds missing tabs, writes headers to blank tabs only |

---

## 7. Processes & Admin Procedures

### Initial Setup (first time)

1. Go to **Settings** (`/settings` or the Settings icon).
2. Connect your Google account if not already linked.
3. Either:
   - **Create New Sheet**: app creates a fresh spreadsheet with all tabs and headers.
   - **Link Existing Sheet**: paste in the spreadsheet ID from an existing sheet.
4. Click **Load Demo Data** (amber button in Settings) to populate sample data for testing.
5. The sheet ID is saved in your browser. Share it with co-administrators manually if needed.

### Adding the First Real Principal

1. In your Google Sheet, open the **Users** tab.
2. Add a row manually:
   ```
   PRN-001 | principal@yourdomain.com | principal | Your Name | 2026-04-10 | Active
   ```
3. The principal logs in via the app and is routed to `/principal`.

### Adding Announcements

Directly edit the **Announcements** tab in Google Sheets:

| Column | Value |
|---|---|
| AnnouncementID | `ANN-001` (any unique ID) |
| Title | Short title, e.g. `Term 2 Dates` |
| Message | Full announcement text |
| Priority | `Urgent` or `Standard` |
| IsActive | `true` |

Changes appear for all users on their next page load — no app restart needed.

To deactivate an announcement without deleting it: change `IsActive` to `false`.

### Changing a User's Role

1. Open the **Users** tab in Google Sheets.
2. Find the user's row by email.
3. Change the **Role** column to the new role (e.g. `principal`, `tutor`, `parent`).
4. The user's portal changes on their next login.

### Deactivating a User (blocking access)

**Via the app (Principal Dashboard):**
1. Go to `/principal` → User Management section.
2. Find the user → click Deactivate.
3. Their Users tab Status changes to `Inactive` and their row is copied to the Archive tab.

**Via Google Sheets:**
1. Open the **Users** tab.
2. Change the user's `Status` to `Inactive`.
3. Access is blocked immediately on their next request.

### Updating Class Capacity

1. Open the **Subjects** tab in Google Sheets.
2. Find the subject row.
3. Change the `MaxCapacity` column to the new number.
4. The Browse Classes page reflects the new limit on next load.

### Backing Up Data

Principal Dashboard → scroll to the bottom → **Export CSV** button. This downloads a CSV of the current data for offline backup.

### Handling a Disputed Late Cancellation

1. Principal logs in → `/principal` → Late Cancellations section.
2. Reviews the student name, class, and cancellation date/time.
3. Clicks **Waive Fee** or **Confirm Fee**.
4. The Enrollments row updates:
   - Status: `Fee Waived` or `Fee Confirmed`
   - Override Action: same value
5. Parent portal shows the updated status automatically.

---

## 8. Announcements Management

### Workflow Summary

```
Principal / admin edits Google Sheet → Announcements tab
           ↓
Set IsActive = true to publish
Set IsActive = false to unpublish (non-destructive)
           ↓
All logged-in users see the banner on next page load
           ↓
  Urgent   → red bar, cannot be dismissed
  Standard → amber bar, user can click X to dismiss (remembered per-browser)
```

### Banner Behaviour

| Priority | Colour | Dismissible | Reappears? |
|---|---|---|---|
| `Urgent` | Red | No | Always visible |
| `Standard` | Amber | Yes (per-user) | Only if browser data cleared |

### Tips

- Use `Urgent` sparingly — it cannot be dismissed and is high-visibility.
- Multiple active announcements stack vertically.
- There is no character limit enforced, but keep messages brief for readability.
- You can pre-write future announcements with `IsActive = false` and flip them live on the day.

---

## 9. Settings & Configuration

### Browser-level Settings (localStorage)

These are stored per-browser, per-user. Clearing browser data resets them.

| Key | Purpose |
|---|---|
| `edutrack_sheet_id` | The linked Google Spreadsheet ID |
| `edutrack_user_role` | Cached role after login |
| `edutrack_user_name` | Cached display name |
| `edutrack_user_id` | Cached UserID from the Users tab |
| `edutrack_dismissed_ann_{id}` | Whether a standard announcement has been dismissed |

### Environment Variables (server-level)

Set in the Replit Secrets panel. Not visible to the browser.

| Variable | Required | Purpose |
|---|---|---|
| `DEVELOPER_EMAIL` | Recommended | Email that gets developer access without a Users tab entry |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key |

### Feature Flags

Toggled from the Developer Portal (`/admin`). Stored in browser localStorage. Three flags:

- `schedule` — show/hide the Schedule link in the tutor sidebar
- `assessments` — show/hide the Assessments link
- `billing` — show/hide the Billing link

---

## 10. Demo Data Reference

Loaded via **Settings → Load Demo Data**. Populates all 9 tabs with the following sample records.

### Demo Students

| Name | Email | Status | Parent |
|---|---|---|---|
| Emma Johnson | emma.j@student.com | Active | Sarah Johnson |
| Liam Smith | liam.s@student.com | Active | Mike Smith |
| Olivia Brown | olivia.b@student.com | Active | Lisa Brown |
| Noah Davis | noah.d@student.com | Active | Karen Davis |
| Ava Wilson | ava.w@student.com | **Inactive** | Sarah Johnson (PAR-001) |

### Demo Teachers

| Name | Email | Subjects |
|---|---|---|
| Dr. Sarah Chen | s.chen@edutrack.edu | Mathematics, Science |
| Mr. James Taylor | j.taylor@edutrack.edu | English |
| Ms. Rachel Kim | r.kim@edutrack.edu | Art, Physical Education |

### Demo Subjects & Capacity

| Subject | Type | Teacher | Days | MaxCapacity |
|---|---|---|---|---|
| Mathematics | Individual | Dr. Sarah Chen | Mon, Wed | 6 |
| Mathematics | Group | Dr. Sarah Chen | Tue, Thu | 8 |
| English | Individual | Mr. James Taylor | Mon, Wed | 6 |
| English | Group | Mr. James Taylor | Tue, Thu, Fri | 10 |
| Science | Group | Dr. Sarah Chen | Fri | 8 |
| Art | Individual | Ms. Rachel Kim | Wed | 4 |
| Art | Group | Ms. Rachel Kim | Thu | 8 |
| Physical Education | Group | Ms. Rachel Kim | Mon, Fri | 12 |

### Demo Enrollment Statuses

The demo includes enrollments in every status for testing purposes:
- **Active** — most classes
- **Cancelled** — Noah Davis, Physical Education
- **Late Cancellation** — Liam Smith and Olivia Brown (for principal review)
- **Fee Waived** — Emma Johnson, Physical Education (already resolved)
- **Fee Confirmed** — Ava Wilson, English (already resolved)

### Demo Enrollment Request (Pending)

| Student | Parent | Classes Interested | Status |
|---|---|---|---|
| Sophia Martin | james.martin@gmail.com | Mathematics (Individual) — Dr. Sarah Chen | **Pending** |

*Note: Sophia's parent account (James Martin / PAR-005) is Inactive in the demo, pending payment confirmation.*

### Demo Announcements

| ID | Title | Priority | Message |
|---|---|---|---|
| ANN-001 | Term 2 Enrolments Open | Standard | Term 2 enrolments are now open. Contact us to secure your spot. |
| ANN-002 | Public Holiday Closure | **Urgent** | EduTrack will be closed on Monday 22 April. All classes cancelled. |

---

## 11. Analysis & Insights (Principal)

The Principal Dashboard's **Analysis** tab is a read-only business view. Section order: **By Teacher → By Month → By Weekday → By Subject**.

- **By Teacher.** Each row shows total classes, students, and hours/week. The **Load** column renders a stacked bar with one segment per (Subject, Day), colour-coded by weekday — Mon (blue), Tue (violet), Wed (green), Thu (amber), Fri (pink), Sat (cyan), Sun (gray). Hovering a segment shows e.g. *"English — Tue: 1 student"*. Day chips below the bar show per-day totals.
- **By Month.** Sessions held, attendances, absences, and attendance % per month, filtered by the period selector at the top.
- **By Weekday.** Aggregated classes / students / hours for each weekday — a quick read on which day is busiest.
- **By Subject.** Each per-day class with its student count and fill % vs MaxCapacity.

### Configurable thresholds (planned — Developer-only "Assumptions" tab)

The platform is intended to be sold to multiple schools with different capacity norms. A future Developer-only tab will let each deployment edit:

| Setting | Default | Used for |
|---|---|---|
| Group fill RED %    | 90 | Turn-away risk flag |
| Group fill AMBER %  | 70 | Warning flag |
| Group fill LOW %    | 40 | "Promote / pause" suggestion |
| Individual target hrs/week | 20 | Per-tutor 1-on-1 capacity bench |
| Individual under-util % | 50 | Underused tutor flag |
| Individual over-util %  | 90 | Over-booked tutor flag |
| Attendance target % | 85 | Monthly attendance benchmark |
| Default group capacity | 8 | Fallback when Subject row's MaxCapacity is blank |

These values will drive every colour, flag, and auto-insight on the Analysis page.

---

## 12. FAQ

**Q: I'm listed in the Users tab as a Principal but the sign-in page says my email isn't registered.**
A: This was a bug in the sign-in lookup before April 2026. The fix makes `/api/roles/check` fall back to `DEFAULT_SHEET_ID` so it can find your row even before the browser has linked a sheet. If you still see this, check that (a) `DEFAULT_SHEET_ID` is set in the API's environment, and (b) your row in Users has `Status = Active`.

**Q: The Sign Out button does nothing.**
A: Fixed. Sign-out now clears all `edutrack_*` keys from `localStorage` and routes back to `/`. If it still doesn't work, hard-refresh to clear any cached old build.

**Q: A class shows red on the Calendar but the hover popover only lists one student.**
A: The popover used to be clipped by the table's horizontal scroll. It now renders into a portal so it escapes the overflow. The seat count and the popover always reflect the same per-day enrolment list.

**Q: My class dropdown shows the same option three times — *English, English, English*.**
A: Under the per-day Subject schema each weekday is its own row, so labels include the day (e.g. *English — Tue — 11:00 AM*). If you still see duplicates without days, the dropdown is reading a legacy field; flag it and we'll patch.

**Q: The "Classes" column on the Students table or the "Load" column on the Analysis page shows *English, English, English*.**
A: Same root cause as above. These now render as *English (Tue), English (Thu), English (Fri)* (Students table) and as a colour-coded stacked bar with hover tooltips (Analysis page).

**Q: How do I publish my changes?**
A: Use Replit's "Publish" flow. The `.replit.app` URL is the live app. The GitHub auto-push workflow is optional — it backs the codebase up to GitHub but is not part of deployment.

**Q: How do I add a new principal / tutor / student?**
A: Add a row in the Users tab with the right `Role`, `Email`, `Name`, and `Status = Active`. They can then sign in with that email immediately. Tutor and student rows in their respective extension tabs are for profile data; access is controlled by the Users tab only.

**Q: Where do I change the Google Sheet the app reads from?**
A: Settings page → "Google Sheet ID". The ID is stored per-browser (`edutrack_sheet_id`) and sent with every API request. The API also has a server-side `DEFAULT_SHEET_ID` used by sign-in.

---

*End of EduTrack Documentation*

*Last updated: April 2026*
