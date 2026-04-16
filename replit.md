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
Five tabs:
1. **Overview** — API health, sheet link, GitHub sync status card (last synced, branch, commit hash/message), failure alerts
2. **View as Role** — navigate to any portal as developer (bypasses role checks)
3. **Data Browser** — read any sheet tab as a live table
4. **Dev Tools** — create sheet, seed data, apply dropdown validation, ensure headers, add subjects
5. **Mass Upload** — bulk CSV student upload (auto-approved, Active on creation)

### Principal Dashboard (`/principal`) — 7 tabs
1. **Requests** — incoming enrolment requests (approve/reject)
2. **Students** — student list, enrol/unenrol, view schedule; Add Student form
3. **Tutors** — tutor list, manage subjects/assignments
4. **Users** — all system users, activate/deactivate/delete
5. **Classes** — subject/class management; Add New Class form
6. **Late Cancellations** — override fee waiver or confirm fee
7. **Mass Upload** — bulk CSV student upload (auto-approved, Active on creation)

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
POST /api/roles/enroll             — submit enrolment application (public, creates Pending row)
POST /api/roles/enroll-bulk        — bulk CSV upload (principal/developer only; auto-Active)

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

---

## FAQ — How To Scenarios

### How do I sign in as each role?
Go to `/sign-in` and enter the matching email:
- **Developer** → email set in `DEVELOPER_EMAIL` env var
- **Principal** → email set in `PRINCIPAL_EMAIL` env var (`bharati.h@gmail.com`)
- **Tutor** → email of a user in the Users tab with role `tutor` or `teacher`
- **Student** → email of a user in the Users tab with role `student`
- **Developer can access any portal** by navigating directly to `/principal`, `/dashboard`, or `/student` after logging in

---

### How do I set up the Google Sheet from scratch?
1. Sign in as developer → go to `/admin` → Dev Tools tab
2. Click **"Create Sheet + Sample Data in My Drive"** — this creates a fully structured sheet in your Google Drive
3. Click **"Use this sheet in the app"** to set it as active
4. Copy the Sheet ID and set it as `DEFAULT_SHEET_ID` in Railway env vars

---

### How do I populate the sheet with test data?
1. Sign in as developer → `/admin` → Dev Tools tab
2. Click **"Ensure Headers"** first (creates all tabs and columns)
3. Click **"Seed Demo Data"** (fills every tab with sample records)

---

### How do I add a new student?
**Option A — via the public enrol form (preferred):**
1. Go to `/enroll` → select Student/Family → fill in the form → submit
2. Sign in as principal → Requests tab → approve the request

**Option B — directly from the principal dashboard:**
1. Sign in as principal → Students tab → click "Add Student"

---

### How do I add a new class/subject?
**From the Principal Dashboard:**
1. Sign in as principal → Classes tab → click **"Add New Class"**
2. Fill in name, type, days, time, room, capacity, and assign a teacher

**From the Developer Portal:**
1. Sign in as developer → Dev Tools tab → **"Add New Class"** card → click "Add"

The new class appears immediately in the enrol form dropdown for new students.

---

### How do I add a new tutor?
1. Sign in as principal → Tutors tab → click "Add Tutor"
2. Fill in name, email, subjects, and Zoom link
3. The tutor can then sign in with their email and access the Tutor Dashboard

---

### How do I approve an enrolment request?
1. Sign in as principal (or developer navigating to `/principal`)
2. Go to the **Requests** tab — all pending submissions appear here
3. Click **Approve** to enrol the student or **Reject** to decline

---

### How do I bulk-upload students from a CSV?
1. Sign in as **principal** or **developer**
2. Go to the **Mass Upload** tab (top nav in both portals)
3. Download the CSV template — columns are: Student Name, Student Email, Age, Current School, Current Grade, Previously Enrolled (Yes/No), Classes Interested, Parent Email, Parent Phone, Reference, Promo Code, Notes
4. Fill in the spreadsheet and upload the file
5. A preview table appears — review it, then click **Upload All**

**What gets written for each row:**
- **Users tab** — student created (or updated) as `Active`
- **Students extension tab** — full profile: name, parent link, classes, phone, school, grade, previously enrolled flag
- **Parents tab** — parent user created (or linked) with the student listed as a child

All students are immediately **Active** — no approval step needed.

---

### What happens when a student picks "New Subject / Not in list" on the enrol form?
- An amber badge appears showing the selection
- The Notes field changes to prompt them to describe what they want
- The principal sees this in the Requests tab and can create the class before approving

---

### How do I change the principal email?
Update the `PRINCIPAL_EMAIL` environment variable:
- **Replit (dev)**: the agent can update it via the Secrets/env panel
- **Railway (production)**: go to your Railway project → Variables → update `PRINCIPAL_EMAIL`

The new email takes effect immediately after the API server restarts.

---

### How do I handle an empty principal dashboard?
The dashboard is empty when the Google Sheet has no data. Fix it by:
1. Going to Developer Portal → Dev Tools → **"Seed Demo Data"**
2. Or submitting a test enrolment via `/enroll` and approving it

---

### How do I trigger an email backup manually?
1. Sign in as developer → Dev Tools tab → **"Send Backup Now"** button
2. Requires SMTP env vars to be set in Railway (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`)

---

### How do I set up automatic daily email backups?
Set these env vars in Railway:
- `SMTP_HOST` — e.g. `smtp.gmail.com`
- `SMTP_USER` — your Gmail address
- `SMTP_PASS` — Gmail App Password (not your regular password)
- `BACKUP_RECIPIENT` — who receives the backup (defaults to `PRINCIPAL_EMAIL`)
- `BACKUP_CRON` — when to send (default: `0 7 * * *` = 7am daily)

---

### How do I deploy changes to production?
Changes auto-deploy:
- **GitHub Auto-Push** runs every 5 minutes and pushes new commits to GitHub
- **Netlify** detects the push and rebuilds the frontend automatically
- **Railway** detects the push and redeploys the API automatically

No manual steps needed — just make your changes in Replit and wait ~5–10 minutes.

---

### How do I check if GitHub sync is working?
Sign in as developer → `/admin` → Overview tab → **GitHub Sync** card.
It shows the last sync time, branch, and latest commit message.

---

### How do I waive or confirm a late cancellation fee?
1. Sign in as principal → **Late Cancellations** tab
2. Find the record → click **"Waive Fee"** or **"Confirm Fee"**

---

### How do I mark attendance?
1. Sign in as tutor → Tutor Dashboard
2. Find the class session → click **"Mark Attendance"**
3. Set each student to Present / Absent / Late and save
