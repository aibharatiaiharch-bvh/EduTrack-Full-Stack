import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_HEADERS, SHEET_TABS,
  colLetter, generateUserId,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readRows(spreadsheetId: string, tab: string): Promise<{ _row: number; [k: string]: any }[]> {
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

async function readUsersTab(spreadsheetId: string) {
  const rows = await readRows(spreadsheetId, SHEET_TABS.users);
  return rows.map(r => ({
    _row: r._row,
    userId: r['UserID'] || '',
    email: (r['Email'] || '').toLowerCase().trim(),
    role: (r['Role'] || '').toLowerCase().trim(),
    name: r['Name'] || '',
    addedDate: r['Added Date'] || '',
    status: (r['Status'] || 'active').toLowerCase().trim(),
  }));
}

async function appendRow(spreadsheetId: string, tab: string, values: string[]): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function updateCell(spreadsheetId: string, range: string, value: string): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

// GET /api/roles/check?email=X&sheetId=Y
// Users tab is the SINGLE SOURCE OF TRUTH for all users, including the developer.
// Developer email bypass ONLY applies when email is NOT found in Users tab.
router.get('/roles/check', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  try {
    // Always check Users tab first — even for the developer email
    const users = await readUsersTab(sheetId);
    const user = users.find((u) => u.email === email);

    if (user) {
      // Found in Users tab — role and status here are the source of truth
      res.json({
        role: user.role,
        name: user.name,
        status: user.status,
        userId: user.userId,
        found: true,
        tabMissing: false,
      });
      return;
    }

    // Not found in Users tab — developer bypass (admin access without a Users tab entry)
    const devEmail = (process.env.DEVELOPER_EMAIL || '').toLowerCase().trim();
    if (devEmail && email === devEmail) {
      res.json({
        role: 'developer',
        name: process.env.DEVELOPER_NAME || 'Developer',
        status: 'active',
        userId: 'ADM-DEV',
        found: true,
        tabMissing: false,
      });
      return;
    }

    res.json({ role: null, status: null, found: false, tabMissing: false });
  } catch {
    // Users tab likely doesn't exist yet
    res.json({ role: null, status: null, found: false, tabMissing: true });
  }
});

