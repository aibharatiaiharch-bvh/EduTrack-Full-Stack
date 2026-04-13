import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

async function readTabRows(spreadsheetId: string, tab: string): Promise<{ _row: number; [k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z` });
  const rows = res.data.values || [];
  if (rows.length < 1) return [];
  const headerRow = rows[0] as string[];
  return rows.slice(1).map((row, i) => {
    const obj: any = { _row: i + 2 };
    headerRow.forEach((h, idx) => { obj[h] = (row as string[])[idx] || ''; });
    return obj;
  });
}

const router: IRouter = Router();

const TAB = SHEET_TABS.enrollments;
const HEADERS = SHEET_HEADERS.enrollments;

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readEnrollmentRows(spreadsheetId: string): Promise<{ _row: number;[k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A1:Z`,
  });
  const rows = res.data.values || [];
  if (rows.length < 1) return [];
  const headerRow = rows[0] as string[];
  return rows.slice(1).map((row, i) => {
    const obj: any = { _row: i + 2 };
    headerRow.forEach((h, idx) => {
      obj[h] = (row as string[])[idx] || '';
    });
    return obj;
  });
}

function classStartsInMoreThan24Hours(classDate: string, classTime: string): boolean {
  if (!classDate) return true;
  const dateStr = classTime ? `${classDate} ${classTime}` : classDate;
  const classStart = new Date(dateStr);
  if (isNaN(classStart.getTime())) return true;
  const diffMs = classStart.getTime() - Date.now();
  return diffMs > 24 * 60 * 60 * 1000;
}

