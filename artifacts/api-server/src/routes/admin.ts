import { Router, type IRouter } from 'express';
import fs from 'fs';
import path from 'path';
import { getUncachableGoogleSheetClient, SHEET_TABS, colLetter } from '../lib/googleSheets.js';

const router: IRouter = Router();

// GET /api/admin/contact
// Returns developer contact info from environment variables only.
// No client sheet access — the developer is not entitled to read client data.
router.get('/admin/contact', (_req, res): void => {
  const email = process.env.DEVELOPER_EMAIL || '';
  const name  = process.env.DEVELOPER_NAME  || 'App Developer';
  res.json({ email, name });
});

// GET /api/admin/features
// Feature flags are managed entirely in the browser via localStorage.
// This endpoint exists only as a no-op compat shim; returns hardcoded defaults.
router.get('/admin/features', (_req, res): void => {
  res.json({ schedule: true });
});

// PUT /api/admin/features
// No-op — the client saves feature flags to localStorage directly.
router.put('/admin/features', (_req, res): void => {
  res.json({ ok: true });
});

// GET /api/admin/github-sync
// Returns the timestamp and branch of the last successful GitHub push.
// The sync script writes a JSON file on each successful push.
router.get('/admin/github-sync', (_req, res): void => {
  const statusFile = process.env.GITHUB_SYNC_STATUS_FILE || path.join('/home/runner/workspace', '.github-sync-status.json');
  try {
    const raw = fs.readFileSync(statusFile, 'utf8');
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') {
      res.json({ lastSyncedAt: null, branch: null });
      return;
    }
    const { lastSyncedAt, branch, commitHash, commitMessage } = data as Record<string, unknown>;
    const syncedAt = typeof lastSyncedAt === 'string' && !isNaN(Date.parse(lastSyncedAt)) ? lastSyncedAt : null;
    const branchName = typeof branch === 'string' && branch.length > 0 ? branch : null;
    const hash = typeof commitHash === 'string' && commitHash.length > 0 ? commitHash : null;
    const message = typeof commitMessage === 'string' && commitMessage.length > 0 ? commitMessage : null;
    res.json({ lastSyncedAt: syncedAt, branch: branchName, commitHash: hash, commitMessage: message });
  } catch {
    res.json({ lastSyncedAt: null, branch: null });
  }
});

