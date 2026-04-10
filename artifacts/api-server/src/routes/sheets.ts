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

    // Students: ['UserID', 'Name', 'Email', 'Classes', 'Status', 'Phone', 'Parent Email']
    const studentRows = [
      ['STU-001', 'Emma Johnson',  'emma.j@student.com',  'Mathematics, Science',        'Active', '555-0101', 'sarah.johnson@gmail.com'],
      ['STU-002', 'Liam Smith',    'liam.s@student.com',  'Mathematics, English',         'Active', '555-0102', 'mike.smith@gmail.com'],
      ['STU-003', 'Olivia Brown',  'olivia.b@student.com','Science, Art',                'Active', '555-0103', 'lisa.brown@gmail.com'],
      ['STU-004', 'Noah Davis',    'noah.d@student.com',  'English, Physical Education',  'Active', '555-0104', 'karen.davis@gmail.com'],
      ['STU-005', 'Ava Wilson',    'ava.w@student.com',   'Mathematics, Art',             'Active', '555-0105', 'sarah.johnson@gmail.com'],
    ];

    // Teachers: ['UserID', 'Name', 'Email', 'Subjects', 'Role', 'Status', 'Zoom Link']
    const teacherRows = [
      ['TCH-001', 'Dr. Sarah Chen',     's.chen@edutrack.edu',    'Mathematics, Science',   'teacher',   'Active', ''],
      ['TCH-002', 'Mr. James Taylor',   'j.taylor@edutrack.edu',  'English',                'teacher',   'Active', ''],
      ['TCH-003', 'Ms. Rachel Kim',     'r.kim@edutrack.edu',     'Art, Physical Education','teacher',   'Active', ''],
      ['PRN-001', 'Principal Anderson', 'p.anderson@edutrack.edu','',                       'principal', 'Active', ''],
    ];

    // Subjects: ['SubjectID', 'Name', 'Type', 'Teachers', 'Room', 'Days', 'Status']
    const subjectRows = [
      ['SUB-001', 'Mathematics',        'Individual', 'Dr. Sarah Chen',   'Room 101', 'Mon, Wed, Fri', 'Active'],
      ['SUB-002', 'Science',            'Group',      'Dr. Sarah Chen',   'Room 102', 'Tue, Thu',      'Active'],
      ['SUB-003', 'English',            'Both',       'Mr. James Taylor', 'Room 201', 'Mon, Wed, Fri', 'Active'],
      ['SUB-004', 'Art',                'Group',      'Ms. Rachel Kim',   'Room 301', 'Tue, Thu',      'Active'],
      ['SUB-005', 'Physical Education', 'Group',      'Ms. Rachel Kim',   'Gym',      'Mon, Wed',      'Active'],
    ];

    // Enrollments: ['Student Name','Class Name','Class Date','Class Time','Parent Email','Status','Override Action','Teacher','Teacher Email','Zoom Link','Class Type']
    const enrollmentRows = [
      ['Emma Johnson',  'Mathematics',        dateFromNow(7),  '10:00 AM', 'sarah.johnson@gmail.com', 'Active',           '', 'Dr. Sarah Chen',   's.chen@edutrack.edu',   '', 'Individual'],
      ['Emma Johnson',  'Science',            dateFromNow(8),  '02:00 PM', 'sarah.johnson@gmail.com', 'Active',           '', 'Dr. Sarah Chen',   's.chen@edutrack.edu',   '', 'Group'],
      ['Liam Smith',    'Mathematics',        dateFromNow(5),  '10:00 AM', 'mike.smith@gmail.com',    'Active',           '', 'Dr. Sarah Chen',   's.chen@edutrack.edu',   '', 'Individual'],
      ['Liam Smith',    'English',            dateFromNow(6),  '11:00 AM', 'mike.smith@gmail.com',    'Active',           '', 'Mr. James Taylor', 'j.taylor@edutrack.edu', '', 'Group'],
      ['Olivia Brown',  'Science',            dateFromNow(9),  '02:00 PM', 'lisa.brown@gmail.com',    'Active',           '', 'Dr. Sarah Chen',   's.chen@edutrack.edu',   '', 'Group'],
      ['Olivia Brown',  'Art',                dateFromNow(10), '03:00 PM', 'lisa.brown@gmail.com',    'Active',           '', 'Ms. Rachel Kim',   'r.kim@edutrack.edu',    '', 'Group'],
      ['Noah Davis',    'English',            dateFromNow(4),  '11:00 AM', 'karen.davis@gmail.com',   'Active',           '', 'Mr. James Taylor', 'j.taylor@edutrack.edu', '', 'Group'],
      ['Ava Wilson',    'Art',                dateFromNow(11), '03:00 PM', 'sarah.johnson@gmail.com', 'Active',           '', 'Ms. Rachel Kim',   'r.kim@edutrack.edu',    '', 'Individual'],
      ['Noah Davis',    'Physical Education', dateFromNow(3),  '09:00 AM', 'karen.davis@gmail.com',   'Cancelled',        '', '',                 '',                      '', 'Group'],
      ['Liam Smith',    'Physical Education', dateFromNow(1),  '10:00 AM', 'mike.smith@gmail.com',    'Late Cancellation','', '',                 '',                      '', 'Group'],
      ['Olivia Brown',  'Mathematics',        dateFromNow(1),  '11:00 AM', 'lisa.brown@gmail.com',    'Late Cancellation','', 'Dr. Sarah Chen',   's.chen@edutrack.edu',   '', 'Individual'],
      ['Emma Johnson',  'Physical Education', dateFromNow(2),  '09:00 AM', 'sarah.johnson@gmail.com', 'Fee Waived',       'Fee Waived', '',        '',                      '', 'Group'],
      ['Ava Wilson',    'English',            dateFromNow(2),  '11:00 AM', 'sarah.johnson@gmail.com', 'Fee Confirmed',    'Fee Confirmed', 'Mr. James Taylor', 'j.taylor@edutrack.edu', '', 'Individual'],
    ];

    const today = new Date().toLocaleDateString('en-AU');

    // Users: ['UserID', 'Email', 'Role', 'Name', 'Added Date', 'Status']
    const userRows = [
      ['PRN-001', 'p.anderson@edutrack.edu', 'principal', 'Principal Anderson', today, 'Active'],
      ['TCH-001', 's.chen@edutrack.edu',     'tutor',     'Dr. Sarah Chen',     today, 'Active'],
      ['TCH-002', 'j.taylor@edutrack.edu',   'tutor',     'Mr. James Taylor',   today, 'Active'],
      ['TCH-003', 'r.kim@edutrack.edu',      'tutor',     'Ms. Rachel Kim',     today, 'Active'],
      ['PAR-001', 'sarah.johnson@gmail.com', 'parent',    'Sarah Johnson',      today, 'Active'],
      ['PAR-002', 'mike.smith@gmail.com',    'parent',    'Mike Smith',         today, 'Active'],
    ];

    const enrollmentRequestRows: string[][] = [];

    const parentRows = [
      ['sarah.johnson@gmail.com', 'Sarah Johnson', '555-0201', 'Emma Johnson; Ava Wilson', today, 'Active'],
      ['mike.smith@gmail.com',    'Mike Smith',    '555-0202', 'Liam Smith',               today, 'Active'],
      ['lisa.brown@gmail.com',    'Lisa Brown',    '555-0203', 'Olivia Brown',             today, 'Active'],
      ['karen.davis@gmail.com',   'Karen Davis',   '555-0204', 'Noah Davis',               today, 'Active'],
    ];

    const tabData: Array<{ tab: string; headers: string[]; rows: string[][] }> = [
      { tab: SHEET_TABS.students,             headers: SHEET_HEADERS.students,             rows: studentRows },
      { tab: SHEET_TABS.teachers,             headers: SHEET_HEADERS.teachers,             rows: teacherRows },
      { tab: SHEET_TABS.subjects,             headers: SHEET_HEADERS.subjects,             rows: subjectRows },
      { tab: SHEET_TABS.enrollments,          headers: SHEET_HEADERS.enrollments,          rows: enrollmentRows },
      { tab: SHEET_TABS.users,                headers: SHEET_HEADERS.users,                rows: userRows },
      { tab: SHEET_TABS.enrollment_requests,  headers: SHEET_HEADERS.enrollment_requests,  rows: enrollmentRequestRows },
      { tab: SHEET_TABS.parents,              headers: SHEET_HEADERS.parents,              rows: parentRows },
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

// POST /api/sheets/ensure-headers — safe: adds missing tabs, writes headers to blank tabs,
// and inserts the UserID column at position A for tabs that already have data but are missing it.
const USER_ID_TABS = new Set(['students', 'teachers', 'users']);

router.post('/sheets/ensure-headers', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();

    // Step 1: Add any missing tabs
    let meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTabs = (meta.data.sheets || []).map((s: any) => s.properties?.title as string);
    const requiredTabs = Object.values(SHEET_TABS);
    const missingTabs = requiredTabs.filter(t => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: missingTabs.map(title => ({ addSheet: { properties: { title } } })) },
      });
      // Refresh meta so we have sheetIds for newly added tabs
      meta = await sheets.spreadsheets.get({ spreadsheetId });
    }

    // Step 2: For each tab, check existing headers and fix as needed
    const tabKeys = Object.keys(SHEET_TABS) as (keyof typeof SHEET_TABS)[];
    const headerWrites: { range: string; values: string[][] }[] = [];
    const columnsInserted: string[] = [];

    for (const key of tabKeys) {
      const tabTitle = tabName(key);
      const hdrs = headers(key);
      if (!hdrs || !hdrs.length) continue;

      try {
        const existing = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${tabTitle}!A1:Z1`,
        });
        const existingRow = (existing.data.values?.[0] || []).map(String);
        const firstCell = existingRow[0]?.trim() || '';

        if (!firstCell) {
          // Blank tab — write full header row
          headerWrites.push({ range: `${tabTitle}!A1`, values: [hdrs] });
        } else if (USER_ID_TABS.has(key) && firstCell !== 'UserID') {
          // Existing tab with data but missing UserID in column A — insert column before existing data
          const sheetGid = (meta.data.sheets || []).find((s: any) => s.properties?.title === tabTitle)?.properties?.sheetId;
          if (sheetGid !== undefined) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: {
                requests: [{
                  insertDimension: {
                    range: { sheetId: sheetGid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                    inheritFromBefore: false,
                  },
                }],
              },
            });
            await sheets.spreadsheets.values.update({
              spreadsheetId, range: `${tabTitle}!A1`,
              valueInputOption: 'RAW',
              requestBody: { values: [['UserID']] },
            });
            columnsInserted.push(tabTitle);
          }
        }
      } catch {}
    }

    if (headerWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: headerWrites.map(({ range, values }) => ({ range, values })),
        },
      });
    }

    res.json({
      ok: true,
      tabsAdded: missingTabs,
      headersAdded: headerWrites.map(h => h.range),
      columnsInserted,
    });
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
