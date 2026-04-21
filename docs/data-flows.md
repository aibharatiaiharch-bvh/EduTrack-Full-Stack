# EduTrack — Data Flows

## 1. Sign-In
```
Browser → GET /api/roles/check?email=X
  → reads Users tab (falls back to DEFAULT_SHEET_ID)
  → returns { role, name, userId, sheetId }
Browser stores in localStorage: edutrack_user_*, edutrack_sheet_id
```

---

## 2. Student / Parent Cancellation
```
Student or Parent clicks Cancel on a class
  → same-day check: sessionDate === today → isLateCancel = true → Within24Hrs = "Yes"
  → else Within24Hrs = "No"

POST /api/enrollments/:id/cancel  { within24hrs }
  → reads Enrollment row → gets SubjectID, StudentID
  → looks up Student Name from Students tab
  → looks up Teacher Name from Subjects tab (Teacher Name column)
  → writes Absent row to Attendance tab:
      AttendanceID, SubjectID, UserID, SessionDate (next class date),
      Status=Absent, Within24Hrs, Student Name, Teacher Name

  → updates Enrollment row Status:
      isLateCancel → "Late Cancellation"
      else         → "Cancelled"
```

---

## 3. Principal Views Cancellations (Attendance Tab)
```
GET /api/attendance/summary?sheetId=X&month=YYYY-MM
  → reads all Attendance rows for month
  → filters Status = "Absent" → cancellationRows
  → for each row:
      studentName  = row["Student Name"]  (direct, no join)
      teacherName  = row["Teacher Name"]  (direct, no join)
      className    = Subjects JOIN on SubjectID → Name
                     fallback: SubjectID itself
  → returns cancellations[] sorted by sessionDate desc

Frontend displays: Student | Class | Teacher | Date | Within 24 hrs (toggle)
```

---

## 4. Principal Toggles Within24Hrs
```
Principal clicks Yes/No button on a cancellation row
  PATCH /api/attendance/:attendanceId/within24hrs  { value: "Yes"|"No" }
  → finds Attendance row by AttendanceID
  → updates Within24Hrs cell in sheet
  → returns updated row
```

---

## 5. Attendance Summary (Analysis)
```
GET /api/attendance/summary?sheetId=X&month=YYYY-MM
  → all Attendance rows for month
  → builds:
      students[]   — per-student session counts, absent counts, cancellation list
      tutors[]     — per-tutor session counts, class breakdown
      cancellations[] — absent rows (see Flow 3)
      cancelCount, within24Yes, within24No
```

---

## 6. Analysis Tab (Monthly Stats)
```
GET /api/analysis?sheetId=X
  → reads Subjects, Enrollments, Attendance tabs
  → by teacher: sessions, unique students, load bar data
  → by month: sessions, attendances, absences, attendance %
  → by weekday: session counts
  → by subject: enrolment counts, session counts
```

---

## 7. Tutor Dashboard
```
GET /api/tutors/dashboard?sheetId=X&tutorId=TCH-XXX
  → reads Subjects where TeacherID = tutorId
  → for each Subject, reads Enrollments (Active)
  → reads Attendance for current week
  → returns classes[], students[], recentAttendance[]

POST /api/attendance/mark  { subjectId, userId, sessionDate, status, notes }
  → writes or updates Attendance row
  → fills Student Name, Teacher Name columns
```

---

## 8. Public Enrolment Form
```
GET /api/subjects?sheetId=X
  → returns all Subjects with Status=Active
  → frontend renders subjectLabel(): "Name — Day — HH:MM AM/PM (Type) — Teacher"

POST /api/enrollments  { studentId, subjectId, … }
  → writes new Enrollment row with Status=Pending
  → principal reviews in Requests tab → approves/rejects
```

---

## 8a. Add Tutor (Principal)
```
Principal → Tutors tab → Add Tutor button → fills name/email/subjects/specialty/zoomLink
POST /api/principals/add-teacher
  → if email matches existing Users row, REUSES UserID
  → else: appends to Users tab (Role=tutor, Status=Active) → new UserID
  → appends to Teachers tab (TeacherID, UserID, Name, Subjects, Zoom Link, Specialty)
  → returns { ok, userId, teacherId }
Frontend shows green success banner with the new TeacherID and a hint to use Reassign next.
```

---

## 8b. Deactivate Tutor — Safety Guard
```
Principal → Users tab → Deactivate (on a tutor row)
POST /api/users/deactivate { userId }
  → reads Users tab → finds user
  → if role === "tutor":
       reads Subjects tab → counts rows where TeacherID = userId
       if count > 0:
         responds 409 { error, code: "TUTOR_HAS_CLASSES", classCount, classes[] }
         (no Sheet writes happen)
  → else continues normal flow:
       appends Archive snapshot → sets Status=Inactive → deletes user's Enrollments
       fires deactivation email
Frontend: if 409, shows amber inline banner with class names and "Reassign first" instruction.
```

---

## 9. Reassign Class Teacher (Principal/Developer)
```
Principal opens Classes tab → clicks Reassign on a row
  → popover opens ABOVE the button (so it stays in view)
  → selects teacher from dropdown ("Name — Specialty")

POST /api/subjects/:row/reassign  { teacherId }
  → looks up teacher in Users tab → gets Name
  → updates Subjects row:
      TeacherID    = new teacherId
      Teacher Name = new teacher's name
  → returns updated row

Frontend reloads Subjects → Classes/Tutors/Calendar reflect new teacher.
Past Attendance rows are NOT modified (Teacher Name is a snapshot at write time).
```

---

## 10. Backfill Names (Admin Utility)
```
POST /api/admin/backfill-names  { sheetId }
  → reads Students, Subjects (Teacher Name col), Attendance tabs
  → for each Attendance row with blank Student Name:
      looks up UserID → Users tab → name → writes cell
  → for each Attendance row with blank Teacher Name:
      looks up SubjectID → Subjects tab → Teacher Name → writes cell
  → returns { filled: N }
```

---

## Sheet Read/Write Pattern
All data access goes through `readTabRows(sheetId, tabName)` and `writeTabRow / updateTabRow`.  
`readTabRows` maps sheet row 1 headers to object keys — **any schema change must update both `SHEET_HEADERS` in code and the physical header row in the sheet.**
