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
// Users tab is written FIRST (master ID registry), then Teachers tab gets the same ID.
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
    let userId: string;

    if (emailNorm) {
      // Check if this email already has a Users tab entry — reuse their existing ID
      const users = await readRows(sheetId, SHEET_TABS.users);
      const existing = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (existing) {
        // Person already exists — reuse their ID so Teachers tab and Users tab stay in sync
        userId = existing['UserID'] || await generateUserId('tutor', sheetId);
      } else {
        // New person — generate ID and write to Users tab FIRST
        userId = await generateUserId('tutor', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'tutor', name.trim(), today, 'Active',
        ]);
      }
    } else {
      // No email — generate ID and register in Users tab without login ability
      userId = await generateUserId('tutor', sheetId);
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, '', 'tutor', name.trim(), today, 'Active',
      ]);
    }

    // Write to Teachers tab with the same UserID
    await appendRow(sheetId, SHEET_TABS.teachers, [
      userId,
      name.trim(),
      emailNorm,
      (subjects || '').trim(),
      (teacherRole || 'Tutor').trim(),
      'Active',
    ]);

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

    // Register in Users tab FIRST — master ID registry.
    // Students with an email can log in; without email the record exists but has no login.
    if (emailNorm) {
      const users = await readRows(sheetId, SHEET_TABS.users);
      const exists = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (!exists) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'student', name.trim(), today, 'Active',
        ]);
      }
    } else {
      // No email — still register ID so it is tracked centrally
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, '', 'student', name.trim(), today, 'Active',
      ]);
    }

    // Then write to Students tab with the same UserID
    await appendRow(sheetId, SHEET_TABS.students, [
      userId,
      name.trim(),
      emailNorm,
      '',
      'Active',
      (phone || '').trim(),
      (parentEmail || '').trim(),
    ]);

    res.json({ ok: true, userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principals/teachers?sheetId=X
// Returns all active teachers from the Teachers tab for dropdown population.
router.get('/principals/teachers', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readRows(sheetId, SHEET_TABS.teachers);
    const active = rows.filter(r => (r['Status'] || '').toLowerCase() === 'active');
    res.json(active);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
