# EduTrack — Tutor & Coaching Management Platform

## Overview
EduTrack is a multi-role management platform for tutoring and coaching businesses. It streamlines enrolments, scheduling, attendance, and late-cancellation handling. Distinct portals for Developer, Principal, Tutor, Parent, and Student. Google Sheets is the live data store, so administrators retain familiar spreadsheet access alongside the app. Intended to be sellable as a base app to multiple schools, with configurable thresholds per deployment.

## User Preferences
- Keep replies concise. Confirm before making changes.
- Dates stay as YYYY-MM-DD.
- Deployment is Replit-only (no Netlify).
- GitHub auto-push workflow is optional and can be stopped anytime.

---

## System Architecture
Monorepo using `pnpm workspaces`.

**Frontend** — `artifacts/edutrack/`
- React + Vite
- Portals: Developer (`/admin`), Principal (`/principal`), Tutor (`/dashboard`), Parent (`/parent`), Student (`/student`), public enrolment (`/enroll`)
- Auto-refresh every 30 s on key dashboards

**Backend API** — `artifacts/api-server/`  (port 8080)
- Express 5 on Node.js
- Reads `DEFAULT_SHEET_ID` env var as fallback when client hasn't supplied `sheetId` (used by `/roles/check` at sign-in)
- Key route files: `attendance.ts`, `enrollments.ts`, `analysis.ts`, `admin.ts`, `tutors.ts`, `subjects.ts`

**Data Store — Google Sheets**
- Sheet ID (current): `1CwS-vj_Qb2gc3VQ5bwpONCNKjibwMCqMOZD_HLT8rQo`
- Schema in `artifacts/api-server/src/lib/googleSheets.ts`
- `readTabRows` reads headers from actual sheet row 1 — any schema migration must update BOTH code `SHEET_HEADERS` AND the physical sheet header row

---

## Sheet Schema

| Tab | Key Columns |
|-----|-------------|
| Users | UserID, Name, Email, Role, Phone, SheetID, Status |
| Students | StudentID, UserID, Parent Name, … |
| Teachers | TeacherID, UserID, … |
| Subjects | SubjectID, Name, Type, TeacherID, Room, Days, Time, Status, MaxCapacity, Teacher Name |
| Enrollments | EnrollmentID, StudentID, ClassID (→SubjectID), Status, … |
| Attendance | AttendanceID, SubjectID, UserID, SessionDate, Status, Notes, MarkedBy, MarkedAt, Within24Hrs, Student Name, Teacher Name |
| Parents | ParentID, UserID, … |
| Announcements | … |
| Settings | Key, Value |
| Archive | … |

**SubjectID format:** `SUB-<CLASS3>-<DAY3>` e.g. `SUB-MAT-MON`, `SUB-ENG-FRI`  
**UserID format:** role-prefixed sequential e.g. `STU-001`, `TCH-001`

**Enrollment Status values:** Active, Cancelled, Late Cancellation, Fee Waived, Fee Confirmed, Pending  
**Attendance Status values:** Present, Absent, Late

---

## Authentication
- Custom email-only login. No Clerk UI.
- `GET /api/roles/check?email=` looks up Users tab → returns role, name, userId, sheetId.
- Sign-in stores `edutrack_user_*` and `edutrack_sheet_id` in localStorage.
- `useSignOut()` clears all `edutrack_*` keys and routes to `/`.
- Env-var bypasses: `DEVELOPER_EMAIL`, `PRINCIPAL_EMAIL`.

---

## Billing & Cancellation Rules
- Students billed per **scheduled weekday** (e.g. 4 Mondays in a month = 4 sessions).
- **Late fee rule:** cancel on the class day → Within24Hrs = `Yes` (fee applies). Cancel before class day → `No` (no fee).
- Principal manually toggles Within24Hrs Yes/No on the Attendance tab (via toggle button in the Cancellations table).
- Tutor attendance marking exists but is optional — billing is driven by scheduled weekdays, not tutor marks.

---

## Cancellations Data Flow
1. Student/Parent cancels via app → `enrollments.ts` writes an `Absent` row to Attendance tab with SubjectID, UserID, SessionDate, Student Name, Teacher Name pre-filled.
2. Principal sees cancellations on the **Attendance tab → Cancellations table**: Student | Class | Teacher | Date | Within 24 hrs.
3. Class name is resolved via Subjects JOIN on SubjectID; SubjectID itself is the fallback.
4. Student Name & Teacher Name are read **directly from the Attendance row** (no join needed).
5. Principal toggles Within24Hrs → `PATCH /api/attendance/:id/within24hrs`.

---

## Key Features

| Portal | Features |
|--------|----------|
| Developer (`/admin`) | API health, sheet linking, GitHub sync, data browser, sheet creation/seeding/validation, CSV bulk upload, backfill-names endpoint |
| Principal (`/principal`) | Requests, Students, Tutors, Users, Classes (with **Reassign Teacher** action), Attendance (with Cancellations table), Bulk Upload, Analysis tabs |
| Tutor (`/dashboard`) | Class list, student list, optional attendance marking |
| Parent/Student | Schedule view, cancellation flow with same-day late-fee detection |
| Public (`/enroll`) | Enrolment form; class dropdown uses `subjectLabel()` (Name + Day + Time + Type + Teacher) |
| Calendar (`/calendar`) | Weekday columns, green/amber/red seat indicators; Radix Popover escapes overflow |

**Analysis Tab (Principal):** By Teacher → By Month → By Weekday → By Subject.  
"By Teacher" shows a `StackedDayBar` with per-day segments coloured by weekday + hover tooltips.

---

## Admin Utilities
- `POST /api/admin/backfill-names` — fills blank Student Name / Teacher Name cells across Students, Subjects, Attendance tabs.
- `POST /api/admin/migrate-columns` — schema migration helper.
- `POST /api/subjects/:row/reassign` — reassigns a Subject row to a different teacher. Body: `{ teacherId }`. Updates `TeacherID` + `Teacher Name` columns. Used by the Classes tab Reassign button (Principal/Developer only).
- `scripts/seed-attendance.mjs` — seeds realistic April 2026 attendance (126 rows, 6 absences).
- `scripts/renumber-subjects-and-teachers.mjs` — renumbers SubjectIDs (`SUB-001..`) and propagates IDs to Enrollments, Attendance, Students. Supports `--dry-run`.
- `scripts/rebuild-student-classes.mjs` — rebuilds the Students.Classes column from active Enrollments (e.g. "Art, English, Mathematics").

---

## External Dependencies
- **Google Sheets** — primary data store (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`)
- **Nodemailer** — daily email backups, GitHub sync alerts (`SMTP_USER`, `SMTP_PASS`)
- **node-cron** — schedules daily backups

---

## Planned (not yet built)
- **Assumptions tab (Developer-only):** editable thresholds (fill-rate red/amber %, tutor target hrs, attendance target %). Backed by Settings tab; analysis reads via `/assumptions`.
- Additional Analysis charts: KPI strip by Type, Demand-vs-Supply table, Subject bar, Subject×Weekday heatmap, Present/Absent stacked bars, auto-insights callout.
