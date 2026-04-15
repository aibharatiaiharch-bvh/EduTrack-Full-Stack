import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, getUncachableGoogleDriveClient, SHEET_TABS, SHEET_HEADERS, readUsersTab } from '../lib/googleSheets.js';

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

// ─── Internal helper: build seed data rows (shared by setup + seed endpoints) ──
function buildSeedData() {
  function dateFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const today  = new Date().toLocaleDateString('en-AU');
  const nowIso = new Date().toISOString();

  const userRows = [
    ['PRN-001', 'p.anderson@edutrack.edu', 'principal', 'Principal Anderson', 'Active',   today, nowIso],
    ['TCH-001', 's.chen@edutrack.edu',     'tutor',     'Dr. Sarah Chen',     'Active',   today, nowIso],
    ['TCH-002', 'j.taylor@edutrack.edu',   'tutor',     'Mr. James Taylor',   'Active',   today, nowIso],
    ['TCH-003', 'r.kim@edutrack.edu',      'tutor',     'Ms. Rachel Kim',     'Active',   today, nowIso],
    ['PAR-001', 'sarah.johnson@gmail.com', 'parent',    'Sarah Johnson',      'Active',   today, nowIso],
    ['PAR-002', 'mike.smith@gmail.com',    'parent',    'Mike Smith',         'Active',   today, nowIso],
    ['PAR-003', 'lisa.brown@gmail.com',    'parent',    'Lisa Brown',         'Active',   today, nowIso],
    ['PAR-004', 'karen.davis@gmail.com',   'parent',    'Karen Davis',        'Active',   today, nowIso],
    ['PAR-005', 'james.martin@gmail.com',  'parent',    'James Martin',       'Inactive', today, nowIso],
    ['STU-001', 'emma.j@student.com',      'student',   'Emma Johnson',       'Active',   today, nowIso],
    ['STU-002', 'liam.s@student.com',      'student',   'Liam Smith',         'Active',   today, nowIso],
    ['STU-003', 'olivia.b@student.com',    'student',   'Olivia Brown',       'Active',   today, nowIso],
    ['STU-004', 'noah.d@student.com',      'student',   'Noah Davis',         'Active',   today, nowIso],
    ['STU-005', 'ava.w@student.com',       'student',   'Ava Wilson',         'Inactive', today, nowIso],
  ];
  const studentRows = [
    ['STU-001', 'STU-001', 'PAR-001', 'SUB-001; SUB-005', '555-0101', ''],
    ['STU-002', 'STU-002', 'PAR-002', 'SUB-001; SUB-004', '555-0102', ''],
    ['STU-003', 'STU-003', 'PAR-003', 'SUB-005; SUB-007', '555-0103', ''],
    ['STU-004', 'STU-004', 'PAR-004', 'SUB-004',          '555-0104', ''],
    ['STU-005', 'STU-005', 'PAR-001', 'SUB-006',          '555-0105', ''],
  ];
  const teacherRows = [
    ['TCH-001', 'TCH-001', 'Mathematics, Science',    'https://zoom.us/j/555001', 'STEM',          ''],
    ['TCH-002', 'TCH-002', 'English',                 'https://zoom.us/j/555002', 'Literacy',      ''],
    ['TCH-003', 'TCH-003', 'Art, Physical Education', '',                         'Creative Arts', ''],
  ];
  const parentRows = [
    ['PAR-001', 'PAR-001', 'STU-001; STU-005', '555-0201', ''],
    ['PAR-002', 'PAR-002', 'STU-002',          '555-0202', ''],
    ['PAR-003', 'PAR-003', 'STU-003',          '555-0203', ''],
    ['PAR-004', 'PAR-004', 'STU-004',          '555-0204', ''],
    ['PAR-005', 'PAR-005', '',                 '555-0301', ''],
  ];
  const subjectRows = [
    ['SUB-001', 'Mathematics',        'Individual', 'TCH-001', 'Room 101', 'Mon, Wed',      'Active', '1'],
    ['SUB-002', 'Mathematics',        'Group',      'TCH-001', 'Room 101', 'Tue, Thu',      'Active', '8'],
    ['SUB-003', 'English',            'Individual', 'TCH-002', 'Room 201', 'Mon, Wed',      'Active', '1'],
    ['SUB-004', 'English',            'Group',      'TCH-002', 'Room 201', 'Tue, Thu, Fri', 'Active', '8'],
    ['SUB-005', 'Science',            'Group',      'TCH-001', 'Lab 1',    'Fri',           'Active', '8'],
    ['SUB-006', 'Art',                'Individual', 'TCH-003', 'Studio',   'Wed',           'Active', '1'],
    ['SUB-007', 'Art',                'Group',      'TCH-003', 'Studio',   'Thu',           'Active', '8'],
    ['SUB-008', 'Physical Education', 'Group',      'TCH-003', 'Gym',      'Mon, Fri',      'Active', '8'],
  ];
  const enrollmentRows = [
    ['ENR-001', 'STU-001', 'SUB-001', 'PAR-001', 'Active',   nowIso, '',           'TCH-001', 's.chen@edutrack.edu',   'https://zoom.us/j/555001', 'Individual', dateFromNow(7),  '10:00 AM'],
    ['ENR-002', 'STU-001', 'SUB-005', 'PAR-001', 'Active',   nowIso, '',           'TCH-001', 's.chen@edutrack.edu',   'https://zoom.us/j/555001', 'Group',      dateFromNow(8),  '02:00 PM'],
    ['ENR-003', 'STU-002', 'SUB-001', 'PAR-002', 'Inactive', nowIso, '',           'TCH-001', 's.chen@edutrack.edu',   'https://zoom.us/j/555001', 'Individual', dateFromNow(5),  '10:00 AM'],
    ['ENR-004', 'STU-002', 'SUB-004', 'PAR-002', 'Active',   nowIso, '',           'TCH-002', 'j.taylor@edutrack.edu', 'https://zoom.us/j/555002', 'Group',      dateFromNow(6),  '11:00 AM'],
    ['ENR-005', 'STU-003', 'SUB-005', 'PAR-003', 'Active',   nowIso, '',           'TCH-001', 's.chen@edutrack.edu',   'https://zoom.us/j/555001', 'Group',      dateFromNow(9),  '02:00 PM'],
    ['ENR-006', 'STU-003', 'SUB-007', 'PAR-003', 'Pending',  nowIso, '',           'TCH-003', 'r.kim@edutrack.edu',    '',                         'Group',      dateFromNow(10), '03:00 PM'],
    ['ENR-007', 'STU-004', 'SUB-004', 'PAR-004', 'Active',   nowIso, '',           'TCH-002', 'j.taylor@edutrack.edu', 'https://zoom.us/j/555002', 'Group',      dateFromNow(4),  '11:00 AM'],
    ['ENR-008', 'STU-005', 'SUB-006', 'PAR-001', 'Inactive', nowIso, '',           'TCH-003', 'r.kim@edutrack.edu',    '',                         'Individual', dateFromNow(11), '03:00 PM'],
    ['ENR-009', 'STU-004', 'SUB-008', 'PAR-004', 'Active',   nowIso, '',           'TCH-003', 'r.kim@edutrack.edu',    '',                         'Group',      dateFromNow(3),  '09:00 AM'],
    ['ENR-010', 'STU-002', 'SUB-008', 'PAR-002', 'Pending',  nowIso, '',           'TCH-003', 'r.kim@edutrack.edu',    '',                         'Group',      dateFromNow(1),  '10:00 AM'],
    ['ENR-011', 'STU-003', 'SUB-001', 'PAR-003', 'Pending',  nowIso, '',           'TCH-001', 's.chen@edutrack.edu',   'https://zoom.us/j/555001', 'Individual', dateFromNow(1),  '11:00 AM'],
    ['ENR-012', 'STU-001', 'SUB-008', 'PAR-001', 'Active',   nowIso, 'Fee Waived', 'TCH-003', 'r.kim@edutrack.edu',    '',                         'Group',      dateFromNow(2),  '09:00 AM'],
    ['ENR-013', 'STU-005', 'SUB-004', 'PAR-001', 'Inactive', nowIso, 'Fee Confirmed','TCH-002', 'j.taylor@edutrack.edu', 'https://zoom.us/j/555002', 'Individual', dateFromNow(2),  '11:00 AM'],
  ];
  const enrollmentRequestRows = [
    ['REQ-001', 'PAR-005', 'student', 'SUB-001', 'Pending', nowIso, JSON.stringify({
      studentName: 'Sophia Martin', studentEmail: 'sophia.m@student.com',
      parentEmail: 'james.martin@gmail.com', parentPhone: '555-0301', parentName: 'James Martin',
      age: '9', currentGrade: 'Year 4', currentSchool: 'Westfield Primary',
      previouslyEnrolled: 'No', classesInterested: 'Mathematics',
      reference: 'Google', promoCode: 'WELCOME10',
      extra: 'Sophia struggles with fractions — would love extra support.',
      submissionDate: today,
    })],
  ];
  const announcementRows = [
    ['ANN-001', 'Term 2 Enrolments Open', 'Term 2 enrolments are now open. Contact us to secure your spot before places fill up!', 'Standard', 'true', today],
    ['ANN-002', 'Public Holiday Closure',  'EduTrack will be closed on Monday 22 April for the public holiday. All classes are cancelled.', 'Urgent', 'true', today],
  ];

  return [
    { tab: SHEET_TABS.users,               headers: SHEET_HEADERS.users,               rows: userRows },
    { tab: SHEET_TABS.students,            headers: SHEET_HEADERS.students,            rows: studentRows },
    { tab: SHEET_TABS.teachers,            headers: SHEET_HEADERS.teachers,            rows: teacherRows },
    { tab: SHEET_TABS.parents,             headers: SHEET_HEADERS.parents,             rows: parentRows },
    { tab: SHEET_TABS.subjects,            headers: SHEET_HEADERS.subjects,            rows: subjectRows },
    { tab: SHEET_TABS.enrollments,         headers: SHEET_HEADERS.enrollments,         rows: enrollmentRows },
    { tab: SHEET_TABS.enrollment_requests, headers: SHEET_HEADERS.enrollment_requests, rows: enrollmentRequestRows },
    { tab: SHEET_TABS.announcements,       headers: SHEET_HEADERS.announcements,       rows: announcementRows },
  ];
}

