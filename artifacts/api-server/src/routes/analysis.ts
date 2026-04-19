import { Router, type IRouter } from 'express';
import { SHEET_TABS, readTabRows, readUsersTab } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '';
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseDays(daysStr: string): string[] {
  if (!daysStr) return [];
  return daysStr
    .split(/[,;/]+/)
    .map(d => d.trim())
    .filter(d => DAYS_ORDER.includes(d));
}

function parseDurationHours(timeStr: string): number {
  if (!timeStr) return 0;
  // Handles "9:00 AM - 10:00 AM" or "9:00 - 10:30" or "09:00-10:00"
  const parts = timeStr.split(/\s*[-–]\s*/);
  if (parts.length < 2) return 0;

  function toMinutes(t: string): number {
    const cleaned = t.trim().toUpperCase();
    const pm = cleaned.includes('PM');
    const am = cleaned.includes('AM');
    const raw = cleaned.replace(/[APM\s]/g, '');
    const [hStr, mStr] = raw.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return 0;
    if (pm && h !== 12) h += 12;
    if (am && h === 12) h = 0;
    return h * 60 + m;
  }

  const start = toMinutes(parts[0]);
  const end   = toMinutes(parts[1]);
  const diff  = end - start;
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

// GET /api/analysis?sheetId=X
// Returns business analytics: by subject, by teacher, by weekday
router.get('/analysis', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const [subjects, enrollments, users] = await Promise.all([
      readTabRows(sheetId, SHEET_TABS.subjects),
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readUsersTab(sheetId),
    ]);

    const userMap = new Map(users.map(u => [u.userId, u.name || u.email || u.userId]));

    // Count active enrollments per ClassID
    const activeEnrollsByClass = new Map<string, number>();
    for (const e of enrollments) {
      const classId = (e['ClassID'] || '').trim();
      const status  = (e['Status'] || '').toLowerCase();
      if (!classId || ['inactive', 'cancelled', 'late cancellation', 'rejected'].includes(status)) continue;
      activeEnrollsByClass.set(classId, (activeEnrollsByClass.get(classId) || 0) + 1);
    }

    // ── By Subject ───────────────────────────────────────────────────────────
    type SubjectRow = {
      subjectId: string;
      name: string;
      type: string;
      teacherName: string;
      days: string[];
      sessionsPerWeek: number;
      durationHours: number;
      hoursPerWeek: number;
      students: number;
      maxCapacity: number;
      fillPct: number;
    };

    const bySubject: SubjectRow[] = subjects
      .filter(s => (s['Status'] || '').toLowerCase() !== 'inactive')
      .map(s => {
        const subjectId      = (s['SubjectID'] || '').trim();
        const name           = s['Name'] || subjectId;
        const type           = s['Type'] || '—';
        const teacherId      = (s['TeacherID'] || '').trim();
        const teacherName    = userMap.get(teacherId) || teacherId || '—';
        const days           = parseDays(s['Days'] || '');
        const durationHours  = parseDurationHours(s['Time'] || '');
        const sessionsPerWeek = days.length;
        const hoursPerWeek   = Math.round(sessionsPerWeek * durationHours * 100) / 100;
        const students       = activeEnrollsByClass.get(subjectId) || 0;
        const maxCapacity    = parseInt(s['MaxCapacity'] || '0', 10) || 0;
        const fillPct        = maxCapacity > 0 ? Math.round((students / maxCapacity) * 100) : 0;
        return { subjectId, name, type, teacherName, days, sessionsPerWeek, durationHours, hoursPerWeek, students, maxCapacity, fillPct };
      })
      .sort((a, b) => b.students - a.students);

    // ── By Teacher ───────────────────────────────────────────────────────────
    type TeacherRow = {
      teacherName: string;
      classCount: number;
      students: number;
      hoursPerWeek: number;
      classes: string[];
    };

    const teacherMap = new Map<string, { teacherName: string; classCount: number; students: number; hoursPerWeek: number; classes: string[] }>();
    for (const s of bySubject) {
      const key = s.teacherName;
      if (!teacherMap.has(key)) {
        teacherMap.set(key, { teacherName: key, classCount: 0, students: 0, hoursPerWeek: 0, classes: [] });
      }
      const t = teacherMap.get(key)!;
      t.classCount++;
      t.students += s.students;
      t.hoursPerWeek = Math.round((t.hoursPerWeek + s.hoursPerWeek) * 100) / 100;
      t.classes.push(s.name);
    }
    const byTeacher: TeacherRow[] = [...teacherMap.values()].sort((a, b) => b.students - a.students);

    // ── By Weekday ───────────────────────────────────────────────────────────
    type WeekdayRow = {
      day: string;
      classCount: number;
      students: number;
      hoursTotal: number;
    };

    const weekdayMap = new Map<string, { classCount: number; students: number; hoursTotal: number }>();
    for (const day of DAYS_ORDER) weekdayMap.set(day, { classCount: 0, students: 0, hoursTotal: 0 });

    for (const s of bySubject) {
      for (const day of s.days) {
        const w = weekdayMap.get(day);
        if (!w) continue;
        w.classCount++;
        w.students += s.students;
        w.hoursTotal = Math.round((w.hoursTotal + s.durationHours) * 100) / 100;
      }
    }

    const byWeekday: WeekdayRow[] = DAYS_ORDER
      .map(day => ({ day, ...weekdayMap.get(day)! }))
      .filter(w => w.classCount > 0);

    // ── Totals ───────────────────────────────────────────────────────────────
    const totals = {
      subjects:     bySubject.length,
      teachers:     byTeacher.length,
      students:     bySubject.reduce((n, s) => n + s.students, 0),
      hoursPerWeek: Math.round(bySubject.reduce((n, s) => n + s.hoursPerWeek, 0) * 100) / 100,
    };

    res.json({ bySubject, byTeacher, byWeekday, totals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
