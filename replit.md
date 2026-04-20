# EduTrack — Tutor & Coaching Management Platform

## Overview
EduTrack is a multi-role management platform for tutoring and coaching businesses. It streamlines enrolments, scheduling, attendance, and late-cancellation handling. The platform provides distinct portals for Developer, Principal, Tutor, Parent, and Student roles. Google Sheets serves as the live data store, so administrators retain familiar spreadsheet access alongside the app. The platform is intended to be sellable as a base app to multiple schools, with key behavioural thresholds (capacity targets, attendance benchmarks, fill-rate flags) configurable per deployment.

## User Preferences
The user prefers iterative development with concise, non-repetitive responses. Keep replies short. Confirm before major changes. Do not reference Netlify (deployment is Replit-only); GitHub auto-push is optional and can be stopped/started as needed.

## System Architecture
Monorepo using `pnpm workspaces`.

**Frontend:**
- React + Vite, located in `artifacts/edutrack/`.
- Distinct portals for Developer, Principal, Tutor, Parent, Student + a public enrolment form (`/enroll`).
- Auto-refresh every 30s on key dashboards.

**Backend API:**
- Express 5 on Node.js, in `artifacts/api-server/`.
- Reads `DEFAULT_SHEET_ID` env var as a fallback when the client hasn't supplied a `sheetId` (used by `/roles/check` during sign-in).

**Data Store — Google Sheets:**
- Schema lives in `artifacts/api-server/src/lib/googleSheets.ts`. Tabs include Users, Students, Teachers, Subjects, Enrollments, Attendance, Parents, Announcements, Settings, Archive.
- **Subjects schema (Option A — per-day rows):** each Subject row represents one (Class, Day) combination. SubjectIDs follow the pattern `SUB-<CLASS3>-<DAY3>`, e.g. `SUB-ENG-TUE`, `SUB-ENG-THU`, `SUB-ENG-FRI`. The `Days` column on each row contains a single weekday. Per-day rows are the source of truth for capacity / attendance / colour-coding.
- UserIDs are role-prefixed and sequential (e.g., `STU-001`, `TCH-001`).
- Enrollment Status: `Active`, `Cancelled`, `Late Cancellation`, `Fee Waived`, `Fee Confirmed`, `Pending`.
- Attendance Status: `Present`, `Absent`, `Late`.

**Authentication & Authorization:**
- Custom email-only login. **No Clerk UI is used.**
- `GET /api/roles/check?email=` looks the email up in the Users tab (falling back to `DEFAULT_SHEET_ID` because the sign-in page has no sheetId yet) and returns the user's role, name, userId, and sheetId.
- Sign-in stores `edutrack_user_email`, `edutrack_user_role`, `edutrack_user_name`, `edutrack_user_id`, and `edutrack_sheet_id` in `localStorage`.
- Sign-out is handled by `useSignOut()` — clears all `edutrack_*` localStorage keys and routes to `/`.
- Env-var bypasses: `DEVELOPER_EMAIL` and `PRINCIPAL_EMAIL` grant their roles even without a Users tab row.

**Deployment:**
- Frontend + API both run on Replit. The user deploys via Replit's "Publish" flow only.
- `scripts/github-push.sh` syncs to GitHub on a workflow timer, but this workflow can be stopped at any time and is not required for deployment.

**Key Features:**
- **Developer Portal (`/admin`):** API health, sheet linking, GitHub sync status, data browser, dev tools (sheet creation/seeding/validation), CSV bulk upload.
- **Principal Dashboard (`/principal`):** Tabs for Requests, Students, Tutors, Users, Classes, Attendance, Bulk Upload, Analysis. Class-selection dropdowns now show day + time (e.g. `English — Tue — 11:00 AM (Group)`) because per-day Subject rows would otherwise look identical.
- **Tutor Dashboard (`/dashboard`):** Class list, students, attendance marking.
- **Parent / Student Portals:** Schedule view, cancellation (24-hour rule).
- **Public Enrolment Form (`/enroll`):** Class dropdown uses `subjectLabel()` to combine Name + Day + Time + Type + Teacher.
- **Class Calendar (`/calendar`):** Weekday columns with green / amber / red seat indicators per (Subject, Day). Hover popover uses Radix `Popover` (renders into a Portal so it escapes the table's `overflow-x-auto`).
- **Analysis Tab (Principal):** Section order is **By Teacher → By Month → By Weekday → By Subject**. The "By Teacher" Load column renders a `StackedDayBar` — one segment per (Subject, Day), colour-coded by weekday, with hover tooltips showing student counts; below it, day chips show per-day totals.

**Planned (not yet built):**
- **Assumptions tab (Developer-only):** A settings page for editable thresholds (group fill red/amber/low %, individual tutor target hrs/week and util %, attendance target %, default group capacity). Backed by the Settings sheet tab; analysis page reads via `/assumptions`.
- Additional Analysis charts: KPI strip split by Type (Group vs Individual), Demand-vs-Supply table with auto-flagged actions, ranked Subject bar coloured by Type, Subject × Weekday heatmap, Group-vs-Individual hours split per teacher, Present/Absent stacked bars + attendance % line vs target, auto-insights callout.

## External Dependencies
- **Google Sheets:** Primary data storage. Requires `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`.
- **Nodemailer:** Daily email backups, GitHub sync alerts. Configured via `SMTP_USER` / `SMTP_PASS` (and host/port if non-default).
- **node-cron:** Schedules daily backups.
