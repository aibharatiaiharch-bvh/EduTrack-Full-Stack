import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, generateUserId } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
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

// POST /api/principals/add-teacher
// Adds a teacher to the Teachers tab (with UserID) and creates a Users tab entry (role: tutor)
router.post('/principals/add-teacher', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, subjects, role: teacherRole } = req.body as {
    name?: string; email?: string; subjects?: string; role?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const today = new Date().toLocaleDateString('en-AU');
  const emailNorm = (email || '').trim().toLowerCase();

  try {
    // Generate a unique teacher UserID
    const userId = await generateUserId('tutor', sheetId);

    // Add to Teachers tab: UserID, Name, Email, Subjects, Role, Status
    await appendRow(sheetId, SHEET_TABS.teachers, [
      userId,
      name.trim(),
      emailNorm,
      (subjects || '').trim(),
      (teacherRole || 'Tutor').trim(),
      'Active',
    ]);

    // Add to Users tab so they can log in (skip if email already exists)
    if (emailNorm) {
      const users = await readRows(sheetId, SHEET_TABS.users);
      const exists = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (!exists) {
        // Reuse same UserID so Users tab and Teachers tab share the same ID
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'tutor', name.trim(), today, 'Active',
        ]);
      }
    }

    res.json({ ok: true, userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/principals/add-student
// Adds a student to the Students tab with a unique UserID.
// If an email is provided, also creates a Users tab entry (role: student) so they can log in later.
router.post('/principals/add-student', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, phone, parentEmail } = req.body as {
    name?: string; email?: string; phone?: string; parentEmail?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const emailNorm = (email || '').trim().toLowerCase();
  const today = new Date().toLocaleDateString('en-AU');

  try {
    // Generate a unique student UserID
    const userId = await generateUserId('student', sheetId);

    // Add to Students tab: UserID, Name, Email, Classes, Status, Phone, Parent Email
    await appendRow(sheetId, SHEET_TABS.students, [
      userId,
      name.trim(),
      emailNorm,
      '',
      'Active',
      (phone || '').trim(),
      (parentEmail || '').trim(),
    ]);

    // If a student email was given, also add to Users tab (role: student) so they can log in
    if (emailNorm) {
      const users = await readRows(sheetId, SHEET_TABS.users);
      const exists = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (!exists) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'student', name.trim(), today, 'Active',
        ]);
      }
    }

    res.json({ ok: true, userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
