import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readUsersTab(spreadsheetId: string): Promise<{ email: string; role: string; name: string }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Users!A1:D`,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const header = rows[0] as string[];
  const emailIdx = header.indexOf('Email');
  const roleIdx = header.indexOf('Role');
  const nameIdx = header.indexOf('Name');
  return rows.slice(1).map((row: any[]) => ({
    email: (row[emailIdx] || '').toLowerCase().trim(),
    role: (row[roleIdx] || '').toLowerCase().trim(),
    name: row[nameIdx] || '',
  }));
}

// GET /api/roles/check?email=X&sheetId=Y
router.get('/roles/check', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  try {
    const users = await readUsersTab(sheetId);
    const user = users.find((u) => u.email === email);
    if (user) {
      res.json({ role: user.role, name: user.name, found: true });
    } else {
      res.json({ role: null, found: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roles/enroll  — submit an enrollment request
router.post('/roles/enroll', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) {
    res.status(400).json({ error: 'sheetId is required' });
    return;
  }

  const {
    studentName, dob, currentSchool, currentGrade,
    parentName, parentEmail, parentPhone, studentPhone,
    classesInterested, notes,
  } = req.body;

  if (!studentName || !parentEmail) {
    res.status(400).json({ error: 'studentName and parentEmail are required' });
    return;
  }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const submissionDate = new Date().toLocaleDateString('en-AU');

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Enrollment Requests!A:L',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          studentName, dob || '', currentSchool || '', currentGrade || '',
          parentName || '', parentEmail, parentPhone || '', studentPhone || '',
          classesInterested || '', notes || '', submissionDate, 'Pending',
        ]],
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
