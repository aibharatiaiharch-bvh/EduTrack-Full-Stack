import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, colLetter,
  readTabRows, appendRow, updateCell, readUsersTab, touchUser,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '';
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

// GET /api/users?sheetId=X — list all users from Users tab (master source of truth)
router.get('/users', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readUsersTab(sheetId);
    res.json(rows.map(u => ({
      _row:      u._row,
      userId:    u.userId,
      email:     u.email,
      role:      u.role,
      name:      u.name,
      status:    u.status,
      addedDate: u.createdAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/deactivate — set Status=Inactive, archive snapshot, update UpdatedAt
router.post('/users/deactivate', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.body;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const users = await readUsersTab(sheetId);
    const user = users.find(u => u.userId === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // 1. Append snapshot to Archive tab (best-effort — skip if tab doesn't exist yet)
    const now = new Date().toISOString();
    const archiveId = `ARC-${Date.now()}`;
    try {
      await appendRow(sheetId, SHEET_TABS.archive, [
        archiveId, user.userId, user.email, user.role, user.name, user.status, now,
      ]);
    } catch { /* Archive tab may not exist — deactivation still proceeds */ }

    // 2. Set Status=Inactive in Users tab (master) + update audit column
    const statusCol = colLetter('users', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${user._row}`, 'Inactive');
    await touchUser(sheetId, user._row);

    const enrollments = await readTabRows(sheetId, SHEET_TABS.enrollments);
    const userEnrollments = enrollments.filter(r => (r['UserID'] || '') === userId).sort((a, b) => b._row - a._row);
    for (const enrollment of userEnrollments) {
      await deleteSheetRow(sheetId, SHEET_TABS.enrollments, enrollment._row);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reactivate — set Status=Active (Users tab is the login gate)
router.post('/users/reactivate', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.body;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const users = await readUsersTab(sheetId);
    const user = users.find(u => u.userId === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const statusCol = colLetter('users', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${user._row}`, 'Active');
    await touchUser(sheetId, user._row);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:userId?sheetId=X — hard delete from Users tab
router.delete('/users/:userId', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId } = req.params;
  if (!sheetId || !userId) { res.status(400).json({ error: 'sheetId and userId are required' }); return; }

  try {
    const rows = await readTabRows(sheetId, SHEET_TABS.users);
    const user = rows.find(r => r['UserID'] === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    await deleteSheetRow(sheetId, SHEET_TABS.users, user._row);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/archive?sheetId=X — list archived user snapshots
router.get('/users/archive', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readTabRows(sheetId, SHEET_TABS.archive);
    res.json(rows.map(r => ({
      _row:        r._row,
      archiveId:   r['ArchiveID']  || '',
      userId:      r['UserID']     || '',
      email:       r['Email']      || '',
      role:        r['Role']       || '',
      name:        r['Name']       || '',
      status:      r['Status']     || '',
      archivedAt:  r['ArchivedAt'] || '',
      // legacy alias
      addedDate:   r['ArchivedAt'] || '',
      archivedDate: r['ArchivedAt'] || '',
    })));
  } catch {
    res.json([]);
  }
});

export default router;
