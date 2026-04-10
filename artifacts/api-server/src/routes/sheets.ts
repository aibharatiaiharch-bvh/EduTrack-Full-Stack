import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, getUncachableGoogleDriveClient, SHEET_TABS, SHEET_HEADERS } from '../lib/googleSheets.js';

const router: IRouter = Router();

function tabName(key: string): string {
  return (SHEET_TABS as any)[key] || key;
}

function headers(key: string): string[] {
  return (SHEET_HEADERS as any)[key] || [];
}

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
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
          { properties: { title: SHEET_TABS.enrollments } },
        ],
      },
    });

    const spreadsheetId = createRes.data.spreadsheetId!;
    const spreadsheetUrl = createRes.data.spreadsheetUrl!;

    const data = [
      { range: `${SHEET_TABS.students}!A1`, values: [SHEET_HEADERS.students] },
      { range: `${SHEET_TABS.teachers}!A1`, values: [SHEET_HEADERS.teachers] },
      { range: `${SHEET_TABS.subjects}!A1`, values: [SHEET_HEADERS.subjects] },
      { range: `${SHEET_TABS.enrollments}!A1`, values: [SHEET_HEADERS.enrollments] },
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

// POST /api/sheets/seed — MUST be before /:tab to avoid Express matching "seed" as :tab
router.post('/sheets/seed', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();

    function dateFromNow(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    // Ensure all required tabs exist, add missing ones
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTabs = (meta.data.sheets || []).map((s: any) => s.properties?.title as string);
    const requiredTabs = Object.values(SHEET_TABS);
    const missingTabs = requiredTabs.filter(t => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingTabs.map(title => ({
            addSheet: { properties: { title } },
          })),
        },
      });
    }

    const studentRows = [
      ['Emma Johnson',  'emma.j@student.com',   'Mathematics, Science',          'Active', '555-0101', 'sarah.johnson@gmail.com'],
      ['Liam Smith',    'liam.s@student.com',    'Mathematics, English',           'Active', '555-0102', 'mike.smith@gmail.com'],
      ['Olivia Brown',  'olivia.b@student.com',  'Science, Art',                  'Active', '555-0103', 'lisa.brown@gmail.com'],
      ['Noah Davis',    'noah.d@student.com',     'English, Physical Education',   'Active', '555-0104', 'karen.davis@gmail.com'],
      ['Ava Wilson',    'ava.w@student.com',      'Mathematics, Art',              'Active', '555-0105', 'sarah.johnson@gmail.com'],
    ];

    const teacherRows = [
      ['Dr. Sarah Chen',       's.chen@edutrack.edu',    'Mathematics, Science',  'teacher',   'Active'],
      ['Mr. James Taylor',     'j.taylor@edutrack.edu',  'English',               'teacher',   'Active'],
      ['Ms. Rachel Kim',       'r.kim@edutrack.edu',     'Art, Physical Education','teacher',  'Active'],
      ['Principal Anderson',   'p.anderson@edutrack.edu','',                      'principal', 'Active'],
    ];

    const subjectRows = [
      ['Mathematics',        'Dr. Sarah Chen',   'Room 101', 'Mon, Wed, Fri', 'Active'],
      ['Science',            'Dr. Sarah Chen',   'Room 102', 'Tue, Thu',      'Active'],
      ['English',            'Mr. James Taylor', 'Room 201', 'Mon, Wed, Fri', 'Active'],
      ['Art',                'Ms. Rachel Kim',   'Room 301', 'Tue, Thu',      'Active'],
      ['Physical Education', 'Ms. Rachel Kim',   'Gym',      'Mon, Wed',      'Active'],
    ];

    const enrollmentRows = [
      ['Emma Johnson',  'Mathematics',        dateFromNow(7),  '10:00 AM', 'sarah.johnson@gmail.com', 'Active',           ''],
      ['Emma Johnson',  'Science',            dateFromNow(8),  '02:00 PM', 'sarah.johnson@gmail.com', 'Active',           ''],
      ['Liam Smith',    'Mathematics',        dateFromNow(5),  '10:00 AM', 'mike.smith@gmail.com',    'Active',           ''],
      ['Liam Smith',    'English',            dateFromNow(6),  '11:00 AM', 'mike.smith@gmail.com',    'Active',           ''],
      ['Olivia Brown',  'Science',            dateFromNow(9),  '02:00 PM', 'lisa.brown@gmail.com',    'Active',           ''],
      ['Olivia Brown',  'Art',                dateFromNow(10), '03:00 PM', 'lisa.brown@gmail.com',    'Active',           ''],
      ['Noah Davis',    'English',            dateFromNow(4),  '11:00 AM', 'karen.davis@gmail.com',   'Active',           ''],
      ['Ava Wilson',    'Art',                dateFromNow(11), '03:00 PM', 'sarah.johnson@gmail.com', 'Active',           ''],
      ['Noah Davis',    'Physical Education', dateFromNow(3),  '09:00 AM', 'karen.davis@gmail.com',   'Cancelled',        ''],
      ['Liam Smith',    'Physical Education', dateFromNow(1),  '10:00 AM', 'mike.smith@gmail.com',    'Late Cancellation',''],
      ['Olivia Brown',  'Mathematics',        dateFromNow(1),  '11:00 AM', 'lisa.brown@gmail.com',    'Late Cancellation',''],
      ['Emma Johnson',  'Physical Education', dateFromNow(2),  '09:00 AM', 'sarah.johnson@gmail.com', 'Fee Waived',       'Fee Waived'],
      ['Ava Wilson',    'English',            dateFromNow(2),  '11:00 AM', 'sarah.johnson@gmail.com', 'Fee Confirmed',    'Fee Confirmed'],
    ];

    const today = new Date().toLocaleDateString('en-AU');

    const userRows = [
      ['p.anderson@edutrack.edu', 'principal', 'Principal Anderson', today],
      ['s.chen@edutrack.edu',     'tutor',     'Dr. Sarah Chen',     today],
      ['j.taylor@edutrack.edu',   'tutor',     'Mr. James Taylor',   today],
      ['r.kim@edutrack.edu',      'tutor',     'Ms. Rachel Kim',     today],
      ['sarah.johnson@gmail.com', 'parent',    'Sarah Johnson',      today],
      ['mike.smith@gmail.com',    'parent',    'Mike Smith',         today],
    ];

    const enrollmentRequestRows: string[][] = [];

    const tabData: Array<{ tab: string; headers: string[]; rows: string[][] }> = [
      { tab: SHEET_TABS.students,             headers: SHEET_HEADERS.students,             rows: studentRows },
      { tab: SHEET_TABS.teachers,             headers: SHEET_HEADERS.teachers,             rows: teacherRows },
      { tab: SHEET_TABS.subjects,             headers: SHEET_HEADERS.subjects,             rows: subjectRows },
      { tab: SHEET_TABS.enrollments,          headers: SHEET_HEADERS.enrollments,          rows: enrollmentRows },
      { tab: SHEET_TABS.users,                headers: SHEET_HEADERS.users,                rows: userRows },
      { tab: SHEET_TABS.enrollment_requests,  headers: SHEET_HEADERS.enrollment_requests,  rows: enrollmentRequestRows },
    ];

    for (const { tab, headers, rows } of tabData) {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A1:Z` });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers, ...rows] },
      });
    }

    res.json({ ok: true, tabs: tabData.map(t => t.tab) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sheets/:tab — list all rows
router.get('/sheets/:tab', async (req, res): Promise<void> => {
  const { tab } = req.params;
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
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
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
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
router.put('/sheets/:tab/replace', async (req, res): Promise<void> => {
  const { tab } = req.params;
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
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
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
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
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
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
