import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS,
  readTabRows, readUsersTab,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
}

async function readAttendanceRows(spreadsheetId: string) {
  return readTabRows(spreadsheetId, SHEET_TABS.attendance);
}

// GET /api/attendance?classId=&sessionDate=&userId=&sheetId=
router.get('/attendance', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  try {
    let rows = await readAttendanceRows(sheetId);

    if (req.query.classId) {
      rows = rows.filter(r => r['ClassID'] === req.query.classId);
    }
    if (req.query.sessionDate) {
      rows = rows.filter(r => r['SessionDate'] === req.query.sessionDate);
    }
    if (req.query.userId) {
      rows = rows.filter(r => r['UserID'] === req.query.userId);
    }

    // Enrich with student names
    const users = await readUsersTab(sheetId);
    const userMap = new Map(users.map(u => [u.userId, u]));
    const enriched = rows.map(r => ({
      ...r,
      'Student Name': userMap.get(r['UserID'])?.name || r['UserID'] || '',
      'Student Email': userMap.get(r['UserID'])?.email || '',
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/mark
// Body: { classId, sessionDate (YYYY-MM-DD), userId, status ('Present'|'Absent'|'Late'), notes, markedBy, sheetId }
router.post('/attendance/mark', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'Missing sheetId' }); return; }

  const { classId, sessionDate, userId, status, notes, markedBy } = req.body;
  if (!classId || !sessionDate || !userId || !status) {
    res.status(400).json({ error: 'classId, sessionDate, userId, and status are required' }); return;
  }
  if (!['Present', 'Absent', 'Late'].includes(status)) {
    res.status(400).json({ error: 'status must be Present, Absent, or Late' }); return;
  }

  try {
    const sheets = await getUncachableGoogleSheetClient();
    const TAB = SHEET_TABS.attendance;
    const HEADERS = SHEET_HEADERS.attendance;

    // Check if a record already exists for this class+date+user — update it if so
    const existing = await readAttendanceRows(sheetId);
    const found = existing.find(
      r => r['ClassID'] === classId && r['SessionDate'] === sessionDate && r['UserID'] === userId
    );
    const now = new Date().toISOString();

    if (found) {
      // Update existing row
      const updatedValues = HEADERS.map(h => {
        if (h === 'Status')    return status;
        if (h === 'Notes')     return notes || found['Notes'] || '';
        if (h === 'MarkedBy')  return markedBy || found['MarkedBy'] || '';
        if (h === 'MarkedAt')  return now;
        return found[h] || '';
      });
      const colEnd = String.fromCharCode(64 + HEADERS.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${TAB}!A${found._row}:${colEnd}${found._row}`,
        valueInputOption: 'RAW',
        requestBody: { values: [updatedValues] },
      });
      res.json({ ok: true, updated: true, row: found._row });
    } else {
      // Append new row
      const attendanceId = `ATT-${Date.now()}`;
      const rowValues = HEADERS.map(h => {
        if (h === 'AttendanceID') return attendanceId;
        if (h === 'ClassID')      return classId;
        if (h === 'UserID')       return userId;
        if (h === 'SessionDate')  return sessionDate;
        if (h === 'Status')       return status;
        if (h === 'Notes')        return notes || '';
        if (h === 'MarkedBy')     return markedBy || '';
        if (h === 'MarkedAt')     return now;
        return '';
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      res.json({ ok: true, updated: false, attendanceId });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
