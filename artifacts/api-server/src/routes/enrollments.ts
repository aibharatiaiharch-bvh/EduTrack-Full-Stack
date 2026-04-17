import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS,
  readTabRows, readUsersTab, appendRow, generateTabId,
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
 * The Enrollments tab tracks CLASS MEMBERSHIP ONLY.
 * The only valid status values are:
 *   Active           — student is currently enrolled in the class
 *   Cancelled        — cancelled with >24 h notice (no fee)
 *   Late Cancellation — cancelled with <24 h notice (fee decision pending)
 *
 * New student program enrollments (Pending/Approved) are transient states
 * managed through the Requests workflow. Once App Paid is clicked, the row
 * becomes Active. Paid, Rejected, Fee Waived, Fee Confirmed are legacy values
 * that normalise to their closest equivalent.
 */
function normalizeEnrollmentStatus(value: string | undefined): string {
  const v = (value || '').toLowerCase().trim();
  if (v === 'cancelled' || v === 'canceled')  return 'Cancelled';
  if (v === 'late cancellation')              return 'Late Cancellation';
  if (v === 'fee waived')                     return 'Fee Waived';
  if (v === 'fee confirmed')                  return 'Fee Confirmed';
  // active, approved, paid, enrolled, pending and any other transient
  // new-enrollment states all resolve to Active once the class row exists
  return 'Active';
}

function normalizeEnrollmentRow(row: any) {
  return {
    ...row,
    Status: normalizeEnrollmentStatus(row['Status']),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readEnrollmentRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, TAB);
}

async function readSubjectRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, SHEET_TABS.subjects);
}

/** Enrich raw enrollment rows with resolved display names (joined server-side). */
async function enrichEnrollments(
  rows: any[],
  spreadsheetId: string,
): Promise<any[]> {
  const [users, subjects] = await Promise.all([
    readUsersTab(spreadsheetId),
    readSubjectRows(spreadsheetId),
  ]);
  const userMap    = new Map(users.map(u => [u.userId, u]));
  const subjectMap = new Map(subjects.map(s => [s['SubjectID'] || '', s]));

  return rows.map(r => {
    const student  = userMap.get(r['UserID']    || '');
    const teacher  = userMap.get(r['TeacherID'] || '');
    const parent   = userMap.get(r['ParentID']  || '');
    const subject  = subjectMap.get(r['ClassID'] || '');
    return {
      ...r,
      // ── Resolved display fields ──
      'Student Name':  student?.name  || r['UserID']    || '',
      'Student Email': student?.email || '',
      'Class Name':    subject?.['Name'] || r['ClassID'] || '',
      'Class Date':    r['ClassDate'] || r['Class Date'] || '',
      'Class Time':    r['ClassTime'] || r['Class Time'] || '',
      'Parent Email':  parent?.email  || r['ParentID']  || '',
      'Teacher':       teacher?.name  || r['TeacherID'] || '',
      'Teacher Email': r['TeacherEmail'] || teacher?.email || '',
    };
  });
}

function classStartsInMoreThan24Hours(classDate: string, classTime: string): boolean {
  if (!classDate) return true;
  const dateStr  = classTime ? `${classDate} ${classTime}` : classDate;
  const classStart = new Date(dateStr);
  if (isNaN(classStart.getTime())) return true;
  return classStart.getTime() - Date.now() > 24 * 60 * 60 * 1000;
}

