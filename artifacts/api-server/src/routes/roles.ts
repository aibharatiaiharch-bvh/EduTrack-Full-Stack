import { Router, type IRouter } from 'express';
import {
  SHEET_TABS, colLetter, generateUserId,
  readTabRows, readUsersTab, appendRow, updateCell, touchUser,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.query.spreadsheetId ||
    req.body?.sheetId || req.body?.spreadsheetId ||
    req.headers['x-sheet-id'] || '';
}

function parseEmailList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
}

function getDeveloperEmails(): string[] {
  return parseEmailList(process.env.DEVELOPER_EMAIL);
}

function getPrincipalEmails(): string[] {
  return parseEmailList(process.env.PRINCIPAL_EMAIL);
}

function isDeveloperEmail(email: string): boolean {
  return getDeveloperEmails().includes(email.toLowerCase().trim());
}

function isPrincipalEmail(email: string): boolean {
  return getPrincipalEmails().includes(email.toLowerCase().trim());
}

function packNotes(obj: Record<string, string>): string {
  return JSON.stringify(obj);
}

function unpackNotes(notes: string): Record<string, string> {
  try { return JSON.parse(notes); } catch { return {}; }
}

router.get('/roles/check', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  try {
    // Developer and principal bypass — no sheetId needed
    if (isDeveloperEmail(email)) {
      res.json({
        role: 'developer',
        name: process.env.DEVELOPER_NAME || 'Developer',
        status: 'active',
        userId: 'ADM-DEV',
        found: true,
        tabMissing: false,
        sheetId: process.env.DEFAULT_SHEET_ID || null,
      });
      return;
    }

    if (isPrincipalEmail(email)) {
      res.json({
        role: 'principal',
        name: process.env.PRINCIPAL_NAME || 'Principal',
        status: 'active',
        userId: 'PRN-DEV',
        found: true,
        tabMissing: false,
        sheetId: process.env.DEFAULT_SHEET_ID || null,
      });
      return;
    }

    const users = await readUsersTab(sheetId);
    const user = users.find((u) => u.email === email);

    if (user) {
      res.json({
        role: user.role,
        name: user.name,
        status: user.status,
        userId: user.userId,
        found: true,
        tabMissing: false,
      });
      return;
    }

    res.json({ role: null, status: null, found: false, tabMissing: false });
  } catch {
    res.json({ role: null, status: null, found: false, tabMissing: true });
  }
});

