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
    // Key: studentId + classId
    type ClassStats = { classId: string; className: string; teacherName: string; present: number; late: number; absent: number; };
    const studentMap = new Map<string, { studentId: string; studentName: string; classes: Map<string, ClassStats> }>();

    for (const r of monthRows) {
      const userId  = r['UserID']   || '';
      const classId = r['ClassID']  || '';
      const status  = (r['Status']  || '').toLowerCase();

      const user   = userMap.get(userId);
      if (!user || user.role?.toLowerCase() !== 'student') continue;

      const cls    = classMap.get(classId);
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
          present: 0, late: 0, absent: 0,
        });
      }
      const stats = studentEntry.classes.get(classId)!;
      if (status === 'present') stats.present++;
      else if (status === 'late') stats.late++;
      else if (status === 'absent') stats.absent++;
    }

    // ── Tutor payment summary ────────────────────────────────────────────────
    // Count unique session dates per class as sessions taught
    type TutorClass = { classId: string; className: string; sessionsTaught: number; };
    const tutorMap = new Map<string, { teacherId: string; teacherName: string; classes: Map<string, { className: string; sessions: Set<string> }> }>();

    for (const r of monthRows) {
      const classId     = r['ClassID']    || '';
      const sessionDate = r['SessionDate'] || '';
      const cls         = classMap.get(classId);
      if (!cls) continue;

      const teacherId  = cls['TeacherID'] || '';
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

    // Serialise
    const students = [...studentMap.values()].map(s => {
      const classes = [...s.classes.values()].map(c => ({
        ...c,
        totalSessions: c.present + c.late + c.absent,
        attended: c.present + c.late,
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

    res.json({ month, students, tutors });
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
      rows = rows.filter(r => r['ClassID'] === req.query.classId);
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
// Body: { classId, sessionDate (YYYY-MM-DD), userId, status ('Present'|'Absent'|'Late'), notes, markedBy, sheetId }
router.post('/attendance/mark', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { classId, sessionDate, userId, status, notes, markedBy } = req.body;
  if (!classId || !sessionDate || !userId || !status) {
    res.status(400).json({ error: 'classId, sessionDate, userId, and status are required' }); return;
  }
  if (!['Present', 'Absent'].includes(status)) {
    res.status(400).json({ error: 'status must be Present or Absent' }); return;
  }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const TAB = SHEET_TABS.attendance;
    const HEADERS = SHEET_HEADERS.attendance;

    // Check if a record already exists for this class+date+user — update it if so
    const existing = await readAttendanceRows(sheetId);
    const found = existing.find(
      r => r['ClassID'] === classId && r['SessionDate'] === sessionDate && r['UserID'] === userId
    );
    const now = new Date().toISOString();

    if (found) {
      // Update existing row
      const updatedValues = HEADERS.map(h => {
        if (h === 'Status')    return status;
        if (h === 'Notes')     return notes || found['Notes'] || '';
        if (h === 'MarkedBy')  return markedBy || found['MarkedBy'] || '';
        if (h === 'MarkedAt')  return now;
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
      // Append new row
      const attendanceId = `ATT-${Date.now()}`;
      const rowValues = HEADERS.map(h => {
        if (h === 'AttendanceID') return attendanceId;
        if (h === 'ClassID')      return classId;
        if (h === 'UserID')       return userId;
        if (h === 'SessionDate')  return sessionDate;
        if (h === 'Status')       return status;
        if (h === 'Notes')        return notes || '';
        if (h === 'MarkedBy')     return markedBy || '';
        if (h === 'MarkedAt')     return now;
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

export default router;
