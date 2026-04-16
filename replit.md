# EduTrack — Tutor & Coaching Management Platform

## What It Is

EduTrack is a multi-role management platform for a tutoring/coaching business. It handles student enrolments, tutor scheduling, attendance, late cancellation tracking, and principal oversight — all backed by a live Google Sheet as the database.

---

## Architecture

| Layer | Tech | Location |
|---|---|---|
| Frontend | React + Vite | `artifacts/edutrack/` |
| API | Express 5 (Node 24) | `artifacts/api-server/` |
| Data store | Google Sheets | Via Replit Google Sheets integration |
| Monorepo | pnpm workspaces | Root `pnpm-workspace.yaml` |
| Production frontend | Netlify | Connected to GitHub `main` |
| Production API | Railway | Connected to GitHub `main` |
| GitHub sync | Auto-push script | `scripts/github-push.sh` (every 5 min) |

---

## Login & Role System

Login is email-only — no password, no Clerk UI. User enters email → API checks role → stored in localStorage → redirected to correct portal.

**Sign-in page**: `artifacts/edutrack/src/pages/sign-in.tsx`
**Role check endpoint**: `GET /api/roles/check?email=`

### Role routing

| Role | Portal | Route |
|---|---|---|
| `developer` | Developer/Admin Portal | `/admin` |
| `principal` | Principal Dashboard | `/principal` |
| `tutor` / `teacher` | Tutor Dashboard | `/dashboard` |
| `student` | Student Portal | `/student` |
| *(public)* | Enrolment Form | `/enroll` |

### Special bypasses (no Users tab entry needed)
- **Developer**: email matches `DEVELOPER_EMAIL` env var → always gets `developer` role + `DEFAULT_SHEET_ID` returned at login
- **Principal**: email matches `PRINCIPAL_EMAIL` env var → always gets `principal` role + `DEFAULT_SHEET_ID` returned at login

### localStorage keys set on login
```
edutrack_user_role      — role string
edutrack_user_email     — email
edutrack_user_name      — display name
edutrack_user_id        — UserID (e.g. STU-001)
edutrack_sheet_id       — Google Sheet ID (from login response)
```

---

## Portals

### Developer Portal (`/admin`)
Four tabs:
1. **Overview** — API health, sheet link, GitHub sync status card (last synced, branch, commit hash/message), failure alerts
2. **View as Role** — navigate to any portal as developer (bypasses role checks)
3. **Data Browser** — read any sheet tab as a live table
4. **Dev Tools** — create sheet, seed data, apply dropdown validation, ensure headers

### Principal Dashboard (`/principal`) — 6 tabs
1. **Requests** — incoming enrolment requests (approve/reject)
2. **Students** — student list, enrol/unenrol, view schedule
3. **Tutors** — tutor list, manage subjects/assignments
4. **Users** — all system users, activate/deactivate/delete
5. **Classes** — subject/class management
6. **Late Cancellations** — override fee waiver or confirm fee

All tabs auto-refresh every 30 seconds — no manual refresh needed.

### Tutor Dashboard (`/dashboard`)
- View assigned classes and student lists
- Mark attendance (Present / Absent / Late) per session
- Auto-refreshes every 30 seconds

### Student Portal (`/student`)
- View enrolled classes and schedule
- Cancel upcoming classes (24-hour rule applies)

### Public Enrolment Form (`/enroll`)
- No login required
- Students and tutors can apply
- Submission creates a row in the Enrollments tab with `Pending` status

---

## Google Sheet Schema

Schema source of truth: `artifacts/api-server/src/lib/googleSheets.ts`

| Tab | Key Fields |
|---|---|
| **Users** | UserID, Email, Role, Name, Status, Added Date |
| **Students** | StudentID, UserID, ParentID, CurrentSchool, CurrentGrade, PreviousStudent |
| **Teachers** | UserID, Name, Email, Subjects, Role, Status, Zoom Link |
| **Subjects** | SubjectID, Name, Type, Teachers, Room, Days, Status, MaxCapacity, Time |
| **Enrollments** | EnrollmentID, UserID, ClassID, ParentID, Status, TeacherID, Zoom Link, Class Type |
| **Attendance** | AttendanceID, ClassID, UserID, SessionDate, Status, Notes, MarkedBy, MarkedAt |
| **Parents** | ParentID, Name, Email, Phone, LinkedStudents |
| **Announcements** | AnnouncementID, Title, Message, Priority, IsActive |
| **Archive** | UserID, Email, Role, Name, Added Date, Status, Archived Date |

**UserID format**: role-prefixed sequential (`STU-001`, `TCH-001`, `PAR-001`, `PRN-001`)

**Enrolment Status values**: `Active`, `Cancelled`, `Late Cancellation`, `Fee Waived`, `Fee Confirmed`, `Pending`

**Attendance Status values**: `Present`, `Absent`, `Late`

---

## Key API Routes

