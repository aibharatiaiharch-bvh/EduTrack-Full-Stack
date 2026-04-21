import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, readUsersTab } from '../lib/googleSheets.js';

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
router.get('/schedule/calendar', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const weeks = Math.min(Math.max(parseInt((req.query.weeks as string) || '2', 10), 1), 4);

  try {
    const [subjects, enrollments, teachers, users] = await Promise.all([
      readRows(sheetId, SHEET_TABS.subjects),
      readRows(sheetId, SHEET_TABS.enrollments),
      readRows(sheetId, SHEET_TABS.teachers),
      readUsersTab(sheetId),
    ]);

    const activeSubjects = subjects.filter(s => (s['Status'] || '').toLowerCase() === 'active');

    // Build user lookup by userId → { name, email, role }
    const userById = new Map(users.map(u => [u.userId, u]));
    // Principal email
    const principalEmail = users.find(u => (u.role || '').toLowerCase() === 'principal')?.email || '';

    // Build tutor email lookup from Users tab (role=tutor) by name
    const tutorEmailByName: Record<string, string> = {};
    for (const u of users) {
      if ((u.role || '').toLowerCase() === 'tutor' && u.name && u.email) {
        tutorEmailByName[u.name.toLowerCase()] = u.email;
      }
    }

    // Build teacher lookup by TeacherID → { name, email, zoomLink }
    const teacherById: Record<string, { name: string; email: string; zoomLink: string }> = {};
    const teacherByName: Record<string, { name: string; email: string; zoomLink: string }> = {};
    for (const t of teachers) {
      const tid = (t['TeacherID'] || '').trim();
      const name = (t['Name'] || '').trim();
      // Users tab is master data for email; Teachers tab is fallback only
      const email = tutorEmailByName[name.toLowerCase()] || t['Email'] || '';
      const entry = { name, email, zoomLink: t['Zoom Link'] || '' };
      if (tid) teacherById[tid] = entry;
      if (name) teacherByName[name.toLowerCase()] = entry;
    }

    // Count active enrollments per SubjectID; include student name + email
    const enrolledBySubject: Record<string, { count: number; students: { name: string; email: string }[] }> = {};
    for (const e of enrollments) {
      const classId = (e['ClassID'] || '').trim();
      const status = (e['Status'] || 'active').toLowerCase().trim();
      if (!classId || status === 'inactive' || status === 'cancelled' || status === 'late cancellation') continue;
      if (!enrolledBySubject[classId]) enrolledBySubject[classId] = { count: 0, students: [] };
      enrolledBySubject[classId].count++;
      const userId = (e['UserID'] || '').trim();
      const user = userById.get(userId);
      const studentName = user?.name || (e['Student Name'] || '').trim();
      const studentEmail = user?.email || (e['StudentEmail'] || '').trim();
      if (studentName) enrolledBySubject[classId].students.push({ name: studentName, email: studentEmail });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: Array<{
      date: string; dateISO: string; dayName: string;
      slots: Array<{
        subjectId: string; className: string; type: string;
        teacherName: string; teacherEmail: string; zoomLink: string;
        room: string; time: string; maxCapacity: number;
        enrolled: number; isFull: boolean; students: { name: string; email: string }[];
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
        const subjectId = (s['SubjectID'] || '').trim();
        const maxCap = Math.max(parseInt(s['MaxCapacity'] || '8', 10) || 8, 1);

        // Look up teacher by TeacherID first, fall back to name field
        const tid = (s['TeacherID'] || '').trim();
        const tNameFallback = (s['Teachers'] || s['Teacher'] || s['TeacherName'] || '').trim();
        const teacherInfo =
          (tid && teacherById[tid]) ||
          (tNameFallback && teacherByName[tNameFallback.toLowerCase()]) ||
          { name: tNameFallback, email: '', zoomLink: '' };

        const enrollment = enrolledBySubject[subjectId] || { count: 0, students: [] };

        return {
          subjectId,
          className: s['Name'] || '',
          type: s['Type'] || 'Group',
          teacherName: teacherInfo.name,
          teacherEmail: teacherInfo.email,
          zoomLink: teacherInfo.zoomLink,
          room: s['Room'] || '',
          time: s['Time'] || '',
          maxCapacity: maxCap,
          enrolled: enrollment.count,
          isFull: enrollment.count >= maxCap,
          students: enrollment.students,
        };
      });

      if (slots.length > 0) {
        days.push({ date: dateStr, dateISO, dayName, slots });
      }
    }

    // Teacher schedule view: group active enrollments by TeacherID/TeacherName
    const byTeacher: Record<string, { teacherName: string; teacherEmail: string; enrollments: any[] }> = {};
    for (const e of enrollments) {
      const tid = (e['TeacherID'] || '').trim();
      const tInfo = (tid && teacherById[tid]) || { name: e['Teacher Name'] || 'Unassigned', email: e['TeacherEmail'] || '', zoomLink: '' };
      const tName = tInfo.name || 'Unassigned';
      if (!byTeacher[tName]) byTeacher[tName] = { teacherName: tName, teacherEmail: tInfo.email, enrollments: [] };
      byTeacher[tName].enrollments.push(e);
    }
    const teacherSchedules = Object.values(byTeacher).sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    res.json({ days, teacherSchedules, weeks, principalEmail });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