// POST /api/admin/migrate-columns?sheetId=
// One-time migration: writes new column headers to row 1 of the affected tabs.
// Safe to run multiple times — just overwrites the header cells.
router.post('/admin/migrate-columns', async (req, res): Promise<void> => {
  const sheetId = (req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '') as string;
  if (!sheetId) { res.status(400).json({ error: 'sheetId required' }); return; }
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const writes = [
      // Students tab: col K (index 10) = "Parent Name"
      { range: `${SHEET_TABS.students}!K1`, value: 'Parent Name' },
      // Subjects tab: col J (index 9) = "Teacher Name"
      { range: `${SHEET_TABS.subjects}!J1`, value: 'Teacher Name' },
      // Parents tab: col D (index 3) rename "Children" → "Children Names"
      { range: `${SHEET_TABS.parents}!D1`, value: 'Children Names' },
      // Attendance tab: col I (index 8) = "Within24Hrs", col J = "Student Name", col K = "Teacher Name"
      { range: `${SHEET_TABS.attendance}!I1`, value: 'Within24Hrs' },
      { range: `${SHEET_TABS.attendance}!J1`, value: 'Student Name' },
      { range: `${SHEET_TABS.attendance}!K1`, value: 'Teacher Name' },
    ];
    for (const w of writes) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: w.range,
        valueInputOption: 'RAW',
        requestBody: { values: [[w.value]] },
      });
    }
    res.json({ ok: true, updated: writes.map(w => w.range) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/backfill-names?sheetId=
// Fills blank "Parent Name", "Teacher Name", "Student Name" columns from existing IDs.
// Safe to run multiple times — only writes where the cell is currently empty.
router.post('/admin/backfill-names', async (req, res): Promise<void> => {
  const sheetId = (req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '') as string;
  if (!sheetId) { res.status(400).json({ error: 'sheetId required' }); return; }

  try {
    const sheets = await getUncachableGoogleSheetClient();

    // ── 1. Build lookup maps from Users tab ──────────────────────────────────
    const usersResp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_TABS.users}!A2:G` });
    const userRows  = usersResp.data.values || [];
    const userIdToName: Record<string, string> = {};
    for (const row of userRows) {
      const id   = (row[0] || '').toString().trim();
      const name = (row[3] || '').toString().trim();
      if (id) userIdToName[id] = name;
    }

    // ── 2. Build SubjectID → TeacherID map from Subjects tab ─────────────────
    const subjectsResp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_TABS.subjects}!A2:J` });
    const subjectRows  = subjectsResp.data.values || [];
    const subjectIdToTeacherId: Record<string, string> = {};
    for (const row of subjectRows) {
      const sid = (row[0] || '').toString().trim();
      const tid = (row[3] || '').toString().trim();
      if (sid) subjectIdToTeacherId[sid] = tid;
    }

    const writes: { range: string; value: string }[] = [];

    // ── 3. Students: fill blank "Parent Name" (col K = index 10) ─────────────
    const studentsResp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_TABS.students}!A2:K` });
    const studentRows  = studentsResp.data.values || [];
    const parentNameCol = colLetter('students', 'Parent Name');
    for (let i = 0; i < studentRows.length; i++) {
      const row       = studentRows[i];
      const parentId  = (row[3] || '').toString().trim();
      const existing  = (row[10] || '').toString().trim();
      if (!existing && parentId && userIdToName[parentId]) {
        writes.push({ range: `${SHEET_TABS.students}!${parentNameCol}${i + 2}`, value: userIdToName[parentId] });
      }
    }

    // ── 4. Subjects: fill blank "Teacher Name" (col J = index 9) ─────────────
    const teacherNameCol = colLetter('subjects', 'Teacher Name');
    for (let i = 0; i < subjectRows.length; i++) {
      const row      = subjectRows[i];
      const teacherId = (row[3] || '').toString().trim();
      const existing  = (row[9] || '').toString().trim();
      if (!existing && teacherId && userIdToName[teacherId]) {
        writes.push({ range: `${SHEET_TABS.subjects}!${teacherNameCol}${i + 2}`, value: userIdToName[teacherId] });
      }
    }

    // ── 5. Attendance: fill blank Student Name (col J=9) & Teacher Name (col K=10) ──
    const attResp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_TABS.attendance}!A2:K` });
    const attRows = attResp.data.values || [];
    const attStuCol = colLetter('attendance', 'Student Name');
    const attTchCol = colLetter('attendance', 'Teacher Name');
    for (let i = 0; i < attRows.length; i++) {
      const row       = attRows[i];
      const classId   = (row[1] || '').toString().trim();
      const userId    = (row[2] || '').toString().trim();
      const stuName   = (row[9]  || '').toString().trim();
      const tchName   = (row[10] || '').toString().trim();
      if (!stuName && userId && userIdToName[userId]) {
        writes.push({ range: `${SHEET_TABS.attendance}!${attStuCol}${i + 2}`, value: userIdToName[userId] });
      }
      if (!tchName && classId) {
        const tid = subjectIdToTeacherId[classId];
        if (tid && userIdToName[tid]) {
          writes.push({ range: `${SHEET_TABS.attendance}!${attTchCol}${i + 2}`, value: userIdToName[tid] });
        }
      }
    }

    // ── 6. Write all updates ──────────────────────────────────────────────────
    for (const w of writes) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: w.range,
        valueInputOption: 'RAW',
        requestBody: { values: [[w.value]] },
      });
    }

    res.json({ ok: true, filled: writes.length, updates: writes.map(w => w.range) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
