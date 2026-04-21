import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS,
  readTabRows, readUsersTab, appendRow, generateTabId, updateCell,
} from '../lib/googleSheets.js';

const router: IRouter = Router();
const TAB     = SHEET_TABS.enrollments;
const HEADERS = SHEET_HEADERS.enrollments;

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

/**
 * Two-column enrollment state model:
 *
 *   Status  │  Fee            │  Meaning
 *   ────────┼─────────────────┼──────────────────────────────────────────
 *   Active  │  Not Applicable │  Student is enrolled (default)
 *   Inactive│  Not Waived     │  Cancelled — fee pending principal decision
 *   Inactive│  Waived         │  Cancelled — principal waived the fee
 *
 * The Fee column is placed at the END of the Enrollments tab so it can be
 * added to existing sheets without shifting any existing column data.
 */

function normalizeStatus(raw: string | undefined): 'Active' | 'Inactive' {
  const v = (raw || '').toLowerCase().trim();
  if (
    v === 'inactive' || v === 'cancelled' || v === 'canceled' ||
    v === 'late cancellation' || v === 'fee waived' || v === 'fee confirmed'
  ) return 'Inactive';
  return 'Active';
}

function normalizeFee(rawStatus: string | undefined, rawFee: string | undefined): 'Not Applicable' | 'Not Waived' | 'Waived' {
  const s = (rawStatus || '').toLowerCase().trim();
  const f = (rawFee   || '').toLowerCase().trim();
  if (f === 'waived')         return 'Waived';
  if (f === 'not waived')     return 'Not Waived';
  if (f === 'not applicable') return 'Not Applicable';
  // Migrate legacy single-column values
  if (s === 'fee waived')     return 'Waived';
  if (s === 'late cancellation' || s === 'fee confirmed') return 'Not Waived';
  if (s === 'cancelled' || s === 'canceled')              return 'Not Waived';
  return 'Not Applicable';
}

function normalizeEnrollmentRow(row: any) {
  return {
    ...row,
    Status: normalizeStatus(row['Status']),
    Fee:    normalizeFee(row['Status'], row['Fee']),
  };
}

// ─── Ensure the Fee column header exists in the actual sheet ────────────────
/**
 * Reads the Enrollments header row. If 'Fee' is not present, appends it.
 * Returns the 1-based column index and A1 letter for both Status and Fee.
 */
