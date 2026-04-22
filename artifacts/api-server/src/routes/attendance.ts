import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS,
  readTabRows, readUsersTab,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
}

async function readAttendanceRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, SHEET_TABS.attendance);
}

// Parse "Mon", "Monday", "Tue", "Tuesday", … → JS day number (0=Sun)
function parseWeekday(days: string): number | null {
  const d = (days || '').trim().toLowerCase().slice(0, 3);
  const map: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  return d in map ? map[d] : null;
}

// Return all past dates (YYYY-MM-DD) in `month` that fall on `weekdayNum`
function getSessionDatesInMonth(month: string, weekdayNum: number): string[] {
  const [year, mon] = month.split('-').map(Number);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const dates: string[] = [];
  const d = new Date(year, mon - 1, 1);
  while (d.getMonth() === mon - 1) {
    if (d.getDay() === weekdayNum && d <= today) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// GET /api/attendance/summary?sheetId=X&month=YYYY-MM
router.get('/attendance/summary', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

  try {
    const [initialRows, users, subjects, enrollments] = await Promise.all([
      readAttendanceRows(sheetId),
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.subjects),
      readTabRows(sheetId, SHEET_TABS.enrollments),
    ]);

    const userMap   = new Map(users.map(u => [u.userId, u]));
    const classMap  = new Map(subjects.map(s => [s['SubjectID'], s]));

    // ── Auto-generate per-student "Present" attendance rows ──────────────────
    // For each active enrollment + each past session date in the month, ensure
    // a Present row exists. Tutors can later toggle to Absent via the UI.
    const HEADERS_AT = SHEET_HEADERS.attendance;
    const TAB_AT     = SHEET_TABS.attendance;

    const existingStudentKeys = new Set(
      initialRows
        .filter(r => {
          const u = userMap.get(r['UserID'] || '');
          return u?.role?.toLowerCase() === 'student';
        })
        .map(r => `${r['SubjectID']}|${r['UserID']}|${r['SessionDate']}`)
    );

    const newStudentRows: string[][] = [];
    for (const enr of enrollments) {
      const status = (enr['Status'] || '').toLowerCase();
      if (status !== 'active' && status !== 'approved') continue;
      const subjectId = enr['ClassID'] || '';
      const userId    = enr['UserID']  || '';
      if (!subjectId || !userId) continue;

      const subj = classMap.get(subjectId);
      if (!subj) continue;
      const weekdayNum = parseWeekday(subj['Days'] || '');
      if (weekdayNum === null) continue;

      const enrolledAt = enr['EnrolledAt'] || '';
      const sessionDates = getSessionDatesInMonth(month, weekdayNum)
        .filter(d => !enrolledAt || d >= enrolledAt.slice(0, 10));

      for (const sessionDate of sessionDates) {
        const key = `${subjectId}|${userId}|${sessionDate}`;
        if (existingStudentKeys.has(key)) continue;

        const studentName = enr['Student Name'] || userMap.get(userId)?.name || '';
        const teacherId   = subj['TeacherID']   || '';
        const teacherName = subj['Teacher Name'] || userMap.get(teacherId)?.name || '';
        const attendanceId = `ATT-STU-${userId}-${subjectId}-${sessionDate.replace(/-/g, '')}`;
        const now = new Date().toISOString();

        const rowValues = HEADERS_AT.map(h => {
          if (h === 'AttendanceID') return attendanceId;
          if (h === 'SubjectID')    return subjectId;
          if (h === 'UserID')       return userId;
          if (h === 'SessionDate')  return sessionDate;
          if (h === 'Status')       return 'Present';
          if (h === 'MarkedBy')     return 'system';
          if (h === 'MarkedAt')     return now;
          if (h === 'Student Name') return studentName;
          if (h === 'Teacher Name') return teacherName;
          return '';
        });
        newStudentRows.push(rowValues);
        existingStudentKeys.add(key);
      }
    }

    if (newStudentRows.length > 0) {
      const sheets = await getUncachableGoogleSheetClient();
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${TAB_AT}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newStudentRows },
      });
    }

    const rows = newStudentRows.length > 0
      ? await readAttendanceRows(sheetId)
      : initialRows;
    const monthRows = rows.filter(r => (r['SessionDate'] || '').startsWith(month));

    // ── Student billing summary ──────────────────────────────────────────────
    type ClassStats = { classId: string; className: string; teacherName: string; present: number; absent: number; };
    const studentMap = new Map<string, { studentId: string; studentName: string; classes: Map<string, ClassStats> }>();

    for (const r of monthRows) {
      const userId  = r['UserID']    || '';
      const classId = r['SubjectID'] || '';
      const status  = (r['Status']  || '').toLowerCase();

      const user = userMap.get(userId);
      if (!user || user.role?.toLowerCase() !== 'student') continue;

      const cls         = classMap.get(classId);
      const teacherUser = cls ? userMap.get(cls['TeacherID']) : undefined;

      if (!studentMap.has(userId)) {
        studentMap.set(userId, { studentId: userId, studentName: user.name || userId, classes: new Map() });
      }
      const studentEntry = studentMap.get(userId)!;
      if (!studentEntry.classes.has(classId)) {
        studentEntry.classes.set(classId, {
          classId,
          className:   cls?.['Name']       || classId,
          teacherName: teacherUser?.name   || cls?.['TeacherID'] || '—',
          present: 0, absent: 0,
        });
      }
      const stats = studentEntry.classes.get(classId)!;
      if (status === 'present') stats.present++;
      else if (status === 'absent') stats.absent++;
    }

    // ── Tutor payment summary (from student rows) ────────────────────────────
    type TutorClass = { classId: string; className: string; sessionsTaught: number; };
    const tutorMap = new Map<string, { teacherId: string; teacherName: string; classes: Map<string, { className: string; sessions: Set<string> }> }>();

    for (const r of monthRows) {
      const classId     = r['SubjectID']   || '';
      const sessionDate = r['SessionDate'] || '';
      const cls         = classMap.get(classId);
      if (!cls) continue;

      const teacherId   = cls['TeacherID'] || '';
      const teacherUser = userMap.get(teacherId);

      if (!tutorMap.has(teacherId)) {
        tutorMap.set(teacherId, { teacherId, teacherName: teacherUser?.name || teacherId || '—', classes: new Map() });
      }
      const tutorEntry = tutorMap.get(teacherId)!;
      if (!tutorEntry.classes.has(classId)) {
        tutorEntry.classes.set(classId, { className: cls['Name'] || classId, sessions: new Set() });
      }
      tutorEntry.classes.get(classId)!.sessions.add(sessionDate);
    }

    // ── Cancellations ────────────────────────────────────────────────────────
    const cancellationRows = monthRows.filter(r => (r['Status'] || '').toLowerCase() === 'absent');
    const cancellations = cancellationRows
      .filter(r => {
        const u = userMap.get(r['UserID'] || '');
        return !u || u.role?.toLowerCase() === 'student'; // student absences only
      })
      .map(r => {
        const subjectId   = r['SubjectID']    || '';
        const cls         = classMap.get(subjectId);
        const studentName = r['Student Name'] || userMap.get(r['UserID'] || '')?.name || r['UserID'] || '';
        const teacherName = r['Teacher Name'] || '';
        const className   = cls?.['Name']     || subjectId;
        return {
          attendanceId: r['AttendanceID'] || '',
          classId:      subjectId,
          userId:       r['UserID']       || '',
          sessionDate:  r['SessionDate']  || '',
          within24Hrs:  r['Within24Hrs']  || 'Yes',
          notes:        r['Notes']        || '',
          studentName,
          teacherName,
          className,
        };
      }).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

    const cancelCount  = cancellations.length;
    const within24Yes  = cancellations.filter(c => c.within24Hrs.toLowerCase() !== 'no').length;
    const within24No   = cancellations.filter(c => c.within24Hrs.toLowerCase() === 'no').length;

    // ── Tutor attendance: auto-generate rows for past session dates ───────────
    // Key: `${subjectId}|${teacherId}|${sessionDate}`
    const existingTutorKeys = new Set(
      rows
        .filter(r => {
          const u = userMap.get(r['UserID'] || '');
          return u?.role?.toLowerCase() === 'teacher' || u?.role?.toLowerCase() === 'tutor';
        })
        .map(r => `${r['SubjectID']}|${r['UserID']}|${r['SessionDate']}`)
    );

    const HEADERS = SHEET_HEADERS.attendance;
    const TAB     = SHEET_TABS.attendance;
    const newTutorRows: string[][] = [];
    const newTutorMeta: { subjectId: string; teacherId: string; sessionDate: string; attendanceId: string }[] = [];

    for (const s of subjects) {
      const subjectId = s['SubjectID'] || '';
      const teacherId = s['TeacherID'] || '';
      if (!subjectId || !teacherId) continue;
      const weekdayNum = parseWeekday(s['Days'] || '');
      if (weekdayNum === null) continue;
      const sessionDates = getSessionDatesInMonth(month, weekdayNum);

      for (const sessionDate of sessionDates) {
        const key = `${subjectId}|${teacherId}|${sessionDate}`;
        if (existingTutorKeys.has(key)) continue;

        const teacherUser = userMap.get(teacherId);
        const teacherName = s['Teacher Name'] || teacherUser?.name || '';
        const attendanceId = `ATT-TCH-${teacherId}-${subjectId}-${sessionDate.replace(/-/g, '')}`;
        const now = new Date().toISOString();

        const rowValues = HEADERS.map(h => {
          if (h === 'AttendanceID') return attendanceId;
          if (h === 'SubjectID')    return subjectId;
          if (h === 'UserID')       return teacherId;
          if (h === 'SessionDate')  return sessionDate;
          if (h === 'Status')       return 'Present';
          if (h === 'MarkedBy')     return 'system';
          if (h === 'MarkedAt')     return now;
          if (h === 'Teacher Name') return teacherName;
          return '';
        });

        newTutorRows.push(rowValues);
        newTutorMeta.push({ subjectId, teacherId, sessionDate, attendanceId });
        existingTutorKeys.add(key); // prevent duplicates within same request
      }
    }

    // Batch-write new tutor rows
    if (newTutorRows.length > 0) {
      const sheets = await getUncachableGoogleSheetClient();
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newTutorRows },
      });
    }

    // Re-read attendance (includes newly written rows) for tutor attendance list
    const allRows = newTutorRows.length > 0
      ? await readAttendanceRows(sheetId)
      : rows;

    const tutorAttendance = allRows
      .filter(r => {
        if (!(r['SessionDate'] || '').startsWith(month)) return false;
        const u = userMap.get(r['UserID'] || '');
        return u?.role?.toLowerCase() === 'teacher' || u?.role?.toLowerCase() === 'tutor';
      })
      .map(r => {
        const cls = classMap.get(r['SubjectID'] || '');
        return {
          attendanceId: r['AttendanceID'] || '',
          subjectId:    r['SubjectID']    || '',
          className:    cls?.['Name']     || r['SubjectID'] || '',
          teacherId:    r['UserID']       || '',
          teacherName:  r['Teacher Name'] || userMap.get(r['UserID'] || '')?.name || r['UserID'] || '',
          sessionDate:  r['SessionDate']  || '',
          status:       r['Status']       || 'Present',
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName) || a.sessionDate.localeCompare(b.sessionDate));

    // Serialise student + tutor payment summaries
    const students = [...studentMap.values()].map(s => {
      const classes = [...s.classes.values()].map(c => ({
        ...c,
        totalSessions: c.present + c.absent,
        attended: c.present,
      }));
      return { ...s, classes, totalAttended: classes.reduce((n, c) => n + c.attended, 0) };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName));

    const tutors = [...tutorMap.values()].map(t => {
      const classes: TutorClass[] = [...t.classes.entries()].map(([classId, v]) => ({
        classId,
        className: v.className,
        sessionsTaught: v.sessions.size,
      }));
      return { ...t, classes, totalSessions: classes.reduce((n, c) => n + c.sessionsTaught, 0) };
    }).sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    const studentAttendance = allRows
      .filter(r => {
        if (!(r['SessionDate'] || '').startsWith(month)) return false;
        const u = userMap.get(r['UserID'] || '');
        return u?.role?.toLowerCase() === 'student';
      })
      .map(r => {
        const cls = classMap.get(r['SubjectID'] || '');
        const teacherUser = cls ? userMap.get(cls['TeacherID']) : undefined;
        return {
          attendanceId: r['AttendanceID'] || '',
          subjectId:    r['SubjectID']    || '',
          className:    cls?.['Name']     || r['SubjectID'] || '',
          userId:       r['UserID']       || '',
          studentName:  r['Student Name'] || userMap.get(r['UserID'] || '')?.name || r['UserID'] || '',
          teacherName:  r['Teacher Name'] || teacherUser?.name || cls?.['TeacherID'] || '',
          sessionDate:  r['SessionDate']  || '',
          status:       r['Status']       || 'Present',
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.sessionDate.localeCompare(b.sessionDate));

    res.json({ month, students, tutors, cancellations, cancelCount, within24Yes, within24No, tutorAttendance, studentAttendance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance?classId=&sessionDate=&userId=&sheetId=
router.get('/attendance', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let rows = await readAttendanceRows(sheetId);
    if (req.query.classId)     rows = rows.filter(r => r['SubjectID']   === req.query.classId);
    if (req.query.sessionDate) rows = rows.filter(r => r['SessionDate'] === req.query.sessionDate);
    if (req.query.userId)      rows = rows.filter(r => r['UserID']      === req.query.userId);

    const users   = await readUsersTab(sheetId);
    const userMap = new Map(users.map(u => [u.userId, u]));
    const enriched = rows.map(r => ({
      ...r,
      'Student Name':  userMap.get(r['UserID'])?.name  || r['UserID'] || '',
      'Student Email': userMap.get(r['UserID'])?.email || '',
    }));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/mark
router.post('/attendance/mark', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { classId, sessionDate, userId, status, notes, markedBy, within24Hrs } = req.body;
  if (!classId || !sessionDate || !userId || !status) {
    res.status(400).json({ error: 'classId, sessionDate, userId, and status are required' }); return;
  }
  if (!['Present', 'Absent'].includes(status)) {
    res.status(400).json({ error: 'status must be Present or Absent' }); return;
  }

  const within24HrsValue = status === 'Absent' ? (within24Hrs || 'Yes') : '';

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const TAB     = SHEET_TABS.attendance;
    const HEADERS = SHEET_HEADERS.attendance;

    const [users, subjectRows, existing] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.subjects),
      readAttendanceRows(sheetId),
    ]);
    const userMap     = new Map(users.map(u => [u.userId, u]));
    const subject     = subjectRows.find(s => s['SubjectID'] === classId);
    const studentName = userMap.get(userId)?.name || '';
    const teacherId   = subject?.['TeacherID'] || '';
    const teacherName = subject?.['Teacher Name'] || userMap.get(teacherId)?.name || '';

    const found = existing.find(
      r => r['SubjectID'] === classId && r['SessionDate'] === sessionDate && r['UserID'] === userId
    );
    const now = new Date().toISOString();

    if (found) {
      const updatedValues = HEADERS.map(h => {
        if (h === 'Status')       return status;
        if (h === 'Notes')        return notes || found['Notes'] || '';
        if (h === 'MarkedBy')     return markedBy || found['MarkedBy'] || '';
        if (h === 'MarkedAt')     return now;
        if (h === 'Within24Hrs')  return within24HrsValue;
        if (h === 'Student Name') return studentName || found['Student Name'] || '';
        if (h === 'Teacher Name') return teacherName || found['Teacher Name'] || '';
        return found[h] || '';
      });
      const colEnd = String.fromCharCode(64 + HEADERS.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${TAB}!A${found._row}:${colEnd}${found._row}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updatedValues] },
      });
      res.json({ ok: true, updated: true, row: found._row });
    } else {
      const attendanceId = `ATT-${Date.now()}`;
      const rowValues = HEADERS.map(h => {
        if (h === 'AttendanceID') return attendanceId;
        if (h === 'SubjectID')    return classId;
        if (h === 'UserID')       return userId;
        if (h === 'SessionDate')  return sessionDate;
        if (h === 'Status')       return status;
        if (h === 'Notes')        return notes || '';
        if (h === 'MarkedBy')     return markedBy || '';
        if (h === 'MarkedAt')     return now;
        if (h === 'Within24Hrs')  return within24HrsValue;
        if (h === 'Student Name') return studentName;
        if (h === 'Teacher Name') return teacherName;
        return '';
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      res.json({ ok: true, updated: false, attendanceId });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/attendance/within24hrs
router.patch('/attendance/within24hrs', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { attendanceId, within24Hrs } = req.body;
  if (!attendanceId || !within24Hrs) {
    res.status(400).json({ error: 'attendanceId and within24Hrs are required' }); return;
  }
  if (!['Yes', 'No'].includes(within24Hrs)) {
    res.status(400).json({ error: 'within24Hrs must be Yes or No' }); return;
  }

  try {
    const rows  = await readAttendanceRows(sheetId);
    const found = rows.find(r => r['AttendanceID'] === attendanceId);
    if (!found) { res.status(404).json({ error: 'Attendance record not found' }); return; }

    const HEADERS   = SHEET_HEADERS.attendance;
    const colIdx    = HEADERS.indexOf('Within24Hrs');
    const colLetter = String.fromCharCode(65 + colIdx);
    const sheets    = await getUncachableGoogleSheetClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_TABS.attendance}!${colLetter}${found._row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[within24Hrs]] },
    });
    res.json({ ok: true, within24Hrs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/attendance/tutor-status  (also: /attendance/student-status)
// Body: { attendanceId, status ('Present'|'Absent'), sheetId }
// Marks a session row's status by AttendanceID. No 24-hr rule.
const setStatusHandler = async (req: any, res: any): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { attendanceId, status } = req.body;
  if (!attendanceId || !status) {
    res.status(400).json({ error: 'attendanceId and status are required' }); return;
  }
  if (!['Present', 'Absent'].includes(status)) {
    res.status(400).json({ error: 'status must be Present or Absent' }); return;
  }

  try {
    const rows  = await readAttendanceRows(sheetId);
    const found = rows.find(r => r['AttendanceID'] === attendanceId);
    if (!found) { res.status(404).json({ error: 'Attendance record not found' }); return; }

    const HEADERS   = SHEET_HEADERS.attendance;
    const colIdx    = HEADERS.indexOf('Status');
    const colLetter = String.fromCharCode(65 + colIdx);
    const sheets    = await getUncachableGoogleSheetClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_TABS.attendance}!${colLetter}${found._row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status]] },
    });
    res.json({ ok: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.patch('/attendance/tutor-status', setStatusHandler);
router.patch('/attendance/student-status', setStatusHandler);

export default router;