// POST /api/roles/enroll — submit an enrollment/application request
// requestType: 'student' (default) or 'tutor'
router.post('/roles/enroll', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const {
    requestType,
    studentName, dob, currentSchool, currentGrade,
    parentName, parentEmail, parentPhone, studentPhone,
    classesInterested, notes, userEmail, userName,
  } = req.body;

  const submissionDate = new Date().toLocaleDateString('en-AU');

  try {
    if (requestType === 'tutor') {
      // Tutor / staff application
      const applicantName = studentName || userName || '';
      const applicantEmail = (parentEmail || userEmail || '').toLowerCase().trim();
      if (!applicantName || !applicantEmail) {
        res.status(400).json({ error: 'Name and email are required for tutor applications' }); return;
      }
      // Write to Enrollment Requests tab — repurpose existing columns
      // studentName=applicant name, parentEmail=applicant email, classesInterested=subjects
      await appendRow(sheetId, SHEET_TABS.enrollment_requests, [
        applicantName, '', '', '', '', applicantEmail, parentPhone || '',
        '', classesInterested || '', notes || '', submissionDate, 'Pending', 'tutor',
      ]);
      // Add to Users tab as tutor/Pending so they see the "Pending Approval" screen
      const existingUsers = await readUsersTab(sheetId);
      const alreadyExists = existingUsers.find(u => u.email === applicantEmail);
      if (!alreadyExists) {
        const userId = await generateUserId('tutor', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, applicantEmail, 'tutor', applicantName, submissionDate, 'Pending',
        ]);
      }
    } else {
      // Student / family enrollment (default)
      if (!studentName || !parentEmail) {
        res.status(400).json({ error: 'studentName and parentEmail are required' }); return;
      }
      await appendRow(sheetId, SHEET_TABS.enrollment_requests, [
        studentName, dob || '', currentSchool || '', currentGrade || '',
        parentName || '', parentEmail, parentPhone || '', studentPhone || '',
        classesInterested || '', notes || '', submissionDate, 'Pending', 'student',
      ]);
      if (userEmail) {
        const existingUsers = await readUsersTab(sheetId);
        const alreadyExists = existingUsers.find(u => u.email === userEmail.toLowerCase().trim());
        if (!alreadyExists) {
          const userId = await generateUserId('parent', sheetId);
          await appendRow(sheetId, SHEET_TABS.users, [
            userId, userEmail.toLowerCase().trim(), 'parent',
            userName || parentName || '', submissionDate, 'Pending',
          ]);
        }
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/enrollment-requests?sheetId=X
router.get('/enrollment-requests', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readRows(sheetId, SHEET_TABS.enrollment_requests);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/approve
router.post('/enrollment-requests/:row/approve', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: 'sheetId and valid row required' }); return; }

  try {
    const rows = await readRows(sheetId, SHEET_TABS.enrollment_requests);
    const request = rows.find(r => r._row === rowNum);
    if (!request) { res.status(404).json({ error: 'Enrollment request not found' }); return; }

    const today = new Date().toLocaleDateString('en-AU');
    const parentEmail = (request['Parent Email'] || '').toLowerCase().trim();
    const parentName  = request['Parent Name'] || '';
    const studentName = request['Student Name'] || '';
    const studentPhone = request['Student Phone'] || '';

    // 1. Mark enrollment request as Approved
    const erStatusCol = colLetter('enrollment_requests', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.enrollment_requests}!${erStatusCol}${rowNum}`, 'Active');

    const requestType = (request['Request Type'] || 'student').toLowerCase().trim();

    if (requestType === 'tutor') {
      // ── Tutor / staff approval ───────────────────────────────────────
      const applicantName = request['Student Name'] || '';
      const applicantEmail = (request['Parent Email'] || '').toLowerCase().trim();
      const subjects = request['Classes Interested'] || '';

      // Generate tutor UserID and add to Teachers tab
      if (applicantName) {
        const teacherId = await generateUserId('tutor', sheetId);
        await appendRow(sheetId, SHEET_TABS.teachers, [
          teacherId, applicantName, applicantEmail, subjects, 'Tutor', 'Active',
        ]);
        // Activate / create the Users tab entry
        if (applicantEmail) {
          const users = await readUsersTab(sheetId);
          const existing = users.find(u => u.email === applicantEmail);
          if (!existing) {
            await appendRow(sheetId, SHEET_TABS.users, [
              teacherId, applicantEmail, 'tutor', applicantName, today, 'Active',
            ]);
          } else {
            const statusCol = colLetter('users', 'Status');
            await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${existing._row}`, 'Active');
          }
        }
      }
    } else {
      // ── Student / family approval (default) ─────────────────────────
      // 2. Add / activate parent in Users tab
      if (parentEmail) {
        const users = await readUsersTab(sheetId);
        const existing = users.find(u => u.email === parentEmail);
        if (!existing) {
          const userId = await generateUserId('parent', sheetId);
          await appendRow(sheetId, SHEET_TABS.users, [
            userId, parentEmail, 'parent', parentName, today, 'Active',
          ]);
        } else if (existing.status !== 'active') {
          const statusCol = colLetter('users', 'Status');
          await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${existing._row}`, 'Active');
        }
      }

      // 3. Add student to Students tab with a unique UserID
      if (studentName) {
        const studentId = await generateUserId('student', sheetId);
        await appendRow(sheetId, SHEET_TABS.students, [
          studentId, studentName, '', '', 'Active', studentPhone, parentEmail,
        ]);
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/reject
router.post('/enrollment-requests/:row/reject', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: 'sheetId and valid row required' }); return; }

  try {
    const statusCol = colLetter('enrollment_requests', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.enrollment_requests}!${statusCol}${rowNum}`, 'Rejected');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
