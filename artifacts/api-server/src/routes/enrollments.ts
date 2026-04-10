import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();

const TAB = SHEET_TABS.enrollments;
const HEADERS = SHEET_HEADERS.enrollments;

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

async function readEnrollmentRows(spreadsheetId: string): Promise<{ _row: number;[k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A1:Z`,
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

function classStartsInMoreThan24Hours(classDate: string, classTime: string): boolean {
  if (!classDate) return true;
  const dateStr = classTime ? `${classDate} ${classTime}` : classDate;
  const classStart = new Date(dateStr);
  if (isNaN(classStart.getTime())) return true;
  const diffMs = classStart.getTime() - Date.now();
  return diffMs > 24 * 60 * 60 * 1000;
}

// GET /api/enrollments?sheetId=&parentEmail=&status=
router.get('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let rows = await readEnrollmentRows(spreadsheetId);
    if (req.query.parentEmail) {
      const email = (req.query.parentEmail as string).toLowerCase();
      rows = rows.filter(r => (r['Parent Email'] || '').toLowerCase() === email);
    }
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      rows = rows.filter(r => statuses.includes((r['Status'] || '').toLowerCase()));
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments — add a new enrollment row
router.post('/enrollments', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'Status') return req.body[h] || 'Active';
      if (h === 'Override Action') return '';
      return req.body[h] ?? '';
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments/:row/cancel — cancel with 24-hour check
router.post('/enrollments/:row/cancel', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const rows = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const moreThan24h = classStartsInMoreThan24Hours(
      enrollment['Class Date'],
      enrollment['Class Time']
    );
    const newStatus = moreThan24h ? 'Cancelled' : 'Late Cancellation';

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return newStatus;
      if (h === 'Override Action') return enrollment['Override Action'] || '';
      return enrollment[h] || '';
    });
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, status: newStatus, lateCancel: !moreThan24h });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollments/:row/override — principal waives or confirms fee
router.post('/enrollments/:row/override', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const rowNum = parseInt(req.params.row, 10);
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  const action = req.body.action as string;
  if (action !== 'Fee Waived' && action !== 'Fee Confirmed') {
    res.status(400).json({ error: 'action must be "Fee Waived" or "Fee Confirmed"' });
    return;
  }

  try {
    const rows = await readEnrollmentRows(spreadsheetId);
    const enrollment = rows.find(r => r._row === rowNum);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const sheets = await getUncachableGoogleSheetClient();
    const updatedValues = HEADERS.map(h => {
      if (h === 'Status') return action;
      if (h === 'Override Action') return action;
      return enrollment[h] || '';
    });
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });

    res.json({ ok: true, action });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