async function readSubjectsRows(spreadsheetId: string): Promise<{ _row: number; [k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_TABS.subjects}!A1:Z` });
  const rows = res.data.values || [];
  if (rows.length < 1) return [];
  const headerRow = rows[0] as string[];
  return rows.slice(1).map((row, i) => {
    const obj: any = { _row: i + 2 };
    headerRow.forEach((h, idx) => { obj[h] = (row as string[])[idx] || ''; });
    return obj;
  });
}

// GET /api/enrollments?sheetId=&parentEmail=&teacherEmail=&studentEmail=&studentName=&status=
router.get('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let rows = await readEnrollmentRows(spreadsheetId);
    if (req.query.parentEmail) {
      const email = (req.query.parentEmail as string).toLowerCase();
      rows = rows.filter(r => (r['Parent Email'] || '').toLowerCase() === email);
    }
    if (req.query.teacherEmail) {
      const email = (req.query.teacherEmail as string).toLowerCase();
      rows = rows.filter(r => (r['Teacher Email'] || '').toLowerCase() === email);
    }
    if (req.query.studentEmail) {
      const email = (req.query.studentEmail as string).toLowerCase();
      rows = rows.filter(r => (r['Student Email'] || '').toLowerCase() === email);
    }
    if (req.query.studentName) {
      const name = (req.query.studentName as string).toLowerCase();
      rows = rows.filter(r => (r['Student Name'] || '').toLowerCase().includes(name));
    }
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      rows = rows.filter(r => statuses.includes((r['Status'] || '').toLowerCase()));
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments/join — student joins a class from the class browser
// Must be registered BEFORE /enrollments/:row to avoid Express matching "join" as :row
router.post('/enrollments/join', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { studentName, studentEmail, parentEmail, subjectName, subjectType, teacherName, teacherEmail, zoomLink } = req.body;
  if (!studentName || !subjectName) {
    res.status(400).json({ error: 'studentName and subjectName are required' }); return;
  }

  try {
    const subjects = await readSubjectsRows(spreadsheetId);
    const subject = subjects.find(s => (s['Name'] || '').toLowerCase().trim() === (subjectName || '').toLowerCase().trim());
    const maxCapacity = Math.max(parseInt(subject?.['MaxCapacity'] || '8', 10) || 8, 1);
    const currentEnrollments = await readEnrollmentRows(spreadsheetId);
    const activeCount = currentEnrollments.filter(r =>
      (r['Class Name'] || '').toLowerCase().trim() === (subjectName || '').toLowerCase().trim() &&
      !['cancelled', 'late cancellation', 'rejected'].includes((r['Status'] || '').toLowerCase().trim())
    ).length;

    if (activeCount >= maxCapacity) {
      await appendPrincipalReviewRequest(spreadsheetId, studentName, parentEmail, subjectName, subjectType, teacherName, teacherEmail, zoomLink);
      res.json({ ok: true, queuedForReview: true });
      return;
    }

    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'Student Name')    return studentName || '';
      if (h === 'Student Email')   return studentEmail || '';
      if (h === 'Class Name')      return subjectName || '';
      if (h === 'Class Date')      return 'TBD';
      if (h === 'Class Time')      return 'TBD';
      if (h === 'Parent Email')    return parentEmail || '';
      if (h === 'Status')          return 'Active';
      if (h === 'Override Action') return '';
      if (h === 'Teacher')         return teacherName || '';
      if (h === 'Teacher Email')   return teacherEmail || '';
      if (h === 'Zoom Link')       return zoomLink || '';
      if (h === 'Class Type')      return subjectType || '';
      return '';
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function appendPrincipalReviewRequest(
  spreadsheetId: string,
  studentName: string,
  parentEmail: string,
  subjectName: string,
  subjectType: string,
  teacherName: string,
  teacherEmail: string,
  zoomLink: string,
): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TABS.enrollment_requests}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        studentName,
        '',
        'No',
        '',
        '',
        '',
        subjectName,
        parentEmail,
        '',
        '',
        '',
        `Auto-review needed for ${subjectType} class${teacherName ? ` (${teacherName})` : ''}`,
        new Date().toLocaleDateString('en-AU'),
        'Pending',
        'student',
      ]],
    },
  });
}

// POST /api/enrollments — add a new enrollment row
router.post('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'Status') return req.body[h] || 'Active';
      if (h === 'Override Action') return '';
      return req.body[h] ?? '';
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments/:row/cancel — cancel with 24-hour check
router.post('/enrollments/:row/cancel', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const rows = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const moreThan24h = classStartsInMoreThan24Hours(
      enrollment['Class Date'],
      enrollment['Class Time']
    );
    const newStatus = moreThan24h ? 'Cancelled' : 'Late Cancellation';

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return newStatus;
      if (h === 'Override Action') return enrollment['Override Action'] || '';
      return enrollment[h] || '';
    });
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, status: newStatus, lateCancel: !moreThan24h });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments/:row/override — principal waives or confirms fee
router.post('/enrollments/:row/override', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const action = req.body.action as string;
  if (action !== 'Fee Waived' && action !== 'Fee Confirmed') {
    res.status(400).json({ error: 'action must be "Fee Waived" or "Fee Confirmed"' });
    return;
  }

  try {
    const rows = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return action;
      if (h === 'Override Action') return action;
      return enrollment[h] || '';
    });
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, action });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/enrollments/:row/assign-teacher
// Assigns (or reassigns) a teacher to an enrollment row.
// Looks up the teacher from the Teachers tab and copies their Name, Email, and Zoom Link.
router.put('/enrollments/:row/assign-teacher', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const { teacherEmail } = req.body;
  if (!teacherEmail) { res.status(400).json({ error: 'teacherEmail is required' }); return; }

  try {
    // Look up teacher in the Teachers tab
    const teachers = await readTabRows(spreadsheetId, SHEET_TABS.teachers);
    const teacher = teachers.find(t =>
      (t['Email'] || '').toLowerCase().trim() === teacherEmail.toLowerCase().trim()
    );
    if (!teacher) { res.status(404).json({ error: 'Teacher not found in Teachers tab' }); return; }

    // Read the current enrollment row
    const enrollments = await readEnrollmentRows(spreadsheetId);
    const enrollment = enrollments.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    // Build updated row — preserve all existing values, overwrite Teacher fields
    const updatedValues = HEADERS.map(h => {
      if (h === 'Teacher')       return teacher['Name'] || '';
      if (h === 'Teacher Email') return teacher['Email'] || '';
      if (h === 'Zoom Link')     return teacher['Zoom Link'] || '';
      return enrollment[h] || '';
    });

    const sheets = await getUncachableGoogleSheetClient();
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({
      ok: true,
      teacher: teacher['Name'],
      teacherEmail: teacher['Email'],
      zoomLink: teacher['Zoom Link'] || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
