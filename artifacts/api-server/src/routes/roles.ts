import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readRows(spreadsheetId: string, tab: string): Promise<{ _row: number; [k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:Z`,
  });
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
  const rows = await readRows(spreadsheetId, 'Users');
  return rows.map(r => ({
    _row: r._row,
    email: (r['Email'] || '').toLowerCase().trim(),
    role: (r['Role'] || '').toLowerCase().trim(),
    name: r['Name'] || '',
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
router.get('/roles/check', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  // Developer email bypass — skip Users tab lookup entirely
  const devEmail = (process.env.DEVELOPER_EMAIL || '').toLowerCase().trim();
  if (devEmail && email === devEmail) {
    res.json({
      role: 'admin',
      name: process.env.DEVELOPER_NAME || 'Developer',
      status: 'active',
      found: true,
      tabMissing: false,
    });
    return;
  }

  try {
    const users = await readUsersTab(sheetId);
    const user = users.find((u) => u.email === email);
    if (user) {
      res.json({ role: user.role, name: user.name, status: user.status, found: true });
    } else {
      res.json({ role: null, status: null, found: false, tabMissing: false });
    }
  } catch (err: any) {
    res.json({ role: null, status: null, found: false, tabMissing: true });
  }
});

// POST /api/roles/enroll — submit an enrollment request and add user as Pending
router.post('/roles/enroll', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) {
    res.status(400).json({ error: 'sheetId is required' });
    return;
  }

  const {
    studentName, dob, currentSchool, currentGrade,
    parentName, parentEmail, parentPhone, studentPhone,
    classesInterested, notes, userEmail, userName,
  } = req.body;

  if (!studentName || !parentEmail) {
    res.status(400).json({ error: 'studentName and parentEmail are required' });
    return;
  }

  try {
    const submissionDate = new Date().toLocaleDateString('en-AU');

    await appendRow(sheetId, 'Enrollment Requests', [
      studentName, dob || '', currentSchool || '', currentGrade || '',
      parentName || '', parentEmail, parentPhone || '', studentPhone || '',
      classesInterested || '', notes || '', submissionDate, 'Pending',
    ]);

    if (userEmail) {
      const existingUsers = await readUsersTab(sheetId);
      const alreadyExists = existingUsers.find(u => u.email === userEmail.toLowerCase().trim());
      if (!alreadyExists) {
        await appendRow(sheetId, 'Users', [
          userEmail.toLowerCase().trim(),
          'parent',
          userName || parentName || '',
          submissionDate,
          'Pending',
        ]);
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
    const rows = await readRows(sheetId, 'Enrollment Requests');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/approve
// Approves a request: sets status Active, adds parent to Users, adds student to Students
router.post('/enrollment-requests/:row/approve', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: 'sheetId and valid row required' }); return; }

  try {
    const rows = await readRows(sheetId, 'Enrollment Requests');
    const request = rows.find(r => r._row === rowNum);
    if (!request) { res.status(404).json({ error: 'Enrollment request not found' }); return; }

    const today = new Date().toLocaleDateString('en-AU');
    const parentEmail = (request['Parent Email'] || '').toLowerCase().trim();
    const parentName  = request['Parent Name'] || '';
    const studentName = request['Student Name'] || '';
    const studentPhone = request['Student Phone'] || '';

    // 1. Mark enrollment request as Active (Status is column 12 = L)
    const headers = SHEET_HEADERS.enrollment_requests;
    const statusColIdx = headers.findIndex(h => h === 'Status');
    const statusColLetter = String.fromCharCode(65 + statusColIdx); // A=65
    await updateCell(sheetId, `Enrollment Requests!${statusColLetter}${rowNum}`, 'Active');

    // 2. Add / activate parent in Users tab
    if (parentEmail) {
      const users = await readUsersTab(sheetId);
      const existing = users.find(u => u.email === parentEmail);
      if (!existing) {
        await appendRow(sheetId, 'Users', [parentEmail, 'parent', parentName, today, 'Active']);
      } else if (existing.status !== 'active') {
        // Activate the pending user — Status is column E (index 4)
        await updateCell(sheetId, `Users!E${existing._row}`, 'Active');
      }
    }

    // 3. Add student to Students tab
    if (studentName) {
      await appendRow(sheetId, 'Students', [studentName, '', '', 'Active', studentPhone, parentEmail]);
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
    const headers = SHEET_HEADERS.enrollment_requests;
    const statusColIdx = headers.findIndex(h => h === 'Status');
    const statusColLetter = String.fromCharCode(65 + statusColIdx);
    await updateCell(sheetId, `Enrollment Requests!${statusColLetter}${rowNum}`, 'Rejected');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
