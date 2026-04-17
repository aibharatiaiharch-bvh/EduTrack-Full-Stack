import { Router, type IRouter } from 'express';
import webpush from 'web-push';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, readTabRows, readUsersTab,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || 'mailto:admin@edutrack.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || req.headers['x-sheet-id'] || '';
}

const SUB_TAB     = SHEET_TABS.pushSubscriptions;
const SUB_HEADERS = ['UserID', 'Email', 'Subscription', 'CreatedAt'];

async function ensureSubsTab(spreadsheetId: string) {
  const sheets = await getUncachableGoogleSheetClient();
  try {
    await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SUB_TAB}!A1` });
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SUB_TAB } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SUB_TAB}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SUB_HEADERS] },
    });
  }
}

async function readSubsRows(spreadsheetId: string) {
  try { return await readTabRows(spreadsheetId, SUB_TAB); } catch { return []; }
}

// GET /api/push/vapid-public-key — frontend fetches the public key
router.get('/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — save/update a browser push subscription
router.post('/push/subscribe', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { userId, email, subscription } = req.body as {
    userId?: string; email?: string; subscription?: any;
  };
  if (!subscription) { res.status(400).json({ error: 'Missing subscription' }); return; }

  try {
    await ensureSubsTab(spreadsheetId);
    const rows = await readSubsRows(spreadsheetId);
    const sheets = await getUncachableGoogleSheetClient();
    const existing = rows.find(r => r['UserID'] === userId || r['Email'] === email);

    const subJson = JSON.stringify(subscription);
    if (existing) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SUB_TAB}!A${existing._row}:D${existing._row}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[userId || '', email || '', subJson, new Date().toISOString()]] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SUB_TAB}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[userId || '', email || '', subJson, new Date().toISOString()]] },
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/send-reminders — called by cron; sends 15-min class alerts
router.post('/push/send-reminders', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req) || process.env.DEFAULT_SHEET_ID || '';
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    res.status(503).json({ error: 'VAPID keys not configured' }); return;
  }

  try {
    const [subjects, enrollments, users, subs] = await Promise.all([
      readTabRows(spreadsheetId, SHEET_TABS.subjects),
      readTabRows(spreadsheetId, SHEET_TABS.enrollments),
      readUsersTab(spreadsheetId),
      readSubsRows(spreadsheetId),
    ]);

    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }); // e.g. "Tuesday"
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const subMap = new Map(subs.map(s => [s['UserID'], s['Subscription']]));
    const emailSubMap = new Map(subs.map(s => [s['Email'], s['Subscription']]));
    const userMap = new Map(users.map(u => [u.userId, u]));

    const results: string[] = [];

    for (const cls of subjects) {
      if ((cls['Status'] || '').toLowerCase() !== 'active') continue;

      const daysStr = cls['Days'] || '';
      const timeStr = cls['Time'] || '';
      if (!timeStr) continue;

      // Check if today is a class day (e.g. "Tuesday" or "Tue,Thu")
      const classDays = daysStr.toLowerCase().split(/[,;\/\s]+/).map((d: string) => d.trim());
      const todayMatches = classDays.some((d: string) =>
        dayName.toLowerCase().startsWith(d) || d.startsWith(dayName.toLowerCase().slice(0, 3))
      );
      if (!todayMatches) continue;

      // Parse class time (e.g. "4:00 PM" or "16:00")
      const classStartMins = parseTimeMins(timeStr);
      if (classStartMins === null) continue;

      // Window: 10–20 minutes before class
      const minsUntil = classStartMins - nowMins;
      if (minsUntil < 10 || minsUntil > 20) continue;

      const classId = cls['SubjectID'] || '';
      const className = cls['Name'] || classId;
      const timeDisplay = formatTime(classStartMins);

      // Find active enrollments for this class
      const activeEnrollments = enrollments.filter(
        e => e['ClassID'] === classId && ['approved','paid'].includes((e['Status'] || '').toLowerCase())
      );

      const notifyUserIds = new Set<string>();

      // Notify students
      for (const enr of activeEnrollments) {
        if (enr['UserID']) notifyUserIds.add(enr['UserID']);
      }

      // Notify teacher
      if (cls['TeacherID']) notifyUserIds.add(cls['TeacherID']);

      for (const uid of notifyUserIds) {
        const user = userMap.get(uid);
        let rawSub = subMap.get(uid) || (user ? emailSubMap.get(user.email) : undefined);
        if (!rawSub) continue;

        try {
          const sub = typeof rawSub === 'string' ? JSON.parse(rawSub) : rawSub;
          const isTeacher = uid === cls['TeacherID'];
          const payload = JSON.stringify({
            title: `Class in 15 minutes`,
            body: `${className} starts at ${timeDisplay}${isTeacher ? ' — you are teaching this class' : ''}`,
            tag: `class-reminder-${classId}`,
            url: '/',
          });
          await webpush.sendNotification(sub, payload);
          results.push(`Notified ${uid}`);
        } catch (e: any) {
          results.push(`Failed ${uid}: ${e.message}`);
        }
      }
    }

    res.json({ ok: true, sent: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/test — send a test push to the requesting user
router.post('/push/test', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { userId, email } = req.body as { userId?: string; email?: string };

  try {
    await ensureSubsTab(spreadsheetId);
    const subs = await readSubsRows(spreadsheetId);
    const row = subs.find(s => s['UserID'] === userId || s['Email'] === email);
    if (!row) { res.status(404).json({ error: 'No subscription found for this user' }); return; }

    const sub = typeof row['Subscription'] === 'string'
      ? JSON.parse(row['Subscription'])
      : row['Subscription'];

    await webpush.sendNotification(sub, JSON.stringify({
      title: 'EduTrack Notifications',
      body: 'You are set up for class reminders.',
      tag: 'test',
      url: '/',
    }));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function parseTimeMins(timeStr: string): number | null {
  timeStr = timeStr.trim();
  // Try "4:00 PM" / "16:00" / "4pm"
  const ampm = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2] || '0', 10);
    const period = ampm[3].toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return h * 60 + m;
  }
  const h24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  return null;
}

function formatTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${String(m).padStart(2, '0')} ${period}`;
}

export default router;
