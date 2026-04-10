import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readUsersTab(spreadsheetId: string): Promise<{ email: string; role: string; name: string; status: string }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Users!A1:E`,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const header = rows[0] as string[];
  const emailIdx  = header.findIndex(h => h.toLowerCase() === 'email');
  const roleIdx   = header.findIndex(h => h.toLowerCase() === 'role');
  const nameIdx   = header.findIndex(h => h.toLowerCase() === 'name');
  const statusIdx = header.findIndex(h => h.toLowerCase() === 'status');
  return rows.slice(1).map((row: any[]) => ({
    email:  (row[emailIdx]  || '').toLowerCase().trim(),
    role:   (row[roleIdx]   || '').toLowerCase().trim(),
    name:    row[nameIdx]   || '',
    status: (row[statusIdx] || 'active').toLowerCase().trim(),
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
      res.json({ role: user.role, name: user.name, status: user.status, found: true });
    } else {
      res.json({ role: null, status: null, found: false, tabMissing: false });
    }
  } catch (err: any) {
    // Users tab likely doesn't exist yet — not a hard error
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
    const sheets = await getUncachableGoogleSheetClient();
    const submissionDate = new Date().toLocaleDateString('en-AU');

    // Add to Enrollment Requests tab
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

    // If the signed-in user's email is provided, add them to Users tab as Pending
    // so on next sign-in they see "pending approval" rather than the form again
    if (userEmail) {
      const existingUsers = await readUsersTab(sheetId);
      const alreadyExists = existingUsers.find(u => u.email === userEmail.toLowerCase().trim());
      if (!alreadyExists) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: 'Users!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              userEmail.toLowerCase().trim(),
              'parent',
              userName || parentName || '',
              submissionDate,
              'Pending',
            ]],
          },
        });
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
