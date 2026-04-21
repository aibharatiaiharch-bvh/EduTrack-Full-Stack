# EduTrack — FAQ

## General

**Q: Where is data stored?**  
Google Sheets. Sheet ID is stored per user in the Users tab (`SheetID` column). The API reads `DEFAULT_SHEET_ID` from env as the fallback at sign-in time.

**Q: How do I link a new school to a different Sheet?**  
Add a row to the Users tab with the correct `SheetID` for that user. Alternatively, set `DEFAULT_SHEET_ID` for the default school.

**Q: What roles exist?**  
Developer, Principal, Tutor, Parent, Student. Role is set in the Users tab. `DEVELOPER_EMAIL` and `PRINCIPAL_EMAIL` env vars grant roles without a Users row.

---

## Attendance & Cancellations

**Q: How does the late-fee rule work?**  
If a student cancels on the same calendar day as the class → `Within24Hrs = Yes` (late fee applies).  
If they cancel on any earlier day → `Within24Hrs = No` (no fee).

**Q: Can the principal override the Within24Hrs flag?**  
Yes. The Cancellations table in the Attendance tab shows a Yes/No toggle button for each row. Clicking it immediately updates the sheet.

**Q: Why does the cancellation show the class name correctly now?**  
Student Name and Teacher Name are written directly into the Attendance row at the time of cancellation — no join is needed at display time. Class name is resolved via a Subjects lookup with the SubjectID as a fallback so it never shows blank.

**Q: Who marks attendance?**  
Tutors can optionally mark via the Tutor Dashboard. Billing is driven by scheduled weekdays (not by tutor marks), so marking is supplementary.

**Q: How is billing calculated?**  
Count the scheduled weekday occurrences in the billing month per Subject. E.g. 4 Mondays = 4 sessions billed, regardless of attendance status.

---

## Subjects & SubjectIDs

**Q: What is a SubjectID?**  
A unique identifier per (class, day) combination, e.g. `SUB-MAT-MON` = Mathematics on Mondays.  
Format: `SUB-<3-letter class code>-<3-letter day code>`.

**Q: Why one row per day in the Subjects tab?**  
Each (Class, Day) slot has its own capacity, teacher, and schedule. This allows accurate seat-count tracking per weekday and colour-coded calendar views.

**Q: Why does the class dropdown show "English — Tue — 11:00 AM (Group)"?**  
Two English rows (e.g. Tuesday and Thursday) would otherwise look identical. The `subjectLabel()` helper appends day + time + type so users pick the right slot.

---

## Schema / Migrations

**Q: How do I add a new column to a tab?**  
1. Add the column name to `SHEET_HEADERS[tabName]` in `googleSheets.ts`.  
2. Manually add the header cell in the physical sheet (row 1 of the tab).  
3. Use the `/api/admin/migrate-columns` endpoint if you need to bulk-update existing rows.

**Q: What is `readTabRows`?**  
The core utility that maps sheet row 1 (the headers) to object keys. Every sheet read goes through it. If the code header and the sheet header don't match, fields come back undefined.

**Q: What does backfill-names do?**  
`POST /api/admin/backfill-names` fills any blank `Student Name` and `Teacher Name` cells in the Attendance tab by looking up the UserID → Users tab and SubjectID → Subjects tab respectively.

---

## Developer Tools

**Q: How do I seed test attendance data?**  
```
node artifacts/api-server/scripts/seed-attendance.mjs
```
Requires `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` env vars.

**Q: The API port 8080 is already in use after a restart — how do I fix it?**  
```
fuser -k 8080/tcp
```
Then restart the API Server workflow.

**Q: How do I trigger a GitHub sync?**  
Run (or start) the "GitHub Auto-Push" workflow. It executes `scripts/github-push.sh`. It is optional and not required for deployment.

---

## Deployment

**Q: How is the app deployed?**  
Via Replit's Publish button. Both the frontend and API server run on Replit. No external hosting is used.

**Q: Can this be sold to multiple schools?**  
Yes — each school gets its own Google Sheet. The `SheetID` stored per user drives all data isolation. Thresholds (fill-rate targets, attendance benchmarks) will be configurable via the Settings tab (Assumptions tab — planned).
