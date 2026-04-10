import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient } from '../lib/googleSheets.js';

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

// POST /api/principals/add-teacher
// Adds a teacher to the Teachers tab and to the Users tab (role: tutor)
router.post('/principals/add-teacher', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, subjects, role: teacherRole } = req.body as {
    name?: string; email?: string; subjects?: string; role?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const today = new Date().toLocaleDateString('en-AU');

  try {
    // Add to Teachers tab: Name, Email, Subjects, Role, Status
    await appendRow(sheetId, 'Teachers', [
      name.trim(),
      (email || '').trim(),
      (subjects || '').trim(),
      (teacherRole || 'Tutor').trim(),
      'Active',
    ]);

    // Add to Users tab if an email was provided (so they can log in)
    if (email && email.trim()) {
      const users = await readRows(sheetId, 'Users');
      const emailNorm = email.trim().toLowerCase();
      const exists = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (!exists) {
        await appendRow(sheetId, 'Users', [
          emailNorm,
          'tutor',
          name.trim(),
          today,
          'Active',
        ]);
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/principals/add-student
// Adds a student to the Students tab
router.post('/principals/add-student', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, phone, parentEmail } = req.body as {
    name?: string; email?: string; phone?: string; parentEmail?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  try {
    // Add to Students tab: Name, Email, Classes, Status, Phone, Parent Email
    await appendRow(sheetId, 'Students', [
      name.trim(),
      (email || '').trim(),
      '',
      'Active',
      (phone || '').trim(),
      (parentEmail || '').trim(),
    ]);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
