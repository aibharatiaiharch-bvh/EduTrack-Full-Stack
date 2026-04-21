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

// GET /api/attendance/summary?sheetId=X&month=YYYY-MM
// Returns per-student and per-tutor monthly attendance totals.
router.get('/attendance/summary', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // YYYY-MM

  try {
    const [rows, users, subjects] = await Promise.all([
      readAttendanceRows(sheetId),
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.subjects),
    ]);

    const userMap = new Map(users.map(u => [u.userId, u]));
    const classMap = new Map(subjects.map(s => [s['SubjectID'], s]));

    // Filter to the requested month
    const monthRows = rows.filter(r => (r['SessionDate'] || '').startsWith(month));

    // ── Student billing summary ──────────────────────────────────────────────
    type ClassStats = { classId: string; className: string; teacherName: string; present: number; absent: number; };
    const studentMap = new Map<string, { studentId: string; studentName: string; classes: Map<string, ClassStats> }>();

    for (const r of monthRows) {
      const userId  = r['UserID']  || '';
      const classId = r['SubjectID'] || '';
      const status  = (r['Status'] || '').toLowerCase();

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
          className:   cls?.['Name'] || classId,
          teacherName: teacherUser?.name || cls?.['TeacherID'] || '—',
          present: 0, absent: 0,
        });
      }
      const stats = studentEntry.classes.get(classId)!;
      if (status === 'present') stats.present++;
      else if (status === 'absent') stats.absent++;
    }

    // ── Tutor payment summary ────────────────────────────────────────────────
    type TutorClass = { classId: string; className: string; sessionsTaught: number; };
    const tutorMap = new Map<string, { teacherId: string; teacherName: string; classes: Map<string, { className: string; sessions: Set<string> }> }>();

    for (const r of monthRows) {
      const classId     = r['SubjectID']    || '';
      const sessionDate = r['SessionDate'] || '';
      const cls         = classMap.get(classId);
      if (!cls) continue;

      const teacherId   = cls['TeacherID'] || '';
      const teacherUser = userMap.get(teacherId);

      if (!tutorMap.has(teacherId)) {
        tutorMap.set(teacherId, {
          teacherId,
          teacherName: teacherUser?.name || teacherId || '—',
          classes: new Map(),
        });
      }
      const tutorEntry = tutorMap.get(teacherId)!;
      if (!tutorEntry.classes.has(classId)) {
        tutorEntry.classes.set(classId, { className: cls['Name'] || classId, sessions: new Set() });
      }
      tutorEntry.classes.get(classId)!.sessions.add(sessionDate);
    }

    // ── Cancellations (absent rows) for principal view ───────────────────────
    const cancellationRows = monthRows.filter(r => (r['Status'] || '').toLowerCase() === 'absent');
    const cancellations = cancellationRows.map(r => {
      const user = userMap.get(r['UserID'] || '');
      const cls  = classMap.get(r['SubjectID'] || '');
      return {
        attendanceId: r['AttendanceID'] || '',
        classId:      r['SubjectID']    || '',
        userId:       r['UserID']       || '',
        sessionDate:  r['SessionDate']  || '',
        within24Hrs:  r['Within24Hrs']  || 'Yes',
        notes:        r['Notes']        || '',
        studentName:  user?.name        || r['UserID'] || '',
        className:    cls?.['Name']     || r['SubjectID'] || '',
      };
    }).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

    const cancelCount   = cancellations.length;
    const within24Yes   = cancellations.filter(c => c.within24Hrs.toLowerCase() !== 'no').length;
    const within24No    = cancellations.filter(c => c.within24Hrs.toLowerCase() === 'no').length;

    // Serialise
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

    res.json({ month, students, tutors, cancellations, cancelCount, within24Yes, within24No });
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

    if (req.query.classId) {
      rows = rows.filter(r => r['SubjectID'] === req.query.classId);
    }
    if (req.query.sessionDate) {
      rows = rows.filter(r => r['SessionDate'] === req.query.sessionDate);
    }
    if (req.query.userId) {
      rows = rows.filter(r => r['UserID'] === req.query.userId);
    }

    // Enrich with student names
    const users = await readUsersTab(sheetId);
    const userMap = new Map(users.map(u => [u.userId, u]));
    const enriched = rows.map(r => ({
      ...r,
      'Student Name': userMap.get(r['UserID'])?.name || r['UserID'] || '',
      'Student Email': userMap.get(r['UserID'])?.email || '',
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/mark
// Body: { classId, sessionDate (YYYY-MM-DD), userId, status ('Present'|'Absent'), notes, markedBy, within24Hrs, sheetId }
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

  // Within24Hrs only applies to Absent rows; default to 'Yes' for absences
  const within24HrsValue = status === 'Absent' ? (within24Hrs || 'Yes') : '';

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const TAB = SHEET_TABS.attendance;
    const HEADERS = SHEET_HEADERS.attendance;

    // Resolve student name and teacher name upfront
    const [users, subjectRows, existing] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.subjects),
      readAttendanceRows(sheetId),
    ]);
    const userMap = new Map(users.map(u => [u.userId, u]));
    const subject = subjectRows.find(s => s['SubjectID'] === classId);
    const studentName = userMap.get(userId)?.name || '';
    const teacherId   = subject?.['TeacherID'] || '';
    // Prefer stored Teacher Name column; fall back to Users tab lookup
    const teacherName = subject?.['Teacher Name'] || userMap.get(teacherId)?.name || '';

    const found = existing.find(
      r => r['SubjectID'] === classId && r['SessionDate'] === sessionDate && r['UserID'] === userId
    );
    const now = new Date().toISOString();

    if (found) {
      const updatedValues = HEADERS.map(h => {
        if (h === 'Status')        return status;
        if (h === 'Notes')         return notes || found['Notes'] || '';
        if (h === 'MarkedBy')      return markedBy || found['MarkedBy'] || '';
        if (h === 'MarkedAt')      return now;
        if (h === 'Within24Hrs')   return within24HrsValue;
        if (h === 'Student Name')  return studentName || found['Student Name'] || '';
        if (h === 'Teacher Name')  return teacherName || found['Teacher Name'] || '';
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
        if (h === 'AttendanceID')  return attendanceId;
        if (h === 'SubjectID')     return classId;
        if (h === 'UserID')        return userId;
        if (h === 'SessionDate')   return sessionDate;
        if (h === 'Status')        return status;
        if (h === 'Notes')         return notes || '';
        if (h === 'MarkedBy')      return markedBy || '';
        if (h === 'MarkedAt')      return now;
        if (h === 'Within24Hrs')   return within24HrsValue;
        if (h === 'Student Name')  return studentName;
        if (h === 'Teacher Name')  return teacherName;
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
// Body: { attendanceId, within24Hrs ('Yes'|'No'), sheetId }
// Principal toggles whether a cancellation was within 24 hours.
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
    const rows = await readAttendanceRows(sheetId);
    const found = rows.find(r => r['AttendanceID'] === attendanceId);
    if (!found) { res.status(404).json({ error: 'Attendance record not found' }); return; }

    const HEADERS = SHEET_HEADERS.attendance;
    const colIdx = HEADERS.indexOf('Within24Hrs');
    const colLetter = String.fromCharCode(65 + colIdx);
    const sheets = await getUncachableGoogleSheetClient();
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

export default router;
