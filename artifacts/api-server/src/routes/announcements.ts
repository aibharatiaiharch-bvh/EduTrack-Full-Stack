import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();
const TAB = SHEET_TABS.announcements;

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || req.headers['x-sheet-id'] || '';
}

// GET /api/announcements?sheetId= — returns all active announcements
router.get('/announcements', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    let result: any;
    try {
      result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${TAB}!A1:Z`,
      });
    } catch {
      // Tab may not exist yet — return empty list gracefully
      res.json([]);
      return;
    }

    const rows = result.data.values || [];
    if (rows.length < 1) { res.json([]); return; }

    const headers = rows[0] as string[];
    const data = rows.slice(1).map((row: string[], i: number) => {
      const obj: any = { _row: i + 2 };
      headers.forEach((h, idx) => { obj[h] = (row as string[])[idx] || ''; });
      return obj;
    });

    const active = data.filter((a: any) => (a['IsActive'] || '').toLowerCase() === 'true');
    res.json(active);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
