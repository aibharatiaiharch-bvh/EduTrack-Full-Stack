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

function dayMatchesSubject(dayName: string, daysField: string): boolean {
  if (!daysField) return false;
  const normalised = daysField.toLowerCase();
  const day = dayName.toLowerCase();
  const short = day.slice(0, 3);
  return normalised.includes(day) || normalised.includes(short);
}

// GET /api/schedule/calendar?sheetId=X&weeks=2
// Returns next 1–4 weeks of class slots derived from the Subjects tab, with live enrollment counts.
router.get('/schedule/calendar', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const weeks = Math.min(Math.max(parseInt((req.query.weeks as string) || '2', 10), 1), 4);

  try {
    const [subjects, enrollments, teachers] = await Promise.all([
      readRows(sheetId, SHEET_TABS.subjects),
      readRows(sheetId, SHEET_TABS.enrollments),
      readRows(sheetId, SHEET_TABS.teachers),
    ]);

    const activeSubjects = subjects.filter(s => (s['Status'] || '').toLowerCase() === 'active');

    // Build teacher lookup: name → email, zoomLink
    const teacherByName: Record<string, { email: string; zoomLink: string }> = {};
    for (const t of teachers) {
      const name = (t['Name'] || '').trim();
      if (name) teacherByName[name.toLowerCase()] = { email: t['Email'] || '', zoomLink: t['Zoom Link'] || '' };
    }

    // Build per-class time lookup from enrollments (use first occurrence)
    const classTimes: Record<string, string> = {};
    for (const e of enrollments) {
      const cn = (e['Class Name'] || '').toLowerCase();
      if (cn && e['Class Time'] && !classTimes[cn]) classTimes[cn] = e['Class Time'];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Array<{
      date: string; dateISO: string; dayName: string;
      slots: Array<{
        subjectId: string; className: string; type: string;
        teacherName: string; teacherEmail: string; zoomLink: string;
        room: string; time: string; maxCapacity: number;
        enrolled: number; isFull: boolean; students: string[];
      }>;
    }> = [];

    for (let d = 0; d < weeks * 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dayName = date.toLocaleDateString('en-AU', { weekday: 'long' });
      const dateStr = date.toLocaleDateString('en-AU');
      const dateISO = date.toISOString().slice(0, 10);

      const daySubjects = activeSubjects.filter(s => dayMatchesSubject(dayName, s['Days'] || ''));

      const slots = daySubjects.map(s => {
        const maxCap = Math.max(parseInt(s['MaxCapacity'] || '8', 10) || 8, 1);
        const classNameLower = (s['Name'] || '').toLowerCase();

        const enrolledRows = enrollments.filter(e =>
          (e['Class Name'] || '').toLowerCase() === classNameLower &&
          e['Class Date'] === dateStr &&
          !['cancelled', 'late cancellation'].includes((e['Status'] || '').toLowerCase())
        );

        const teacherInfo = teacherByName[(s['Teachers'] || '').trim().toLowerCase()] || { email: '', zoomLink: '' };

        return {
          subjectId: s['SubjectID'] || '',
          className: s['Name'] || '',
          type: s['Type'] || 'Group',
          teacherName: s['Teachers'] || '',
          teacherEmail: teacherInfo.email,
          zoomLink: teacherInfo.zoomLink,
          room: s['Room'] || '',
          time: classTimes[classNameLower] || s['Time'] || '',
          maxCapacity: maxCap,
          enrolled: enrolledRows.length,
          isFull: enrolledRows.length >= maxCap,
          students: enrolledRows.map(e => e['Student Name']).filter(Boolean),
        };
      });

      if (slots.length > 0) {
        days.push({ date: dateStr, dateISO, dayName, slots });
      }
    }

    // Also return all enrollments grouped by teacher for the teacher schedule view
    const byTeacher: Record<string, { teacherName: string; teacherEmail: string; enrollments: any[] }> = {};
    for (const e of enrollments) {
      const tName = (e['Teacher'] || 'Unassigned').trim();
      const tEmail = (e['Teacher Email'] || '').toLowerCase().trim();
      if (!byTeacher[tName]) byTeacher[tName] = { teacherName: tName, teacherEmail: tEmail, enrollments: [] };
      byTeacher[tName].enrollments.push(e);
    }
    const teacherSchedules = Object.values(byTeacher).sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    res.json({ days, teacherSchedules, weeks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
