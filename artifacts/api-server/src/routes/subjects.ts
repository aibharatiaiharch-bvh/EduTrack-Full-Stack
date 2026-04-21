import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS,
  readTabRows, readUsersTab,
} from '../lib/googleSheets.js';

const router: IRouter = Router();
const TAB     = SHEET_TABS.subjects;
const HEADERS = SHEET_HEADERS.subjects;

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || req.headers['x-sheet-id'] || process.env.DEFAULT_SHEET_ID || '';
}

async function readSubjectRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, TAB);
}

async function generateSubjectId(spreadsheetId: string): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();
  let max = 0;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A2:A` });
    (res.data.values || []).forEach((row: any[]) => {
      if (row[0] && String(row[0]).startsWith('SUB-')) {
        const num = parseInt(String(row[0]).slice(4), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  } catch {}
  return `SUB-${String(max + 1).padStart(3, '0')}`;
}

// GET /api/subjects/with-capacity?sheetId= — subjects with live enrollment counts
// Must be before /subjects to avoid route conflicts
router.get('/subjects/with-capacity', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let subjects = await readSubjectRows(spreadsheetId);
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      subjects = subjects.filter(s => statuses.includes((s['Status'] || '').toLowerCase()));
    }

    // Read enrollments to count active seats per class (using ClassID FK)
    let enrollmentRows: any[] = [];
    try {
      enrollmentRows = await readTabRows(spreadsheetId, SHEET_TABS.enrollments);
      const INACTIVE = ['inactive','cancelled','canceled','rejected','late cancellation'];
      enrollmentRows = enrollmentRows.filter(r => !INACTIVE.includes((r['Status'] || '').toLowerCase()));
    } catch {}

    // Join Teachers extension + Users for display name
    let users: any[] = [];
    let teacherRows: any[] = [];
    try {
      [users, teacherRows] = await Promise.all([
        readUsersTab(spreadsheetId),
        readTabRows(spreadsheetId, SHEET_TABS.teachers),
      ]);
    } catch {}
    const userMap = new Map(users.map(u => [u.userId, u]));

    const withCapacity = subjects.map(s => {
      const isGroup   = String(s['Type'] || '').toLowerCase() === 'group';
      const defaultCap = isGroup ? 8 : 999;
      const maxCap    = parseInt(s['MaxCapacity'] || String(defaultCap), 10) || defaultCap;
      const classId   = s['SubjectID'] || '';
      const classEnrollments = enrollmentRows.filter(e => e['ClassID'] === classId);
      const enrolled  = classEnrollments.length;

      // Resolve teacher display name from TeacherID → Users tab
      const teacherId = s['TeacherID'] || '';
      const teacher   = userMap.get(teacherId);
      const teacherName = teacher?.name || teacherId;

      // Build comma-separated list of enrolled student first names
      const enrolledNames = classEnrollments
        .map(e => {
          const u = userMap.get(e['UserID'] || '');
          const fullName = u?.name || e['StudentName'] || '';
          return fullName.trim().split(/\s+/)[0] || '';
        })
        .filter(Boolean)
        .join(', ');

      return {
        ...s,
        Teachers:        teacherName,
        TeacherName:     teacherName,
        MaxCapacity:     maxCap,
        currentEnrolled: enrolled,
        isFull:          enrolled >= maxCap,
        enrolledNames,
      };
    });

    res.json(withCapacity);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subjects?sheetId=&status=
router.get('/subjects', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  try {
    let rows = await readSubjectRows(spreadsheetId);
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      rows = rows.filter(r => statuses.includes((r['Status'] || '').toLowerCase()));
    }

    // Resolve teacher names from Users tab
    let users: any[] = [];
    try { users = await readUsersTab(spreadsheetId); } catch {}
    const userMap = new Map(users.map(u => [u.userId, u]));

    const enriched = rows.map(s => {
      const teacher = userMap.get(s['TeacherID'] || '');
      const teacherName = teacher?.name || s['TeacherID'] || '';
      return {
        ...s,
        TeacherID: teacherName,
        Teachers: teacherName,
        TeacherName: teacherName,
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subjects — principal creates a new subject
router.post('/subjects', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { name, type, teachers, teacherId, room, days, time, maxCapacity } = req.body as {
    name?: string; type?: string; teachers?: string; teacherId?: string;
    room?: string; days?: string; time?: string; maxCapacity?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: 'Subject name is required' }); return; }
  if (!type || !['Group', 'Individual', 'Both'].includes(type)) {
    res.status(400).json({ error: 'type must be Group, Individual, or Both' }); return;
  }

  try {
    // Resolve TeacherID and Teacher Name
    let resolvedTeacherId = teacherId || '';
    let resolvedTeacherName = '';
    const allUsers = await readUsersTab(spreadsheetId);
    if (!resolvedTeacherId && teachers) {
      const t = allUsers.find(u =>
        (u.role === 'tutor' || u.role === 'teacher') &&
        u.name.toLowerCase().includes(teachers.toLowerCase())
      );
      resolvedTeacherId = t?.userId || teachers;
      resolvedTeacherName = t?.name || teachers;
    } else if (resolvedTeacherId) {
      const t = allUsers.find(u => u.userId === resolvedTeacherId);
      resolvedTeacherName = t?.name || '';
    }

    const subjectId = await generateSubjectId(spreadsheetId);
    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'SubjectID')    return subjectId;
      if (h === 'Name')         return name.trim();
      if (h === 'Type')         return type;
      if (h === 'TeacherID')    return resolvedTeacherId;
      if (h === 'Teacher Name') return resolvedTeacherName;
      if (h === 'Room')         return (room || '').trim();
      if (h === 'Days')         return (days || '').trim();
      if (h === 'Time')         return (time || '').trim();
      if (h === 'Status')       return 'Active';
      if (h === 'MaxCapacity')  return type === 'Group' ? (maxCapacity || '8').trim() : (maxCapacity || '999').trim();
      return '';
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true, subjectId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/subjects/:row — update subject fields
router.patch('/subjects/:row', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  const rowNum        = parseInt(req.params.row, 10);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const rows    = await readSubjectRows(spreadsheetId);
    const subject = rows.find(r => r._row === rowNum);
    if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

    const updated = { ...subject, ...req.body };
    const updatedValues = HEADERS.map(h => updated[h] || '');
    const sheets  = await getUncachableGoogleSheetClient();
    const colEnd  = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colEnd}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/subjects/:row/reassign', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  const { teacherId } = req.body as { teacherId?: string };
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }
  if (!teacherId?.trim()) { res.status(400).json({ error: 'teacherId is required' }); return; }

  try {
    const rows = await readSubjectRows(spreadsheetId);
    const subject = rows.find(r => r._row === rowNum);
    if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

    const users = await readUsersTab(spreadsheetId);
    const teacher = users.find(u => u.userId === teacherId);
    const teacherName = teacher?.name || '';

    const updated = {
      ...subject,
      TeacherID: teacherId.trim(),
      'Teacher Name': teacherName,
    };

    const updatedValues = HEADERS.map(h => updated[h] || '');
    const sheets = await getUncachableGoogleSheetClient();
    const colEnd = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colEnd}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, teacherName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
