import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();
const TAB = SHEET_TABS.subjects;
const HEADERS = SHEET_HEADERS.subjects;

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || req.headers['x-sheet-id'] || '';
}

async function readSubjectRows(spreadsheetId: string): Promise<{ _row: number; [k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A1:Z` });
  const rows = res.data.values || [];
  if (rows.length < 1) return [];
  const headerRow = rows[0] as string[];
  return rows.slice(1).map((row, i) => {
    const obj: any = { _row: i + 2 };
    headerRow.forEach((h, idx) => { obj[h] = (row as string[])[idx] || ''; });
    return obj;
  });
}

async function generateSubjectId(spreadsheetId: string): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();
  let max = 0;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A2:A` });
    (res.data.values || []).forEach((row: any[]) => {
      if (row[0] && String(row[0]).startsWith('SUB-')) {
        const num = parseInt(String(row[0]).slice(4), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  } catch {}
  return `SUB-${String(max + 1).padStart(3, '0')}`;
}

// GET /api/subjects/with-capacity?sheetId= — returns subjects with live enrollment counts
// Must be registered BEFORE /subjects to avoid route conflicts
router.get('/subjects/with-capacity', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();

    // Read subjects
    let subjects = await readSubjectRows(spreadsheetId);
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      subjects = subjects.filter(s => statuses.includes((s['Status'] || '').toLowerCase()));
    }

    // Read enrollments to count active seats per class
    let enrollmentRows: any[] = [];
    try {
      const eRes = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `${SHEET_TABS.enrollments}!A1:Z`,
      });
      const eData = eRes.data.values || [];
      if (eData.length > 0) {
        const eHeaders = eData[0] as string[];
        enrollmentRows = eData.slice(1).map(row => {
          const obj: any = {};
          eHeaders.forEach((h, i) => { obj[h] = (row as string[])[i] || ''; });
          return obj;
        }).filter(r => (r['Status'] || '').toLowerCase() === 'active');
      }
    } catch {}

    const withCapacity = subjects.map(s => {
      const maxCap = parseInt(s['MaxCapacity'] || '8', 10) || 8;
      const enrolled = enrollmentRows.filter(e =>
        (e['Class Name'] || '').toLowerCase() === (s['Name'] || '').toLowerCase() &&
        (e['Class Type'] || '').toLowerCase() === (s['Type'] || '').toLowerCase() &&
        (e['Teacher'] || '').toLowerCase() === (s['Teachers'] || '').toLowerCase()
      ).length;
      return { ...s, MaxCapacity: maxCap, currentEnrolled: enrolled, isFull: enrolled >= maxCap };
    });

    res.json(withCapacity);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subjects?sheetId=&status=
// Returns all (or filtered) subjects. No auth required — used by the enrollment form.
router.get('/subjects', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  try {
    let rows = await readSubjectRows(spreadsheetId);
    if (req.query.status) {
      const statuses = (req.query.status as string).split(',').map(s => s.trim().toLowerCase());
      rows = rows.filter(r => statuses.includes((r['Status'] || '').toLowerCase()));
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subjects — principal creates a new subject
router.post('/subjects', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { name, type, teachers, room, days, maxCapacity } = req.body as {
    name?: string; type?: string; teachers?: string; room?: string; days?: string; maxCapacity?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: 'Subject name is required' }); return; }
  if (!type || !['Group', 'Individual', 'Both'].includes(type)) {
    res.status(400).json({ error: 'type must be Group, Individual, or Both' }); return;
  }

  try {
    const subjectId = await generateSubjectId(spreadsheetId);
    const sheets = await getUncachableGoogleSheetClient();
    const rowValues = HEADERS.map(h => {
      if (h === 'SubjectID') return subjectId;
      if (h === 'Name')      return name.trim();
      if (h === 'Type')      return type;
      if (h === 'Teachers')  return (teachers || '').trim();
      if (h === 'Room')      return (room || '').trim();
      if (h === 'Days')        return (days || '').trim();
      if (h === 'Status')      return 'Active';
      if (h === 'MaxCapacity') return (maxCapacity || '8').trim();
      return '';
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
    res.json({ ok: true, subjectId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/subjects/:row — update subject fields (status, teachers, etc.)
router.patch('/subjects/:row', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (isNaN(rowNum) || rowNum < 2) { res.status(400).json({ error: 'Invalid row' }); return; }

  try {
    const rows = await readSubjectRows(spreadsheetId);
    const subject = rows.find(r => r._row === rowNum);
    if (!subject) { res.status(404).json({ error: 'Subject not found' }); return; }

    const updated = { ...subject, ...req.body };
    const updatedValues = HEADERS.map(h => updated[h] || '');
    const sheets = await getUncachableGoogleSheetClient();
    const colLetter = String.fromCharCode(64 + HEADERS.length);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNum}:${colLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedValues] },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