```
GET  /api/roles/check              — role lookup by email
POST /api/roles/enroll             — submit enrolment application

GET  /api/enrollment-requests      — all enrolment rows (principal)
POST /api/enrollment-requests/:row/approve
POST /api/enrollment-requests/:row/reject

GET  /api/enrollments              — filter by teacherEmail, parentEmail, status
POST /api/enrollments/:row/cancel  — 24h check → Cancelled or Late Cancellation
POST /api/enrollments/:row/override — waive or confirm late-cancel fee
POST /api/enrollments/join         — student joins a class

GET  /api/subjects                 — list subjects
GET  /api/subjects/with-capacity   — subjects + currentEnrolled + isFull

GET  /api/users                    — all Users tab entries
POST /api/users/deactivate         — revoke access + archive
POST /api/users/reactivate         — restore access
DELETE /api/users/:userId          — hard delete

POST /api/principals/add-teacher   — create Users + Teachers rows
POST /api/principals/add-student   — create Students row (+ Users)
POST /api/principals/reassign-teacher

GET  /api/announcements            — active announcements only
GET  /api/attendance               — attendance records
POST /api/attendance/mark          — upsert one record per ClassID+UserID+SessionDate

GET  /api/sheets/:tab              — read any tab as JSON rows
POST /api/sheets/setup             — create a new EduTrack spreadsheet
POST /api/sheets/seed              — seed sample data
POST /api/sheets/ensure-headers    — add missing tabs/headers only
POST /api/sheets/apply-validation  — apply dropdown rules to status columns

GET  /api/backup/status            — check email backup config
POST /api/backup/send              — trigger manual backup email

GET  /api/admin/github-sync        — last GitHub sync time + commit details
GET  /api/github-sync-status       — push script failure status

GET  /api/config                   — returns DEFAULT_SHEET_ID
GET  /api/healthz                  — health check
```

---

## Daily Email Backup

Sends all sheet tabs as CSV attachments to the principal daily.

**Required env vars (Railway):**

| Var | Purpose |
|---|---|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` (default) |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `BACKUP_RECIPIENT` | Who gets the email (defaults to `PRINCIPAL_EMAIL`) |
| `BACKUP_CRON` | Cron schedule (default: `0 7 * * *` = 7am daily) |

If SMTP vars are not set, backup silently skips — no errors.

**Manual trigger**: Admin portal → Dev Tools → "Send Backup Now"

**Implementation files:**
- `artifacts/api-server/src/lib/email.ts` — Nodemailer transport
- `artifacts/api-server/src/lib/backup.ts` — reads tabs, builds HTML email + CSVs
- `artifacts/api-server/src/lib/scheduler.ts` — node-cron daily job
- `artifacts/api-server/src/routes/backup.ts` — manual trigger endpoint

---

## GitHub Auto-Push

Script: `scripts/github-push.sh`

- Runs every 5 minutes via the "GitHub Auto-Push" workflow
- Requires `GITHUB_TOKEN` secret (GitHub Personal Access Token, Contents: Read+Write)
- Auth is ephemeral — token never written to git config or remote URL
- Automatically pulls/rebases if remote has new commits (non-fast-forward), then retries push
- Writes sync status to `.github-sync-status.json` after each successful push
- Admin portal Overview tab shows last sync time, branch, and latest commit

**Sync failure alerts**: If push fails 3+ consecutive times, an alert email fires (max once/hour).
Required: `GITHUB_SYNC_ALERT_EMAIL` + SMTP vars.

---

## Announcements

`AnnouncementBanner` in `artifacts/edutrack/src/components/announcement-banner.tsx`

- Fetched from `/api/announcements` (active rows only)
- **Urgent** (`Priority = Urgent`): red persistent bar, no dismiss
- **Standard** (`Priority = Standard`): amber bar, dismissible (stored in localStorage)

---

## Environment Variables

### Railway (API)
| Var | Required | Purpose |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Google Sheets auth |
| `GOOGLE_PRIVATE_KEY` | Yes | Google Sheets auth |
| `DEFAULT_SHEET_ID` | Yes | Google Sheet ID (sent to browser at login) |
| `DEVELOPER_EMAIL` | Yes | Email(s) that get developer role (comma-separated) |
| `PRINCIPAL_EMAIL` | Yes | Email(s) that get principal role (comma-separated) |
| `DEVELOPER_NAME` | No | Display name for developer |
| `PRINCIPAL_NAME` | No | Display name for principal |
| `GITHUB_TOKEN` | Yes | For auto-push workflow |
| `SMTP_HOST` | No | Email backup/alerts |
| `SMTP_PORT` | No | Email backup/alerts (default 587) |
| `SMTP_USER` | No | Email backup/alerts |
| `SMTP_PASS` | No | Email backup/alerts |
| `SMTP_FROM` | No | Sender address (defaults to SMTP_USER) |
| `BACKUP_RECIPIENT` | No | Backup email recipient (defaults to PRINCIPAL_EMAIL) |
| `BACKUP_CRON` | No | Cron schedule (default: `0 7 * * *`) |
| `GITHUB_SYNC_ALERT_EMAIL` | No | Who gets GitHub sync failure alerts |

### Netlify (Frontend)
| Var | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Railway API public URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk (used for infrastructure, not UI auth) |

---

## Auto-Refresh

Key pages poll for live data automatically:
- **Principal Dashboard** — all 6 tabs refresh every 30 seconds
- **Tutor Dashboard** — refreshes every 30 seconds

Hook: `artifacts/edutrack/src/hooks/useAutoRefresh.ts` — pauses when browser tab is hidden.

---

## Dev Commands

```bash
pnpm --filter @workspace/api-server run dev   # API server
pnpm --filter @workspace/edutrack run dev      # Frontend
```
