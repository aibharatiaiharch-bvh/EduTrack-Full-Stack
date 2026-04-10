import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS, colLetter,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
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
    spreadsheetId, range, valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

async function deleteSheetRow(spreadsheetId: string, tabTitle: string, rowNum: number): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = meta.data.sheets?.find((s: any) => s.properties?.title === tabTitle);
  const sheetId = sheetMeta?.properties?.sheetId;
  if (sheetId === undefined) throw new Error(`Tab "${tabTitle}" not found`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
}

// GET /api/users?sheetId=X — list all users from Users tab
router.get('/users', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readRows(sheetId, SHEET_TABS.users);
    const users = rows.map(r => ({
      _row: r._row,
      userId: r['UserID'] || '',
      email: r['Email'] || '',
      role: r['Role'] || '',
      name: r['Name'] || '',
      addedDate: r['Added Date'] || '',
      status: r['Status'] || '',
    }));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/deactivate — set Status=Inactive and copy row to Archive tab
router.post('/users/deactivate', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.body;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const rows = await readRows(sheetId, SHEET_TABS.users);
    const user = rows.find(r => r['UserID'] === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // 1. Copy row to Archive tab
    const archivedDate = new Date().toLocaleDateString('en-AU');
    await appendRow(sheetId, SHEET_TABS.archive, [
      user['UserID'] || '',
      user['Email'] || '',
      user['Role'] || '',
      user['Name'] || '',
      user['Added Date'] || '',
      user['Status'] || '',
      archivedDate,
    ]);

    // 2. Set Status to Inactive in Users tab
    const statusCol = colLetter('users', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${user._row}`, 'Inactive');

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reactivate — set Status=Active in Users tab
router.post('/users/reactivate', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.body;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const rows = await readRows(sheetId, SHEET_TABS.users);
    const user = rows.find(r => r['UserID'] === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const statusCol = colLetter('users', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${user._row}`, 'Active');

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:userId?sheetId=X — hard delete (removes row from Users tab entirely)
router.delete('/users/:userId', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.params;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const rows = await readRows(sheetId, SHEET_TABS.users);
    const user = rows.find(r => r['UserID'] === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    await deleteSheetRow(sheetId, SHEET_TABS.users, user._row);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/archive?sheetId=X — list archived users
router.get('/users/archive', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readRows(sheetId, SHEET_TABS.archive);
    res.json(rows.map(r => ({
      _row: r._row,
      userId: r['UserID'] || '',
      email: r['Email'] || '',
      role: r['Role'] || '',
      name: r['Name'] || '',
      addedDate: r['Added Date'] || '',
      status: r['Status'] || '',
      archivedDate: r['Archived Date'] || '',
    })));
  } catch {
    res.json([]);
  }
});

export default router;