/** For recurring classes where ClassDate is TBD, compute next session from Days+Time. */
function recurringNextSessionWithin24h(days: string, time: string): boolean {
  if (!days || !time) return false;
  const dayMap: Record<string, number> = {
    sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
    wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  };
  const todayDay = new Date().getDay();
  const parts = days.toLowerCase().split(/[,;\/\s]+/).map(d => d.trim()).filter(Boolean);
  const timeParts = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  let h = 0, m = 0;
  if (timeParts) {
    h = parseInt(timeParts[1], 10);
    m = parseInt(timeParts[2] || '0', 10);
    const p = (timeParts[3] || '').toLowerCase();
    if (p === 'pm' && h !== 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
  }
  for (const part of parts) {
    const target = dayMap[part];
    if (target === undefined) continue;
    const diff = (target - todayDay + 7) % 7;
    const candidate = new Date();
    candidate.setDate(candidate.getDate() + diff);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() < Date.now()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    const msUntil = candidate.getTime() - Date.now();
    if (msUntil <= 24 * 60 * 60 * 1000) return true;
  }
  return false;
}

// ─── GET /api/enrollments ───────────────────────────────────────────────────
router.get('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let rows = await readEnrollmentRows(spreadsheetId);
    const enriched = await enrichEnrollments(rows, spreadsheetId);

    // Filter on resolved display fields OR raw ID fields
    let filtered = enriched;
    if (req.query.parentEmail) {
      const q = (req.query.parentEmail as string).toLowerCase();
      filtered = filtered.filter(r =>
        (r['Parent Email'] || '').toLowerCase() === q ||
        (r['ParentID'] || '').toLowerCase() === q
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
      const q = req.query.userId as string;
      filtered = filtered.filter(r => r['UserID'] === q);
    }
    if (req.query.status) {
      // Compare against normalized status so callers can use canonical values (e.g. Active, Cancelled)
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      filtered = filtered.filter(r =>
        statuses.includes(normalizeEnrollmentStatus(r['Status']).toLowerCase())
      );
    }

    // Period filter: upcoming | past | all (default — callers opt-in to date filtering)
    const period = (req.query.period as string) || 'all';
    if (period !== 'all') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      filtered = filtered.filter(r => {
        const dateStr = (r['Class Date'] || r['ClassDate'] || '').trim();
        // No date or TBD — include in upcoming, exclude from past
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
// Student joins a class from the class browser.
// Accepts either studentUserId (preferred) or studentName + studentEmail for legacy.
router.post('/enrollments/join', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const {
    studentName, studentEmail, studentUserId,
    parentEmail, parentUserId,
    subjectName, subjectId,
    subjectType, teacherName, teacherEmail, teacherUserId, zoomLink,
  } = req.body;

  if ((!studentName && !studentUserId) || (!subjectName && !subjectId)) {
    res.status(400).json({ error: 'student identifier and class identifier are required' }); return;
  }

  try {
    const [users, subjects, currentEnrollments] = await Promise.all([
      readUsersTab(spreadsheetId),
      readSubjectRows(spreadsheetId),
      readEnrollmentRows(spreadsheetId),
    ]);

    // Resolve student UserID
    let resolvedStudentId = studentUserId || '';
    let resolvedStudentName = studentName || '';
    if (!resolvedStudentId && studentEmail) {
      const u = users.find(u => u.email === studentEmail.toLowerCase().trim());
      resolvedStudentId = u?.userId || '';
      resolvedStudentName = u?.name || studentName || '';
    }

    // Resolve class (SubjectID)
    let resolvedClassId = subjectId || '';
    let resolvedClassName = subjectName || '';
    if (!resolvedClassId && subjectName) {
      const s = subjects.find(s => (s['Name'] || '').toLowerCase().trim() === subjectName.toLowerCase().trim());
      resolvedClassId = s?.['SubjectID'] || subjectName;
      resolvedClassName = s?.['Name'] || subjectName;
    }

    // Resolve parent UserID
    let resolvedParentId = parentUserId || '';
    if (!resolvedParentId && parentEmail) {
      const p = users.find(u => u.email === parentEmail.toLowerCase().trim());
      resolvedParentId = p?.userId || '';
    }

    // Resolve teacher UserID
    let resolvedTeacherId = teacherUserId || '';
    if (!resolvedTeacherId && teacherEmail) {
      const t = users.find(u => u.email === teacherEmail.toLowerCase().trim());
      resolvedTeacherId = t?.userId || '';
    }

    // Capacity check — class assignments are always Active but warn when over capacity
    const subject    = subjects.find(s => s['SubjectID'] === resolvedClassId || (s['Name'] || '').toLowerCase() === resolvedClassName.toLowerCase());
    const maxCapacity = Math.max(parseInt(subject?.['MaxCapacity'] || '8', 10) || 8, 1);
    const activeCount = currentEnrollments.filter(r =>
      r['ClassID'] === resolvedClassId &&
      (r['Status'] || '').toLowerCase().trim() === 'active'
    ).length;
    const overCapacity = activeCount >= maxCapacity;

    // Class assignments are always Active — no pending/approval required
    const status = 'Active';
    const enrollmentId = await generateTabId('ENR', spreadsheetId, TAB);
    const now = new Date().toISOString();
    const rowValues = HEADERS.map(h => {
      if (h === 'EnrollmentID')  return enrollmentId;
      if (h === 'UserID')        return resolvedStudentId;
      if (h === 'ClassID')       return resolvedClassId;
      if (h === 'ParentID')      return resolvedParentId;
      if (h === 'Status')        return status;
      if (h === 'EnrolledAt')    return now;
      if (h === 'TeacherID')     return resolvedTeacherId;
      if (h === 'TeacherEmail')  return teacherEmail || '';
      if (h === 'Zoom Link')     return zoomLink || '';
      if (h === 'Class Type')    return subjectType || '';
      if (h === 'ClassDate')     return 'TBD';
      if (h === 'ClassTime')     return 'TBD';
      return '';
    });

    const sheets = await getUncachableGoogleSheetClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true, status, overCapacity });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments — add a raw enrollment row ───────────────────────
router.post('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const enrollmentId = await generateTabId('ENR', spreadsheetId, TAB);
    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'EnrollmentID')  return enrollmentId;
      if (h === 'Status')        return normalizeEnrollmentStatus(req.body[h] || 'Approved');
      if (h === 'EnrolledAt')    return new Date().toISOString();
      return req.body[h] ?? '';
    });
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
router.post('/enrollments/:row/cancel', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const rows       = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const rawDate = enrollment['ClassDate'] || enrollment['Class Date'] || '';
    const rawTime = enrollment['ClassTime'] || enrollment['Class Time'] || '';
    const isRecurring = !rawDate || rawDate.toLowerCase() === 'tbd';

    let moreThan24h: boolean;
    if (isRecurring) {
      // Recurring class: look up schedule from Subjects tab
      const subjects = await readSubjectRows(spreadsheetId);
      const subject  = subjects.find(s => s['SubjectID'] === enrollment['ClassID']);
      const days = subject?.['Days'] || '';
      const time = subject?.['Time'] || rawTime;
      moreThan24h = !recurringNextSessionWithin24h(days, time);
    } else {
      moreThan24h = classStartsInMoreThan24Hours(rawDate, rawTime);
    }

    const newStatus = moreThan24h ? 'Cancelled' : 'Late Cancellation';

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return newStatus;
      return enrollment[h] || '';
    });
    const colEnd = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colEnd}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, status: newStatus, lateCancel: !moreThan24h });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollments/:row/override ────────────────────────────────────
