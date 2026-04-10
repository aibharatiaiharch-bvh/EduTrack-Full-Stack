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
- `admin` → `/admin` (Developer Admin Portal)
- `principal` → `/principal` (Principal Dashboard)
- `tutor` → `/dashboard` (Tutor/Staff Portal)
- `parent` → `/parent` (Parent Portal)
- `student` → `/parent` (currently shares Parent Portal)

**Developer email bypass**: If email is NOT found in the Users tab AND matches `DEVELOPER_EMAIL` env var → admin access without a Users tab entry. If the developer IS in the Users tab, their Users tab role takes precedence.

## Google Sheet Schema

All tabs and headers are defined in `artifacts/api-server/src/lib/googleSheets.ts`.

### Users Tab: `UserID, Email, Role, Name, Added Date, Status`
- **UserID**: role-prefixed sequential ID (`STU-001`, `TCH-001`, `PAR-001`, `PRN-001`, `ADM-001`)
- **Status**: `Active` / `Inactive` / `Pending` — Inactive = access denied immediately
- Users tab is the **single source of truth** for portal access. Role here = which portal.
- Being in the Students/Teachers tabs does NOT grant login access unless also in Users tab.

### Students Tab: `UserID, Name, Email, Classes, Status, Phone, Parent Email`
### Teachers Tab: `UserID, Name, Email, Subjects, Role, Status`
### Archive Tab: `UserID, Email, Role, Name, Added Date, Status, Archived Date`
- Rows copied here when a user is deactivated (Status set to Inactive).

Other tabs: `Subjects`, `Enrollments`, `Enrollment Requests`, `Parents`, `Config`

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
- `GET/PUT /api/admin/features` — feature flag management
- `GET/PUT /api/admin/contact` — developer contact info
- `POST /api/sheets/ensure-headers` — safe: add missing tabs/headers only

## Helper Functions in googleSheets.ts

- `colLetter(tabKey, field)` — returns A1 column letter for a named field (avoids hardcoded column references)
- `generateUserId(role, spreadsheetId)` — generates next sequential UserID for a role, checking both Users and Archive tabs so numbers never repeat

## Features System

Feature flags (`assessments`, `billing`, `schedule`) are stored in:
1. Google Sheet Config tab (persisted, shared)
2. `localStorage` (cached for fast sidebar rendering)

`getFeatures()` reads localStorage → `setStoredFeatures()` writes localStorage → both are updated together when admin toggles a feature.

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — API server
- `pnpm --filter @workspace/edutrack run dev` — frontend
