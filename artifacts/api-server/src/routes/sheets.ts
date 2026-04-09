import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, getUncachableGoogleDriveClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();

function tabName(key: string): string {
  return (SHEET_TABS as any)[key] || key;
}

function headers(key: string): string[] {
  return (SHEET_HEADERS as any)[key] || [];
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
    headerRow.forEach((h, idx) => {
      obj[h] = (row as string[])[idx] || '';
    });
    return obj;
  });
}

// GET /api/sheets/drive-files — list all spreadsheets in the user's Drive
router.get('/sheets/drive-files', async (_req, res): Promise<void> => {
  try {
    const drive = await getUncachableGoogleDriveClient();
    const result = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id,name,modifiedTime,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });
    res.json({ files: result.data.files || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sheets/setup — create a new spreadsheet with EduTrack tabs
router.post('/sheets/setup', async (req, res): Promise<void> => {
  try {
    const sheets = await getUncachableGoogleSheetClient();

    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: 'EduTrack Data' },
        sheets: [
          { properties: { title: SHEET_TABS.students } },
          { properties: { title: SHEET_TABS.teachers } },
          { properties: { title: SHEET_TABS.subjects } },
        ],
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const spreadsheetUrl = createRes.data.spreadsheetUrl!;

    const data = [
      { range: `${SHEET_TABS.students}!A1`, values: [SHEET_HEADERS.students] },
      { range: `${SHEET_TABS.teachers}!A1`, values: [SHEET_HEADERS.teachers] },
      { range: `${SHEET_TABS.subjects}!A1`, values: [SHEET_HEADERS.subjects] },
    ];
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data },
    });

    res.json({ spreadsheetId, spreadsheetUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sheets/:tab — list all rows
router.get('/sheets/:tab', async (req, res): Promise<void> => {
  const { tab } = req.params;
  const spreadsheetId = req.headers['x-sheet-id'] as string;
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing x-sheet-id header' }); return; }
  if (!SHEET_TABS[tab as keyof typeof SHEET_TABS]) { res.status(400).json({ error: 'Unknown tab' }); return; }
  try {
    const rows = await readRows(spreadsheetId, tabName(tab));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sheets/:tab — append a new row
router.post('/sheets/:tab', async (req, res): Promise<void> => {
  const { tab } = req.params;
  const spreadsheetId = req.headers['x-sheet-id'] as string;
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing x-sheet-id header' }); return; }
  if (!SHEET_TABS[tab as keyof typeof SHEET_TABS]) { res.status(400).json({ error: 'Unknown tab' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const hdrs = headers(tab);
    const rowValues = hdrs.map((h) => req.body[h] ?? '');
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName(tab)}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sheets/:tab/replace — MUST be before /:tab/:row to avoid Express matching "replace" as :row
// Replaces ALL data rows (keeps header row, rewrites data)
router.put('/sheets/:tab/replace', async (req, res): Promise<void> => {
  const { tab } = req.params;
  const spreadsheetId = req.headers['x-sheet-id'] as string;
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing x-sheet-id header' }); return; }
  if (!SHEET_TABS[tab as keyof typeof SHEET_TABS]) { res.status(400).json({ error: 'Unknown tab' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const hdrs = headers(tab);
    const rows: any[] = req.body.rows || [];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName(tab)}!A2:Z`,
    });

    if (rows.length > 0) {
      const values = rows.map((row: any) => hdrs.map((h) => row[h] ?? ''));
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName(tab)}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }

    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sheets/:tab/:row — update a specific row by row number
router.put('/sheets/:tab/:row', async (req, res): Promise<void> => {
  const { tab, row } = req.params;
  const spreadsheetId = req.headers['x-sheet-id'] as string;
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing x-sheet-id header' }); return; }
  if (!SHEET_TABS[tab as keyof typeof SHEET_TABS]) { res.status(400).json({ error: 'Unknown tab' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const hdrs = headers(tab);
    const rowValues = hdrs.map((h) => req.body[h] ?? '');
    const range = `${tabName(tab)}!A${row}:${String.fromCharCode(64 + hdrs.length)}${row}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sheets/:tab/:row — delete a row by sheet row number
router.delete('/sheets/:tab/:row', async (req, res): Promise<void> => {
  const { tab, row } = req.params;
  const spreadsheetId = req.headers['x-sheet-id'] as string;
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing x-sheet-id header' }); return; }
  if (!SHEET_TABS[tab as keyof typeof SHEET_TABS]) { res.status(400).json({ error: 'Unknown tab' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetMeta = meta.data.sheets?.find((s) => s.properties?.title === tabName(tab));
    const sheetId = sheetMeta?.properties?.sheetId;
    if (sheetId === undefined) { res.status(404).json({ error: 'Sheet tab not found' }); return; }

    const rowIndex = parseInt(row, 10) - 1;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        }],
      },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
