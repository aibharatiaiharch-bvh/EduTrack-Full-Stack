import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS } from '../lib/googleSheets.js';

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

// GET /api/tutors/me?email=X&sheetId=Y
// Returns the logged-in tutor's profile, today's enrollments, and summary counts
router.get('/tutors/me', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  try {
    // Find tutor profile in Teachers tab
    const teachers = await readRows(sheetId, SHEET_TABS.teachers);
    const tutor = teachers.find(t => (t['Email'] || '').toLowerCase().trim() === email) || null;

    // All enrollments
    const enrollments = await readRows(sheetId, SHEET_TABS.enrollments);
    const activeEnrollments = enrollments.filter(e =>
      (e['Status'] || '').toLowerCase() === 'enrolled'
    );

    // Today's classes
    const today = new Date().toLocaleDateString('en-AU');
    const todayEnrollments = activeEnrollments.filter(e => e['Class Date'] === today);

    // Unique students
    const studentNames = new Set(activeEnrollments.map(e => e['Student Name']).filter(Boolean));

    // All students tab for count
    let activeStudentCount = 0;
    try {
      const students = await readRows(sheetId, SHEET_TABS.students);
      activeStudentCount = students.filter(s => (s['Status'] || '').toLowerCase() === 'active').length;
    } catch {}

    res.json({
      tutor,
      todayEnrollments,
      todayCount: todayEnrollments.length,
      activeEnrollmentCount: activeEnrollments.length,
      uniqueStudentCount: studentNames.size,
      activeStudentCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