async function ensureFeeColumn(spreadsheetId: string): Promise<{ statusCol: string; feeCol: string }> {
  const sheets = await getUncachableGoogleSheetClient();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!1:1`,
  });
  const headerRow: string[] = (res.data.values?.[0] as string[]) || [];

  const statusIdx = headerRow.findIndex(h => h === 'Status');
  let   feeIdx    = headerRow.findIndex(h => h === 'Fee');

  if (feeIdx === -1) {
    // Append 'Fee' header to the right of the existing headers
    feeIdx = headerRow.length;
    const feeColLetter = String.fromCharCode(65 + feeIdx);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!${feeColLetter}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Fee']] },
    });
  }

  return {
    statusCol: String.fromCharCode(65 + statusIdx),
    feeCol:    String.fromCharCode(65 + feeIdx),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readEnrollmentRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, TAB);
}

async function readSubjectRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, SHEET_TABS.subjects);
}

/** Compute next YYYY-MM-DD occurrence of a weekly class given its Days and Time strings. */
function nextClassDate(days: string, time: string): string {
  if (!days) return '';
  const DAY_MAP: Record<string, number> = {
    sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
    wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  };
  // Parse time → hours/minutes
  let h = 0, m = 0;
  const tp = (time || '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (tp) {
    h = parseInt(tp[1], 10);
    m = parseInt(tp[2] || '0', 10);
    const p = (tp[3] || '').toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
  }
  const now      = Date.now();
  const todayDay = new Date().getDay();
  let   earliest = Infinity;
  const parts = days.toLowerCase().split(/[,;\/\s]+/).map(d => d.trim()).filter(Boolean);
  for (const part of parts) {
    const target = DAY_MAP[part];
    if (target === undefined) continue;
    let diff = (target - todayDay + 7) % 7;
    const candidate = new Date();
    candidate.setDate(candidate.getDate() + diff);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 7);
    if (candidate.getTime() < earliest) earliest = candidate.getTime();
  }
  if (!isFinite(earliest)) return '';
  return new Date(earliest).toISOString().slice(0, 10);
}

async function enrichEnrollments(rows: any[], spreadsheetId: string): Promise<any[]> {
  const [users, subjects] = await Promise.all([
    readUsersTab(spreadsheetId),
    readSubjectRows(spreadsheetId),
  ]);
  const userMap    = new Map(users.map(u => [u.userId, u]));
  const subjectMap = new Map(subjects.map(s => [s['SubjectID'] || '', s]));

  return rows.map(r => {
    const student = userMap.get(r['UserID']    || '');
    const teacher = userMap.get(r['TeacherID'] || '');
    const parent  = userMap.get(r['ParentID']  || '');
    const subject = subjectMap.get(r['ClassID'] || '');
    // Use stored ClassDate if present; otherwise derive from the subject's weekly schedule
    const storedDate = (r['ClassDate'] || r['Class Date'] || '').trim();
    const classDate  = storedDate || nextClassDate(subject?.['Days'] || '', subject?.['Time'] || '');
    return {
      ...r,
      'Student Name':  student?.name  || r['UserID']    || '',
      'Student Email': student?.email || '',
      'Class Name':    subject?.['Name'] || r['ClassID'] || '',
      'Class Date':    classDate,
      'Class Time':    r['ClassTime'] || r['Class Time'] || subject?.['Time'] || '',
      'Parent Email':  parent?.email  || r['ParentID']  || '',
      'Teacher':       teacher?.name  || r['TeacherID'] || '',
      'Teacher Email': r['TeacherEmail'] || teacher?.email || '',
      'Days':          subject?.['Days'] || '',
    };
  });
}

// ─── GET /api/enrollments ───────────────────────────────────────────────────
router.get('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const rows     = await readEnrollmentRows(spreadsheetId);
    const enriched = await enrichEnrollments(rows, spreadsheetId);
    let filtered   = enriched;

    if (req.query.parentEmail) {
      const q = (req.query.parentEmail as string).toLowerCase();
      filtered = filtered.filter(r =>
        (r['Parent Email'] || '').toLowerCase() === q ||
        (r['ParentID']     || '').toLowerCase() === q
      );
    }
    if (req.query.teacherEmail) {
      const q = (req.query.teacherEmail as string).toLowerCase();
      filtered = filtered.filter(r => (r['Teacher Email'] || '').toLowerCase() === q);
    }
    if (req.query.studentEmail) {
      const q = (req.query.studentEmail as string).toLowerCase();
      filtered = filtered.filter(r => (r['Student Email'] || '').toLowerCase() === q);
    }
    if (req.query.studentName) {
      const q = (req.query.studentName as string).toLowerCase();
      filtered = filtered.filter(r => (r['Student Name'] || '').toLowerCase().includes(q));
    }
    if (req.query.userId) {
      filtered = filtered.filter(r => r['UserID'] === req.query.userId);
    }
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      filtered = filtered.filter(r => statuses.includes(normalizeStatus(r['Status']).toLowerCase()));
    }
    if (req.query.fee) {
      const fees = (req.query.fee as string).split(',').map(f => f.trim().toLowerCase());
      filtered = filtered.filter(r => fees.includes(normalizeFee(r['Status'], r['Fee']).toLowerCase()));
    }

    const period = (req.query.period as string) || 'all';
    if (period !== 'all') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => {
        const dateStr = (r['Class Date'] || r['ClassDate'] || '').trim();
        if (!dateStr || dateStr.toLowerCase() === 'tbd') return period === 'upcoming';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return period === 'upcoming';
        return period === 'upcoming' ? d >= todayStart : d < todayStart;
      });
    }

    res.json(filtered.map(normalizeEnrollmentRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments/join ─────────────────────────────────────────────
router.post('/enrollments/join', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const {
    studentName, studentEmail, studentUserId,
    parentEmail, parentUserId,
    subjectName, subjectId,
    subjectType, teacherEmail, teacherUserId, zoomLink,
  } = req.body;

  if ((!studentName && !studentUserId) || (!subjectName && !subjectId)) {
    res.status(400).json({ error: 'student identifier and class identifier are required' }); return;
  }

  try {
    const [users, subjects, currentEnrollments, cols] = await Promise.all([
      readUsersTab(spreadsheetId),
      readSubjectRows(spreadsheetId),
      readEnrollmentRows(spreadsheetId),
      ensureFeeColumn(spreadsheetId),
    ]);

    let resolvedStudentId   = studentUserId || '';
    let resolvedStudentName = studentName   || '';
    if (!resolvedStudentId && studentEmail) {
      const u = users.find(u => u.email === studentEmail.toLowerCase().trim());
      resolvedStudentId   = u?.userId || '';
      resolvedStudentName = u?.name   || studentName || '';
    }

    let resolvedClassId   = subjectId   || '';
    let resolvedClassName = subjectName || '';
    if (!resolvedClassId && subjectName) {
      const s = subjects.find(s => (s['Name'] || '').toLowerCase().trim() === subjectName.toLowerCase().trim());
      resolvedClassId   = s?.['SubjectID'] || subjectName;
      resolvedClassName = s?.['Name']      || subjectName;
    }

    let resolvedParentId = parentUserId || '';
    if (!resolvedParentId && parentEmail) {
      const p = users.find(u => u.email === parentEmail.toLowerCase().trim());
      resolvedParentId = p?.userId || '';
    }

    let resolvedTeacherId = teacherUserId || '';
    if (!resolvedTeacherId && teacherEmail) {
      const t = users.find(u => u.email === teacherEmail.toLowerCase().trim());
      resolvedTeacherId = t?.userId || '';
    }

    const subject     = subjects.find(s =>
      s['SubjectID'] === resolvedClassId ||
      (s['Name'] || '').toLowerCase() === resolvedClassName.toLowerCase()
    );
    const maxCapacity = Math.max(parseInt(subject?.['MaxCapacity'] || '8', 10) || 8, 1);
    const activeCount = currentEnrollments.filter(r =>
      r['ClassID'] === resolvedClassId && normalizeStatus(r['Status']) === 'Active'
    ).length;
    const overCapacity = activeCount >= maxCapacity;

    const enrollmentId = await generateTabId('ENR', spreadsheetId, TAB);
    const now = new Date().toISOString();

    // Build row values using the original 15 headers (no Fee yet — it's added at end by ensureFeeColumn)
    // We write Status=Active in its own column, and Fee=Not Applicable in its own column
    const baseHeaders = HEADERS.filter(h => h !== 'Fee');
    const rowValues = baseHeaders.map(h => {
      if (h === 'EnrollmentID') return enrollmentId;
      if (h === 'UserID')       return resolvedStudentId;
      if (h === 'ClassID')      return resolvedClassId;
      if (h === 'ParentID')     return resolvedParentId;
      if (h === 'Status')       return 'Active';
      if (h === 'EnrolledAt')   return now;
      if (h === 'TeacherID')    return resolvedTeacherId;
      if (h === 'TeacherEmail') return teacherEmail || '';
      if (h === 'Zoom Link')    return zoomLink    || '';
      if (h === 'Class Type')   return subjectType || '';
      if (h === 'ClassDate')    return 'TBD';
      if (h === 'ClassTime')    return 'TBD';
      return '';
    });
    // Append Fee at end (cols.feeCol is already ensured to exist)
    rowValues.push('Not Applicable');

    const sheets = await getUncachableGoogleSheetClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true, status: 'Active', fee: 'Not Applicable', overCapacity });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments — add a raw enrollment row ───────────────────────
router.post('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const [enrollmentId, cols] = await Promise.all([
      generateTabId('ENR', spreadsheetId, TAB),
      ensureFeeColumn(spreadsheetId),
    ]);
    const sheets = await getUncachableGoogleSheetClient();
    const baseHeaders = HEADERS.filter(h => h !== 'Fee');
    const rowValues = baseHeaders.map(h => {
      if (h === 'EnrollmentID') return enrollmentId;
      if (h === 'Status')       return 'Active';
      if (h === 'EnrolledAt')   return new Date().toISOString();
      return req.body[h] ?? '';
    });
    rowValues.push(req.body['Fee'] || 'Not Applicable');

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true, enrollmentId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments/:row/cancel ──────────────────────────────────────
// Every cancellation → Status=Inactive, Fee=Not Waived + writes Absent attendance row
router.post('/enrollments/:row/cancel', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const { userId, classId, within24Hrs, sessionDate } = req.body as {
    userId?: string; classId?: string; within24Hrs?: string; sessionDate?: string;
  };

  try {
    const cols = await ensureFeeColumn(spreadsheetId);
    await Promise.all([
      updateCell(spreadsheetId, `${TAB}!${cols.statusCol}${rowNum}`, 'Inactive'),
      updateCell(spreadsheetId, `${TAB}!${cols.feeCol}${rowNum}`,    'Not Waived'),
    ]);

    // Write an Absent attendance row if student/class info provided
    if (userId && classId) {
      const now        = new Date().toISOString();
      const date       = sessionDate || now.slice(0, 10);
      const w24        = within24Hrs === 'No' ? 'No' : 'Yes';
      const attHeaders = SHEET_HEADERS.attendance;
      const attId      = `ATT-${Date.now()}`;
      const rowValues  = attHeaders.map((h: string) => {
        if (h === 'AttendanceID') return attId;
        if (h === 'SubjectID')    return classId;
        if (h === 'UserID')       return userId;
        if (h === 'SessionDate')  return date;
        if (h === 'Status')       return 'Absent';
        if (h === 'Notes')        return 'Student cancellation';
        if (h === 'MarkedBy')     return 'system';
        if (h === 'MarkedAt')     return now;
        if (h === 'Within24Hrs')  return w24;
        return '';
      });
      const sheets = await getUncachableGoogleSheetClient();
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_TABS.attendance}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
    }

    res.json({ ok: true, status: 'Inactive', fee: 'Not Waived' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments/:row/waive-fee ───────────────────────────────────
router.post('/enrollments/:row/waive-fee', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const cols = await ensureFeeColumn(spreadsheetId);
    await Promise.all([
      updateCell(spreadsheetId, `${TAB}!${cols.statusCol}${rowNum}`, 'Inactive'),
      updateCell(spreadsheetId, `${TAB}!${cols.feeCol}${rowNum}`,    'Waived'),
    ]);
    res.json({ ok: true, status: 'Inactive', fee: 'Waived' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments/:row/override ────────────────────────────────────
// Legacy endpoint kept for backward compatibility — maps to waive-fee or no-op
router.post('/enrollments/:row/override', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const action = req.body.action as string;

  try {
    const cols   = await ensureFeeColumn(spreadsheetId);
    const newFee = action === 'Fee Waived' ? 'Waived' : 'Not Waived';
    await Promise.all([
      updateCell(spreadsheetId, `${TAB}!${cols.statusCol}${rowNum}`, 'Inactive'),
      updateCell(spreadsheetId, `${TAB}!${cols.feeCol}${rowNum}`,    newFee),
    ]);
    res.json({ ok: true, status: 'Inactive', fee: newFee });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/enrollments/:row/assign-teacher ───────────────────────────────
router.put('/enrollments/:row/assign-teacher', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  const rowNum        = parseInt(req.params.row, 10);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const { teacherEmail } = req.body;
  if (!teacherEmail) { res.status(400).json({ error: 'teacherEmail is required' }); return; }

  try {
    const [users, enrollments] = await Promise.all([
      readUsersTab(spreadsheetId),
      readEnrollmentRows(spreadsheetId),
    ]);

    const teacher = users.find(u =>
      u.email === teacherEmail.toLowerCase().trim() &&
      (u.role === 'tutor' || u.role === 'teacher')
    );
    if (!teacher) { res.status(404).json({ error: 'Teacher not found in Users tab' }); return; }

    const teacherExt = await readTabRows(spreadsheetId, SHEET_TABS.teachers);
    const extRecord  = teacherExt.find(t => t['UserID'] === teacher.userId || t['TeacherID'] === teacher.userId);
    const zoomLink   = extRecord?.['Zoom Link'] || '';

    const enrollment = enrollments.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    // Only update teacher-related cells — leave Status and Fee untouched
    const sheets = await getUncachableGoogleSheetClient();
    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!1:1` });
    const headers: string[] = (headerRes.data.values?.[0] as string[]) || [];

    const updates = [
      { field: 'TeacherID',    value: teacher.userId },
      { field: 'TeacherEmail', value: teacher.email },
      { field: 'Zoom Link',    value: zoomLink },
    ];

    for (const { field, value } of updates) {
      const idx = headers.indexOf(field);
      if (idx >= 0) {
        await updateCell(spreadsheetId, `${TAB}!${String.fromCharCode(65 + idx)}${rowNum}`, value);
      }
    }

    res.json({ ok: true, teacher: teacher.name, teacherEmail: teacher.email, zoomLink });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
