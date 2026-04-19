import { Router, type IRouter } from 'express';
import { SHEET_TABS, readTabRows, readUsersTab } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '';
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_ALIASES: Record<string, string> = {
  mon: 'Monday', monday: 'Monday',
  tue: 'Tuesday', tuesday: 'Tuesday',
  wed: 'Wednesday', wednesday: 'Wednesday',
  thu: 'Thursday', thursday: 'Thursday',
  fri: 'Friday', friday: 'Friday',
  sat: 'Saturday', saturday: 'Saturday',
  sun: 'Sunday', sunday: 'Sunday',
};

function parseDays(daysStr: string): string[] {
  if (!daysStr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of daysStr.split(/[,;\s/]+/)) {
    const full = DAY_ALIASES[part.trim().toLowerCase()];
    if (full && !seen.has(full)) { seen.add(full); out.push(full); }
  }
  return out;
}

function parseDurationHours(timeStr: string): number {
  const cleaned = (timeStr || '').trim();
  if (!cleaned) return 0;
  const parts = cleaned.split(/\s*[-–]\s*/);
  if (parts.length < 2) return 0;

  function toMinutes(t: string): number {
    const value = t.trim().toUpperCase();
    const pm = value.includes('PM');
    const am = value.includes('AM');
    const raw = value.replace(/[APM\s]/g, '');
    const [hStr, mStr] = raw.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return 0;
    if (pm && h !== 12) h += 12;
    if (am && h === 12) h = 0;
    return h * 60 + m;
  }

  const start = toMinutes(parts[0]);
  const end = toMinutes(parts[1]);
  const diff = end - start;
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

router.get('/analysis', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    const [subjects, enrollments, users, attendance] = await Promise.all([
      readTabRows(sheetId, SHEET_TABS.subjects),
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.attendance),
    ]);

    const userMap = new Map(users.map(u => [u.userId, u.name || u.email || u.userId]));

    const activeEnrollsByClass = new Map<string, number>();
    for (const e of enrollments) {
      const classId = (e['ClassID'] || '').trim();
      const status = (e['Status'] || '').toLowerCase();
      if (!classId || ['inactive', 'cancelled', 'late cancellation', 'rejected'].includes(status)) continue;
      activeEnrollsByClass.set(classId, (activeEnrollsByClass.get(classId) || 0) + 1);
    }

    const bySubject = subjects
      .filter(s => (s['Status'] || '').toLowerCase() !== 'inactive')
      .map(s => {
        const subjectId = (s['SubjectID'] || '').trim();
        const name = s['Name'] || subjectId;
        const type = s['Type'] || '—';
        const teacherId = (s['TeacherID'] || '').trim();
        const teacherName = userMap.get(teacherId) || teacherId || '—';
        const days = parseDays(s['Days'] || '');
        const durationHours = parseDurationHours(s['Time'] || '') || 1;
        const sessionsPerWeek = days.length;
        const hoursPerWeek = Math.round(sessionsPerWeek * durationHours * 100) / 100;
        const students = activeEnrollsByClass.get(subjectId) || 0;
        const maxCapacity = parseInt(s['MaxCapacity'] || '0', 10) || 0;
        const fillPct = maxCapacity > 0 ? Math.round((students / maxCapacity) * 100) : 0;
        return { subjectId, name, type, teacherName, days, sessionsPerWeek, durationHours, hoursPerWeek, students, maxCapacity, fillPct };
      })
      .sort((a, b) => b.students - a.students);

    const teacherAgg = new Map<string, { teacherName: string; classCount: number; students: number; hoursPerWeek: number; classes: string[] }>();
    for (const s of bySubject) {
      if (!teacherAgg.has(s.teacherName)) teacherAgg.set(s.teacherName, { teacherName: s.teacherName, classCount: 0, students: 0, hoursPerWeek: 0, classes: [] });
      const t = teacherAgg.get(s.teacherName)!;
      t.classCount++;
      t.students += s.students;
      t.hoursPerWeek = Math.round((t.hoursPerWeek + s.hoursPerWeek) * 100) / 100;
      t.classes.push(s.name);
    }
    const byTeacher = [...teacherAgg.values()].sort((a, b) => b.students - a.students);

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
    const byWeekday = DAYS_ORDER.map(day => ({ day, ...weekdayMap.get(day)! })).filter(w => w.classCount > 0);

    type MonthBucket = { yyyyMM: string; label: string; sessions: number; studentAttendances: number; absences: number };
    const monthBuckets = new Map<string, { sessions: Set<string>; present: number; absent: number }>();
    for (const r of attendance) {
      const dateStr = (r['SessionDate'] || '').trim();
      if (!dateStr || dateStr.length < 7) continue;
      const yyyyMM = dateStr.slice(0, 7);
      const classId = (r['ClassID'] || '').trim();
      const status = (r['Status'] || '').toLowerCase();
      if (!monthBuckets.has(yyyyMM)) monthBuckets.set(yyyyMM, { sessions: new Set(), present: 0, absent: 0 });
      const b = monthBuckets.get(yyyyMM)!;
      b.sessions.add(`${classId}::${dateStr}`);
      if (status === 'present' || status === 'late') b.present++;
      else if (status === 'absent') b.absent++;
    }
    const byMonth: MonthBucket[] = [...monthBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([yyyyMM, b]) => ({ yyyyMM, label: monthLabel(yyyyMM), sessions: b.sessions.size, studentAttendances: b.present, absences: b.absent }));

    const totals = {
      subjects: bySubject.length,
      teachers: byTeacher.length,
      students: bySubject.reduce((n, s) => n + s.students, 0),
      hoursPerWeek: Math.round(bySubject.reduce((n, s) => n + s.hoursPerWeek, 0) * 100) / 100,
    };

    res.json({ bySubject, byTeacher, byWeekday, byMonth, totals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
