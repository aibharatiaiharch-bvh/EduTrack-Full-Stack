import { Router, type IRouter } from 'express';
import {
  SHEET_TABS, colLetter, generateUserId, generateTabId,
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
        reqId,                   // EnrollmentID
        userId,                  // UserID
        submitterName,           // Student Name
        classesInterested || '', // ClassID (classes interested)
        submitterEmail,          // ParentID (contact email)
        'Pending',               // Status
        now,                     // EnrolledAt
        '', '', '', '',          // TeacherID, Teacher Name, TeacherEmail, Zoom Link
        'new-class',             // Class Type
        '', '',                  // ClassDate, ClassTime
        packedNotes,             // Notes
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
        reqId,                   // EnrollmentID
        userId,                  // UserID
        applicantName,           // Student Name (applicant name)
        classesInterested || '', // ClassID (subjects interested)
        applicantEmail,          // ParentID (contact email)
        'Pending',               // Status
        now,                     // EnrolledAt
        '', '', '', '',          // TeacherID, Teacher Name, TeacherEmail, Zoom Link
        'tutor',                 // Class Type
        '', '',                  // ClassDate, ClassTime
        packedNotes,             // Notes
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
        reqId,                   // EnrollmentID
        userId,                  // UserID
        studentNameClean,        // Student Name
        classesInterested || '', // ClassID (classes interested)
        parentEmailClean,        // ParentID (parent email)
        'Pending',               // Status
        now,                     // EnrolledAt
        '', '', '', '',          // TeacherID, Teacher Name, TeacherEmail, Zoom Link
        'student',               // Class Type
        '', '',                  // ClassDate, ClassTime
        packedNotes,             // Notes
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

      // ── 1. Student user ──────────────────────────────────────────────────
      let studentUser = users.find(u =>
        (studentEmailClean && u.email === studentEmailClean) ||
        (!studentEmailClean && u.email === parentEmailClean && u.role === 'student')
      );
      const userId = studentUser?.userId || await generateUserId('student', sheetId);
      if (!studentUser) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, studentEmailClean || parentEmailClean, 'student', studentNameClean, 'Active', today, now,
        ]);
      } else {
        const rowIdx = (studentUser as any)._row;
        if (rowIdx) await updateCell(sheetId, `${SHEET_TABS.users}!E${rowIdx}`, 'Active');
      }

      // ── 2. Parent user + Parents extension tab ───────────────────────────
      let parentId = '';
      if (parentEmailClean) {
        const freshUsers = await readUsersTab(sheetId);
        const existingParent = freshUsers.find(u => u.email === parentEmailClean && u.role === 'parent');
        if (existingParent) {
          parentId = existingParent.userId;
          const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
          const parentExt = parentRows.find(r => r['UserID'] === parentId || r['ParentID'] === parentId);
          if (parentExt) {
            const children = (parentExt['Children'] || '').split(';').map((c: string) => c.trim()).filter(Boolean);
            if (!children.includes(studentNameClean)) {
              children.push(studentNameClean);
              await updateCell(sheetId, `${SHEET_TABS.parents}!D${parentExt._row}`, children.join('; '));
            }
          } else {
            await appendRow(sheetId, SHEET_TABS.parents, [
              parentId, parentId, existingParent.name, studentNameClean, (s.parentPhone || '').trim(), '',
            ]);
          }
        } else {
          parentId = await generateUserId('parent', sheetId);
          await appendRow(sheetId, SHEET_TABS.users, [
            parentId, parentEmailClean, 'parent', 'Parent', 'Active', today, now,
          ]);
          await appendRow(sheetId, SHEET_TABS.parents, [
            parentId, parentId, 'Parent', studentNameClean, (s.parentPhone || '').trim(), '',
          ]);
        }
      }

      // ── 3. Students extension tab ─────────────────────────────────────────
      const studentExtId = await generateTabId('STU', sheetId, SHEET_TABS.students);
      const isPrev = (s.previouslyEnrolled || '').toLowerCase() === 'yes';
      await appendRow(sheetId, SHEET_TABS.students, [
        studentExtId,
        userId,
        studentNameClean,
        parentId,
        (s.classesInterested || '').trim(),
        (s.parentPhone || '').trim(),
        (s.notes || '').trim(),
        (s.currentSchool || '').trim(),
        (s.currentGrade || '').trim(),
        isPrev ? 'Yes' : 'No',
      ]);

      results.push({ row: i + 1, name: studentNameClean, ok: true, reqId: userId });
    } catch (err: any) {
      results.push({ row: i + 1, name: studentNameClean, ok: false, error: err.message });
    }
  }

  const successCount = results.filter(r => r.ok).length;
  res.json({ results, total: students.length, success: successCount, failed: students.length - successCount });
});

export default router;