// POST /api/sheets/setup — create a brand-new spreadsheet with all EduTrack tabs,
// seed it with sample data, and apply dropdown validation.
// After this call the sheet is immediately ready to use.
router.post('/sheets/setup', async (req, res): Promise<void> => {
  try {
    const sheets  = await getUncachableGoogleSheetClient();
    const tabData = buildSeedData();
    const allTabs = Object.values(SHEET_TABS);

    // 1. Create the spreadsheet with all required tabs at once
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: 'EduTrack Data' },
        sheets: allTabs.map(title => ({ properties: { title } })),
      },
    });

    const spreadsheetId  = createRes.data.spreadsheetId!;
    const spreadsheetUrl = createRes.data.spreadsheetUrl!;

    // 2. Write headers + seed data into every tab in one batch
    const batchData = tabData.map(({ tab, headers, rows }) => ({
      range:  `${tab}!A1`,
      values: [headers, ...rows],
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: batchData },
    });

    // 3. Apply dropdown validation (non-fatal)
    try { await applyDropdownValidation(sheets, spreadsheetId); } catch {}

    res.json({ spreadsheetId, spreadsheetUrl, tabs: tabData.map(t => t.tab), seeded: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sheets/seed — MUST be before /:tab to avoid Express matching "seed" as :tab
// Clears and re-seeds an existing spreadsheet with all tabs + sample data + dropdowns.
router.post('/sheets/seed', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }

  try {
    const sheets   = await getUncachableGoogleSheetClient();
    const tabData  = buildSeedData();

    // Ensure all required tabs exist, add any that are missing
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTabs = (meta.data.sheets || []).map((s: any) => s.properties?.title as string);
    const missingTabs  = Object.values(SHEET_TABS).filter(t => !existingTabs.includes(t));
    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: missingTabs.map(title => ({ addSheet: { properties: { title } } })) },
      });
    }

    // Clear then write each tab sequentially (avoids quota bursts on large data)
    for (const { tab, headers, rows } of tabData) {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A1:Z` });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers, ...rows] },
      });
    }

    // Apply dropdown validation (non-fatal — seed data is already written)
    try { await applyDropdownValidation(sheets, spreadsheetId); } catch {}

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

// ---------------------------------------------------------------------------
// Shared helper — applies dropdown validation to all status/controlled columns.
// Uses SHEET_HEADERS to derive column indices so it stays in sync with the schema.
// ---------------------------------------------------------------------------
const TAB_KEY_MAP: Record<string, keyof typeof SHEET_HEADERS> = {
  [SHEET_TABS.students]:            'students',
  [SHEET_TABS.teachers]:            'teachers',
  [SHEET_TABS.subjects]:            'subjects',
  [SHEET_TABS.enrollments]:         'enrollments',
  [SHEET_TABS.users]:               'users',
  [SHEET_TABS.enrollment_requests]: 'enrollment_requests',
  [SHEET_TABS.parents]:             'parents',
  [SHEET_TABS.archive]:             'archive',
  [SHEET_TABS.announcements]:       'announcements',
};

const DROPDOWN_RULES: Array<{ tab: string; col: string; values: string[] }> = [
  // Master — Status is controlled here; never duplicate in extension tabs
  { tab: SHEET_TABS.users,               col: 'Status',          values: ['Active', 'Inactive', 'Pending'] },
  { tab: SHEET_TABS.users,               col: 'Role',            values: ['principal', 'tutor', 'teacher', 'parent', 'student', 'admin', 'developer'] },
  // Classes
  { tab: SHEET_TABS.subjects,            col: 'Status',          values: ['Active', 'Inactive'] },
  { tab: SHEET_TABS.subjects,            col: 'Type',            values: ['Individual', 'Group', 'Both'] },
  // Transactions
  { tab: SHEET_TABS.enrollments,         col: 'Status',          values: ['Active', 'Inactive', 'Pending'] },
  { tab: SHEET_TABS.enrollments,         col: 'Override Action', values: ['Fee Waived', 'Fee Confirmed'] },
  { tab: SHEET_TABS.enrollment_requests, col: 'Status',          values: ['Pending', 'Active', 'Rejected'] },
  { tab: SHEET_TABS.enrollment_requests, col: 'RequestType',     values: ['student', 'tutor', 'new-class'] },
  // Announcements
  { tab: SHEET_TABS.announcements,       col: 'Priority',        values: ['Standard', 'Urgent'] },
  { tab: SHEET_TABS.announcements,       col: 'IsActive',        values: ['true', 'false'] },
];

async function applyDropdownValidation(sheetsClient: any, spreadsheetId: string): Promise<number> {
  const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const sheetIdMap: Record<string, number> = {};
  (meta.data.sheets || []).forEach((s: any) => {
    const title = s.properties?.title;
    const id    = s.properties?.sheetId;
    if (title !== undefined && id !== undefined) sheetIdMap[title] = id;
  });

  const requests: any[] = [];
  for (const rule of DROPDOWN_RULES) {
    const numericId = sheetIdMap[rule.tab];
    if (numericId === undefined) continue;
    const headerKey = TAB_KEY_MAP[rule.tab];
    if (!headerKey) continue;
    const hdrs = SHEET_HEADERS[headerKey] as string[];
    const colIdx = hdrs.indexOf(rule.col);
    if (colIdx === -1) continue;

    requests.push({
      setDataValidation: {
        range: {
          sheetId: numericId,
          startRowIndex: 1,   // skip header row (0-indexed)
          endRowIndex: 2000,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: rule.values.map(v => ({ userEnteredValue: v })),
          },
          showCustomUi: true,
          strict: false,       // allow blank (don't block empty cells)
        },
      },
    });
  }

  if (requests.length > 0) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }
  return requests.length;
}

// POST /api/sheets/apply-validation — applies dropdown rules to all status columns
// Must be BEFORE /api/sheets/:tab to avoid Express matching "apply-validation" as :tab
router.post('/sheets/apply-validation', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
  try {
    const sheetsClient = await getUncachableGoogleSheetClient();
    const count = await applyDropdownValidation(sheetsClient, spreadsheetId);
    res.json({ ok: true, rulesApplied: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sheets/parents — returns enriched parent records (joined with Users master).
// Must be BEFORE /sheets/:tab to avoid Express matching "parents" as :tab.
router.get('/sheets/parents', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing spreadsheetId' }); return; }
  try {
    const [parentRows, users] = await Promise.all([
      readRows(spreadsheetId, tabName('parents')),
      readUsersTab(spreadsheetId),
    ]);
    const userMap = new Map(users.map((u: any) => [u.userId, u]));

    const enriched = parentRows.map((r: any) => {
      const user = userMap.get(r['UserID'] || r['ParentID'] || '');
      return {
        ...r,
        // Resolved display fields for frontend compatibility
        Email:         user?.email  || r['Email']  || '',
        'Parent Name': user?.name   || r['Parent Name'] || '',
        Status:        user?.status || r['Status'] || '',
        Phone:         r['Phone']   || '',
        Children:      r['Children'] || '',
        ParentID:      r['ParentID'] || r['UserID'] || '',
      };
    });
    res.json(enriched);
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
