# EduTrack — Tutor & Coach Platform

## Overview

Full-stack tutoring and coaching platform management app. Multi-role portal app with Clerk authentication and Google Sheets as the primary data store.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite (`artifacts/edutrack/`) at path `/`
- **API**: Express 5 (`artifacts/api-server/`) at path `/api`
- **Authentication**: Clerk (multi-user login/signup)
- **Database**: Google Sheets (via Replit Google Sheets integration)

## Portals & Role Routing

Sign in → `/auth-redirect` → `/roles/check` → portal based on Users tab Role:
- `developer` (or legacy `admin`) → `/admin` (Developer Portal — no client data access)
- `principal` → `/principal` (Principal Dashboard — full client data)
- `tutor` → `/dashboard` (Tutor/Staff Portal)
- `parent` → `/parent` (Parent Portal)
- `student` → `/parent` (currently shares Parent Portal)

**Developer email bypass**: If email NOT in Users tab AND matches `DEVELOPER_EMAIL` env var → `developer` role, no Users tab entry required. If developer IS in the Users tab, Users tab role takes precedence.

**Data boundary**: Developer Portal has zero access to client data (students, teachers, enrollments, parents). All client data lives exclusively in the Principal Dashboard. When distributing the app, developer and principal must be separate accounts.

## Google Sheet Schema

All tabs and headers are defined in `artifacts/api-server/src/lib/googleSheets.ts`.

### Users Tab: `UserID, Email, Role, Name, Added Date, Status`
- **UserID**: role-prefixed sequential ID (`STU-001`, `TCH-001`, `PAR-001`, `PRN-001`, `ADM-001`)
- **Status**: `Active` / `Inactive` / `Pending` — Inactive = access denied immediately
- Users tab is the **single source of truth** for portal access. Role here = which portal.
- Being in the Students/Teachers tabs does NOT grant login access unless also in Users tab.

### Students Tab: `UserID, Name, Email, Classes, Status, Phone, Parent Email`
### Teachers Tab: `UserID, Name, Email, Subjects, Role, Status, Zoom Link`
### Subjects Tab: `SubjectID, Name, Type, Teachers, Room, Days, Status, MaxCapacity`
- **SubjectID**: sequential `SUB-001`, `SUB-002`, …
- **Type**: `Individual` | `Group` | `Both` — controls what students see when enrolling
- **Teachers**: comma-separated teacher names (multi-teacher support)
- **MaxCapacity**: integer, defaults to `8` when omitted. Used by `/subjects/with-capacity`.
### Enrollments Tab: `Student Name, Class Name, Class Date, Class Time, Parent Email, Status, Override Action, Teacher, Teacher Email, Zoom Link, Class Type`
- **Class Type**: `Individual` or `Group` — set at enrollment time
- **Status**: `Active`, `Cancelled`, `Late Cancellation`, `Fee Waived`, `Fee Confirmed`
### Enrollment Requests Tab: `Student Name, Student Email, Previously Enrolled, Current School, Current Grade, Age, Classes Interested, Parent Email, Parent Phone, Reference, Promo Code, Notes, Submission Date, Status, Request Type`
### Archive Tab: `UserID, Email, Role, Name, Added Date, Status, Archived Date`
- Rows copied here when a user is deactivated (Status set to Inactive).
### Announcements Tab: `AnnouncementID, Title, Message, Priority, IsActive`
- **Priority**: `Urgent` (red persistent banner) or `Standard` (amber dismissible banner)
- **IsActive**: `true` / `false` string — only `true` rows are surfaced by the API

Other tabs: `Parents`

Note: The `Config` tab has been removed. Feature flags are localStorage-only. Developer contact email is set via `DEVELOPER_EMAIL` environment variable (read-only from the app).

## Key API Routes

- `GET /api/roles/check` — role lookup, returns role + status + userId
- `POST /api/roles/enroll` — submit enrollment request
- `GET/POST /api/enrollment-requests` — principal approval flow
- `POST /api/principals/add-teacher` — creates Users + Teachers rows with UserID
- `POST /api/principals/add-student` — creates Students row (+ Users if email given) with UserID
- `GET /api/users` — list all Users tab entries
- `POST /api/users/deactivate` — revoke access + archive record
- `POST /api/users/reactivate` — restore access
- `DELETE /api/users/:userId` — hard delete from Users tab
- `GET /api/users/archive` — list archived users
- `GET /api/admin/features` — returns feature defaults (localStorage manages actual state)
- `GET /api/admin/contact` — returns developer contact from `DEVELOPER_EMAIL` env var only
- `POST /api/sheets/ensure-headers` — safe: add missing tabs/headers only
- `GET /api/enrollments?teacherEmail=&parentEmail=&status=` — filter enrollments by teacher/parent/status
- `POST /api/enrollments/:row/cancel` — 24-hour cancellation check; sets `Cancelled` or `Late Cancellation`
- `POST /api/enrollments/:row/override` — principal waives/confirms late-cancel fee
- `POST /api/enrollments/join` — student/parent joins a class from the Browse Classes page
- `GET /api/subjects/with-capacity` — subjects list enriched with `currentEnrolled`, `MaxCapacity`, `isFull`
- `GET /api/announcements` — active announcements from the Announcements tab

## Pages

| Route | Component | Who sees it |
|---|---|---|
| `/` | `home.tsx` | Everyone |
| `/dashboard` | `teacher-dashboard.tsx` | Tutors |
| `/schedule` | `my-schedule.tsx` | Tutors — classes filtered by their email |
| `/classes` | `browse-classes.tsx` | All logged-in — class list with capacity badges + Join button |
| `/checkin` | `checkin.tsx` | Tutors |
| `/student` | `student.tsx` | Students — schedule view |
| `/parent` | `parent.tsx` | Parents — cancel classes, view schedule |
| `/calendar` | `class-calendar.tsx` | Public — class calendar view |
| `/principal` | `principal.tsx` | Principal — enrollment requests, late-cancel overrides |
| `/housekeeping` | `housekeeping.tsx` | Principal — class/subject management |
| `/admin` | `admin.tsx` | Developer Portal |
| `/settings` | `settings.tsx` | All — link sheet |
| `/enroll` | `enroll.tsx` | Public — new student enrollment form |

## Announcement Banner

`AnnouncementBanner` (in `layout.tsx` AppLayout) fetches `/api/announcements` at render and displays:
- **Urgent** — solid red bar, no close button (always visible)
- **Standard** — amber bar with dismiss button (localStorage key: `edutrack_dismissed_ann_{id}`)

## Helper Functions in googleSheets.ts

- `colLetter(tabKey, field)` — returns A1 column letter for a named field (avoids hardcoded column references)
- `generateUserId(role, spreadsheetId)` — generates next sequential UserID for a role, checking both Users and Archive tabs so numbers never repeat

## Features System

Feature flag (`schedule`) is stored in **localStorage only** (no sheet dependency). Controls whether the Full Schedule nav item appears in the Tutor sidebar.

`getFeatures()` reads localStorage → `setStoredFeatures()` writes localStorage → Developer Portal toggle calls these directly with no API round-trip.

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/edutrack run dev` — frontend