router.post('/roles/enroll', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const {
    requestType,
    studentName, studentEmail, previouslyEnrolled, currentSchool, currentGrade,
    age, classesInterested, parentEmail, parentPhone,
    reference, promoCode, notes, userEmail, userName, parentName,
  } = req.body;

  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-AU');

  try {
    if (requestType === 'new-class') {
      const submitterName = (studentName || userName || '').trim();
      const submitterEmail = (parentEmail || userEmail || '').toLowerCase().trim();
      if (!submitterName || !submitterEmail) {
        res.status(400).json({ error: 'Name and email are required for class requests' }); return;
      }
      const users = await readUsersTab(sheetId);
      const user = users.find(u => u.email === submitterEmail);
      const userId = user?.userId || '';
      const reqId = `REQ-${Date.now()}`;
      const packedNotes = packNotes({
        requesterName: submitterName,
        requesterEmail: submitterEmail,
        classWanted: classesInterested || '',
        preferredDays: parentPhone || '',
        preferredTime: currentGrade || '',
        extra: notes || '',
      });
      await appendRow(sheetId, SHEET_TABS.enrollments, [
        reqId, userId, 'new-class', classesInterested || '', 'Pending', now, packedNotes,
      ]);
      res.json({ success: true }); return;
    }

    if (requestType === 'tutor') {
      const applicantName = (studentName || userName || '').trim();
      const applicantEmail = (parentEmail || userEmail || '').toLowerCase().trim();
      if (!applicantName || !applicantEmail) {
        res.status(400).json({ error: 'Name and email are required for tutor applications' }); return;
      }
      const users = await readUsersTab(sheetId);
      let existing = users.find(u => u.email === applicantEmail);
      let userId = existing?.userId || '';
      if (!existing) {
        userId = await generateUserId('tutor', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, applicantEmail, 'tutor', applicantName, 'Pending', today, now,
        ]);
      }
      const reqId = `REQ-${Date.now()}`;
      const packedNotes = packNotes({
        applicantName,
        applicantEmail,
        subjects: classesInterested || '',
        phone: parentPhone || '',
        extra: notes || '',
      });
      await appendRow(sheetId, SHEET_TABS.enrollments, [
        reqId, userId, 'tutor', '', 'Pending', now, packedNotes,
      ]);
      res.json({ success: true }); return;
    }

    if (requestType === 'student') {
      const studentNameClean = (studentName || '').trim();
      const studentEmailClean = (studentEmail || '').toLowerCase().trim();
      const parentEmailClean = (parentEmail || '').toLowerCase().trim();
      if (!studentNameClean || !parentEmailClean) {
        res.status(400).json({ error: 'Student name and parent email are required' }); return;
      }
      const users = await readUsersTab(sheetId);
      let studentUser = users.find(u => u.email === studentEmailClean || u.email === parentEmailClean);
      const userId = studentUser?.userId || await generateUserId('student', sheetId);
      if (!studentUser) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId,
          studentEmailClean || parentEmailClean,
          'student',
          studentNameClean,
          'Pending',
          today,
          now,
        ]);
      }
      const reqId = `REQ-${Date.now()}`;
      const packedNotes = packNotes({
        studentName: studentNameClean,
        studentEmail: studentEmailClean,
        previouslyEnrolled: previouslyEnrolled || '',
        currentSchool: currentSchool || '',
        currentGrade: currentGrade || '',
        age: age || '',
        classesInterested: classesInterested || '',
        parentEmail: parentEmailClean,
        parentPhone: parentPhone || '',
        reference: reference || '',
        promoCode: promoCode || '',
        extra: notes || '',
        submissionDate: now,
      });
      await appendRow(sheetId, SHEET_TABS.enrollments, [
        reqId, userId, 'student', '', 'Pending', now, packedNotes,
      ]);
      res.json({ success: true }); return;
    }

    res.status(400).json({ error: 'Unsupported requestType' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roles/enroll-bulk', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    res.status(400).json({ error: 'students array is required and must not be empty' }); return;
  }
  if (students.length > 200) {
    res.status(400).json({ error: 'Maximum 200 students per upload' }); return;
  }

  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-AU');
  const results: { row: number; name: string; ok: boolean; reqId?: string; error?: string }[] = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const studentNameClean = (s.studentName || '').trim();
    const studentEmailClean = (s.studentEmail || '').toLowerCase().trim();
    const parentEmailClean = (s.parentEmail || '').toLowerCase().trim();

    if (!studentNameClean || !parentEmailClean) {
      results.push({ row: i + 1, name: studentNameClean || `Row ${i + 1}`, ok: false, error: 'Student name and parent email are required' });
      continue;
    }

    try {
      const users = await readUsersTab(sheetId);
      let studentUser = users.find(u =>
        (studentEmailClean && u.email === studentEmailClean) ||
        u.email === parentEmailClean
      );
      const userId = studentUser?.userId || await generateUserId('student', sheetId);
      if (!studentUser) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, studentEmailClean || parentEmailClean, 'student', studentNameClean, 'Active', today, now,
        ]);
      } else {
        // existing user — ensure they are active
        const rowIdx = (studentUser as any)._row;
        if (rowIdx) await updateCell(sheetId, `${SHEET_TABS.users}!E${rowIdx}`, 'Active');
      }
      const reqId = `REQ-${Date.now()}-${i}`;
      const packedNotes = packNotes({
        studentName: studentNameClean,
        studentEmail: studentEmailClean,
        previouslyEnrolled: s.previouslyEnrolled || '',
        currentSchool: s.currentSchool || '',
        currentGrade: s.currentGrade || '',
        age: s.age || '',
        classesInterested: s.classesInterested || '',
        parentEmail: parentEmailClean,
        parentPhone: s.parentPhone || '',
        reference: s.reference || '',
        promoCode: s.promoCode || '',
        extra: s.notes || '',
        submissionDate: now,
      });
      await appendRow(sheetId, SHEET_TABS.enrollments, [
        reqId, userId, 'student', '', 'Active', now, packedNotes,
      ]);
      results.push({ row: i + 1, name: studentNameClean, ok: true, reqId });
    } catch (err: any) {
      results.push({ row: i + 1, name: studentNameClean, ok: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.ok).length;
  res.json({ results, total: students.length, success: successCount, failed: students.length - successCount });
});

export default router;
