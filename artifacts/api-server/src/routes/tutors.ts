import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, readTabRows, readUsersTab } from '../lib/googleSheets.js';

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

const ACTIVE_STATUSES = new Set(['active', 'approved', 'enrolled', 'paid']);

// GET /api/tutors/me?email=X&sheetId=Y
// Returns tutor profile, grouped classes with students, stats, and today's schedule
router.get('/tutors/me', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  try {
    const [users, subjects, allEnrollments, attendance] = await Promise.all([
      readUsersTab(sheetId),
      readRows(sheetId, SHEET_TABS.subjects),
      readRows(sheetId, SHEET_TABS.enrollments),
      readRows(sheetId, SHEET_TABS.attendance).catch(() => []),
    ]);

    // Find tutor in Users tab
    const tutorUser = users.find(u => u.email === email) || null;
    const tutorId = tutorUser?.userId || '';

    // Also check Teachers extension tab for extra fields (Zoom Link, etc.)
    let teacherExt: any = null;
    try {
      const teachers = await readRows(sheetId, SHEET_TABS.teachers);
      teacherExt = teachers.find(t =>
        (t['Email'] || '').toLowerCase().trim() === email ||
        t['UserID'] === tutorId ||
        t['TeacherID'] === tutorId
      ) || null;
    } catch {}

    const tutor = tutorUser ? {
      Name: tutorUser.name,
      Email: tutorUser.email,
      UserID: tutorUser.userId,
      'Zoom Link': teacherExt?.['Zoom Link'] || '',
      Subjects: teacherExt?.['Subjects'] || teacherExt?.['Subject'] || '',
    } : null;

    // Find all enrollments assigned to this tutor
    const tutorEnrollments = allEnrollments.filter(e => {
      const teacherEmail = (e['TeacherEmail'] || '').toLowerCase().trim();
      const teacherId = e['TeacherID'] || '';
      return teacherEmail === email || (tutorId && teacherId === tutorId);
    });

    // Active enrollments for this tutor
    const activeEnrollments = tutorEnrollments.filter(e =>
      ACTIVE_STATUSES.has((e['Status'] || '').toLowerCase().trim())
    );

    // Build user map for student name lookup
    const userMap = new Map(users.map(u => [u.userId, u]));

    // Build subject map
    const subjectMap = new Map(subjects.map(s => [s['SubjectID'] || '', s]));

    // Group active enrollments by ClassID
    const classGroups = new Map<string, { subject: any; students: any[]; enrollments: any[] }>();
    for (const e of activeEnrollments) {
      const classId = e['ClassID'] || '';
      if (!classGroups.has(classId)) {
        const subject = subjectMap.get(classId) || null;
        classGroups.set(classId, { subject, students: [], enrollments: [] });
      }
      const group = classGroups.get(classId)!;
      const student = userMap.get(e['UserID'] || '');
      group.students.push({
        userId: e['UserID'] || '',
        name: student?.name || e['UserID'] || 'Unknown',
        email: student?.email || '',
        enrollmentRow: e._row,
        enrollmentId: e['EnrollmentID'] || '',
      });
      group.enrollments.push(e);
    }

    // Today's day name for schedule matching
    const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const todayDayName = new Date().toLocaleDateString('en-AU', { weekday: 'long' }).toLowerCase();

    // Build classes array
    const classes = Array.from(classGroups.entries()).map(([classId, group]) => {
      const subject = group.subject;
      const days = subject?.['Days'] || '';
      const time = subject?.['Time'] || '';
      const isToday = days.toLowerCase().split(/[,;\/\s]+/).map((d: string) => d.trim()).includes(todayDayName);

      // Get today's attendance for this class
      const todayAttendance = attendance.filter(a =>
        a['SubjectID'] === classId && a['SessionDate'] === todayISO
      );
      const attendanceMap = new Map(todayAttendance.map(a => [a['UserID'], a['Status']]));

      return {
        classId,
        name: subject?.['Name'] || classId,
        type: subject?.['Type'] || '',
        days,
        time,
        room: subject?.['Room'] || '',
        zoomLink: subject?.['Zoom Link'] || teacherExt?.['Zoom Link'] || '',
        isToday,
        studentCount: group.students.length,
        students: group.students.map(s => ({
          ...s,
          attendanceToday: attendanceMap.get(s.userId) || null,
        })),
      };
    });

    // Sort: today's classes first
    classes.sort((a, b) => {
      if (a.isToday && !b.isToday) return -1;
      if (!a.isToday && b.isToday) return 1;
      return a.name.localeCompare(b.name);
    });

    // Today's classes for stats
    const todayClasses = classes.filter(c => c.isToday);

    res.json({
      tutor,
      classes,
      todayClasses,
      todayCount: todayClasses.length,
      totalClasses: classes.length,
      activeEnrollmentCount: activeEnrollments.length,
      uniqueStudentCount: new Set(activeEnrollments.map(e => e['UserID']).filter(Boolean)).size,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