router.post('/enrollments/:row/override', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const action = req.body.action as string;
  if (action !== 'Fee Waived' && action !== 'Fee Confirmed') {
    res.status(400).json({ error: 'action must be "Fee Waived" or "Fee Confirmed"' }); return;
  }

  try {
    const rows       = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return action; // "Fee Waived" or "Fee Confirmed"
      return enrollment[h] || '';
    });
    const colEnd = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colEnd}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, action });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/enrollments/:row/assign-teacher ───────────────────────────────
// Assigns (or reassigns) a teacher. Looks up teacher by email from Users tab.
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

    // Find teacher in Users tab (master)
    const teacher = users.find(u =>
      u.email === teacherEmail.toLowerCase().trim() &&
      (u.role === 'tutor' || u.role === 'teacher')
    );
    if (!teacher) { res.status(404).json({ error: 'Teacher not found in Users tab' }); return; }

    // Also look for zoom link from Teachers extension tab
    const teacherExt = await readTabRows(spreadsheetId, SHEET_TABS.teachers);
    const extRecord  = teacherExt.find(t => t['UserID'] === teacher.userId || t['TeacherID'] === teacher.userId);
    const zoomLink   = extRecord?.['Zoom Link'] || '';

    const enrollment = enrollments.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const updatedValues = HEADERS.map(h => {
      if (h === 'TeacherID')    return teacher.userId;
      if (h === 'TeacherEmail') return teacher.email;
      if (h === 'Zoom Link')    return zoomLink;
      return enrollment[h] || '';
    });

    const sheets = await getUncachableGoogleSheetClient();
    const colEnd  = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colEnd}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({
      ok: true,
      teacher:      teacher.name,
      teacherEmail: teacher.email,
      zoomLink,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
