# EduTrack — Tutor & Coaching Management Platform

## Overview
EduTrack is a comprehensive multi-role management platform designed for tutoring and coaching businesses. Its primary purpose is to streamline operations by handling student enrolments, tutor scheduling, attendance tracking, and managing late cancellations. The platform provides distinct portals for developers, principals, tutors, and students, ensuring tailored functionalities for each role. A key feature is its real-time data synchronization with Google Sheets, which serves as the backend database. This integration simplifies data management and provides a familiar interface for business owners. The project aims to provide a robust, scalable, and user-friendly system that automates administrative tasks, improves communication, and enhances the overall efficiency of a tutoring business.

## User Preferences
I prefer iterative development with a focus on clear, modular code. Please ensure that proposed changes are well-explained, especially concerning architectural decisions or significant feature implementations. I appreciate detailed explanations during our interactions. When making changes to the codebase, please ask for confirmation before implementing major alterations or new features. I value a collaborative approach where I am kept informed and have the opportunity to provide feedback throughout the development process.

## System Architecture
EduTrack utilizes a modern web application architecture built as a monorepo using `pnpm workspaces`.

**Frontend:**
- Developed with React and Vite, located in `artifacts/edutrack/`.
- UI/UX features distinct portals for Developer, Principal, Tutor, and Student roles, along with a public enrolment form.
- Portals auto-refresh data every 30 seconds to ensure real-time information display.
- Announcement banners are displayed based on priority (urgent banners are persistent, standard banners are dismissible).

**Backend API:**
- Implemented using Express 5 on Node.js 24, located in `artifacts/api-server/`.
- Handles all business logic, data interactions, and authentication.

**Data Store:**
- Google Sheets serves as the primary database, integrated via Replit's Google Sheets integration.
- The schema is defined and managed within `artifacts/api-server/src/lib/googleSheets.ts`, covering Users, Students, Teachers, Subjects, Enrollments, Attendance, Parents, Announcements, and Archive tabs.
- UserIDs are role-prefixed and sequential (e.g., `STU-001`, `TCH-001`).
- Enrolment Status values include `Active`, `Cancelled`, `Late Cancellation`, `Fee Waived`, `Fee Confirmed`, `Pending`.
- Attendance Status values include `Present`, `Absent`, `Late`.

**Authentication & Authorization:**
- Email-only login system; no passwords or Clerk UI.
- User role is determined via `GET /api/roles/check?email=` and stored in `localStorage` for routing.
- Special bypasses for `developer` and `principal` roles are configured via environment variables (`DEVELOPER_EMAIL`, `PRINCIPAL_EMAIL`).

**Deployment:**
- Frontend is deployed on Netlify, connected to the GitHub `main` branch.
- API is deployed on Railway, also connected to the GitHub `main` branch.
- A `github-push.sh` script automatically pushes changes from Replit to GitHub every 5 minutes, enabling continuous deployment.

**Key Features:**
- **Developer Portal (`/admin`):** Provides API health, sheet linking, GitHub sync status, data browser for any sheet tab, dev tools for sheet creation/seeding/validation, and mass CSV student upload.
- **Principal Dashboard (`/principal`):** Manages enrolment requests, students, tutors, users, classes, late cancellations, and mass student uploads.
- **Tutor Dashboard (`/dashboard`):** Allows tutors to view assigned classes, student lists, and mark attendance.
- **Student Portal (`/student`):** Enables students to view schedules and cancel classes (with a 24-hour rule).
- **Public Enrolment Form (`/enroll`):** Allows new students/families or tutors/staff to apply, creating `Pending` entries in the Enrollments tab.

**Technical Implementations:**
- **Auto-Refresh:** Key dashboards (Principal, Tutor) automatically poll for new data every 30 seconds using `useAutoRefresh.ts`.
- **Daily Email Backup:** Automatically sends all Google Sheet tabs as CSV attachments to the principal daily, configurable via cron.
- **GitHub Auto-Push:** Script `scripts/github-push.sh` handles automatic syncing to GitHub, including rebase logic and failure alerts.
- **Announcements:** System for displaying urgent or standard announcements across the platform.

## External Dependencies
- **Google Sheets:** Primary data storage. Requires `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` for API access.
- **Netlify:** Hosts the frontend application.
- **Railway:** Hosts the backend API.
- **Clerk:** Used for infrastructure, not direct UI authentication, requiring `VITE_CLERK_PUBLISHABLE_KEY`.
- **Nodemailer:** Used for sending emails (daily backups, GitHub sync alerts), configured via SMTP environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
- **node-cron:** Used for scheduling daily email backups.