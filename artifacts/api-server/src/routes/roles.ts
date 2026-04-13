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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Pack enrollment form's extra fields into a Notes JSON string. */
function packNotes(obj: Record<string, string>): string {
  return JSON.stringify(obj);
}

/** Unpack Notes JSON. Returns {} on failure. */
function unpackNotes(notes: string): Record<string, string> {
  try { return JSON.parse(notes); } catch { return {}; }
}

// ─── GET /api/roles/check ───────────────────────────────────────────────────
// Users tab is the SINGLE SOURCE OF TRUTH for all roles.
router.get('/roles/check', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const email = ((req.query.email as string) || '').toLowerCase().trim();

  if (!sheetId || !email) {
    res.status(400).json({ error: 'sheetId and email are required' });
    return;
  }

  try {
    const users = await readUsersTab(sheetId);
    const user = users.find((u) => u.email === email);

    if (user) {
      res.json({
        role:       user.role,
        name:       user.name,
        status:     user.status,
        userId:     user.userId,
        found:      true,
        tabMissing: false,
      });
      return;
    }

    // Developer bypass — only when email is NOT in Users tab
    const devEmails = (process.env.DEVELOPER_EMAIL || '')
      .split(',')
      .map(e => e.toLowerCase().trim())
      .filter(Boolean);
    if (devEmails.length > 0 && devEmails.includes(email)) {
      res.json({
        role:       'developer',
        name:       process.env.DEVELOPER_NAME || 'Developer',
        status:     'active',
        userId:     'ADM-DEV',
        found:      true,
        tabMissing: false,
      });
      return;
    }

    res.json({ role: null, status: null, found: false, tabMissing: false });
  } catch {
    res.json({ role: null, status: null, found: false, tabMissing: true });
  }
});

// ─── POST /api/roles/enroll ─────────────────────────────────────────────────
// Submit an enrollment / application / class request.
router.post('/roles/enroll', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const {
    requestType,
    studentName, studentEmail, previouslyEnrolled, currentSchool, currentGrade,
    age, classesInterested, parentEmail, parentPhone,
    reference, promoCode, notes, userEmail, userName, parentName,
  } = req.body;

  const now       = new Date().toISOString();
  const today     = new Date().toLocaleDateString('en-AU');

  try {
    if (requestType === 'new-class') {
      const submitterName  = (studentName || userName || '').trim();
      const submitterEmail = (parentEmail || userEmail || '').toLowerCase().trim();
      if (!submitterName || !submitterEmail) {
        res.status(400).json({ error: 'Name and email are required for class requests' }); return;
      }
      const users   = await readUsersTab(sheetId);
      const user    = users.find(u => u.email === submitterEmail);
      const userId  = user?.userId || '';
      const reqId   = `REQ-${Date.now()}`;
      const packedNotes = packNotes({
        requesterName:  submitterName,
        requesterEmail: submitterEmail,
        classWanted:    classesInterested || '',
        preferredDays:  parentPhone || '',
        preferredTime:  currentGrade || '',
        extra:          notes || '',
      });
      await appendRow(sheetId, SHEET_TABS.enrollment_requests, [
        reqId, userId, 'new-class', classesInterested || '', 'Pending', now, packedNotes,
      ]);
      res.json({ success: true }); return;
    }

    if (requestType === 'tutor') {
      const applicantName  = (studentName || userName || '').trim();
      const applicantEmail = (parentEmail || userEmail || '').toLowerCase().trim();
      if (!applicantName || !applicantEmail) {
        res.status(400).json({ error: 'Name and email are required for tutor applications' }); return;
      }
      // Create / find Users entry as Pending
      const users   = await readUsersTab(sheetId);
      let existing  = users.find(u => u.email === applicantEmail);
      let userId    = existing?.userId || '';
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
        subjects:  classesInterested || '',
        phone:     parentPhone || '',
        extra:     notes || '',
      });
      await appendRow(sheetId, SHEET_TABS.enrollment_requests, [
        reqId, userId, 'tutor', classesInterested || '', 'Pending', now, packedNotes,
      ]);
    } else {
      // Student / family enrollment (default)
      if (!studentName || !parentEmail) {
        res.status(400).json({ error: 'studentName and parentEmail are required' }); return;
      }
      const parentNorm = parentEmail.toLowerCase().trim();
      const users      = await readUsersTab(sheetId);
      const existing   = users.find(u => u.email === parentNorm);
      if (existing && existing.status === 'active') {
        res.status(409).json({ error: 'You are already a user — use the above to log in.' }); return;
      }

      // Write parent to Users tab as Inactive (login gate — can sign in but sees "Awaiting Activation")
      let userId = existing?.userId || '';
      if (!existing) {
        userId = await generateUserId('parent', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, parentNorm, 'parent', (parentName || userName || '').trim() || 'Parent',
          'Inactive', today, now,
        ]);
      }

      const reqId = `REQ-${Date.now()}`;
      const packedNotes = packNotes({
        studentName:      studentName || '',
        studentEmail:     studentEmail || '',
        parentEmail:      parentNorm,
        parentPhone:      parentPhone || '',
        parentName:       parentName || '',
        age:              age || '',
        currentGrade:     currentGrade || '',
        currentSchool:    currentSchool || '',
        previouslyEnrolled: previouslyEnrolled || 'No',
        classesInterested: classesInterested || '',
        reference:        reference || '',
        promoCode:        promoCode || '',
        extra:            notes || '',
        submissionDate:   today,
      });
      await appendRow(sheetId, SHEET_TABS.enrollment_requests, [
        reqId, userId, 'student', classesInterested || '', 'Pending', now, packedNotes,
      ]);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/enrollment-requests?sheetId=X ────────────────────────────────
// Returns requests with resolved display fields (joined from Users).
router.get('/enrollment-requests', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [rows, users] = await Promise.all([
      readTabRows(sheetId, SHEET_TABS.enrollment_requests),
      readUsersTab(sheetId),
    ]);
    const userMap = new Map(users.map(u => [u.userId, u]));

    const enriched = rows.map(r => {
      const extra = unpackNotes(r['Notes'] || '');
      const requester = userMap.get(r['UserID'] || '');
      return {
        _row:               r._row,
        RequestID:          r['RequestID'] || '',
        UserID:             r['UserID'] || '',
        RequestType:        r['RequestType'] || r['Request Type'] || 'student',
        ClassID:            r['ClassID'] || '',
        Status:             r['Status'] || '',
        Timestamp:          r['Timestamp'] || '',
        Notes:              extra['extra'] || '',
        // ── Resolved display fields (joined from Users + packed Notes) ──
        'Request Type':     r['RequestType'] || r['Request Type'] || 'student',
        'Student Name':     extra['studentName']     || extra['applicantName'] || extra['requesterName'] || requester?.name || '',
        'Student Email':    extra['studentEmail']    || extra['applicantEmail'] || extra['requesterEmail'] || requester?.email || '',
        'Parent Email':     extra['parentEmail']     || extra['applicantEmail'] || extra['requesterEmail'] || requester?.email || '',
        'Parent Phone':     extra['parentPhone']     || extra['phone'] || '',
        'Parent Name':      extra['parentName']      || requester?.name || '',
        'Age':              extra['age']             || '',
        'Current Grade':    extra['currentGrade']    || '',
        'Current School':   extra['currentSchool']   || '',
        'Previously Enrolled': extra['previouslyEnrolled'] || 'No',
        'Classes Interested': extra['classesInterested'] || extra['classWanted'] || extra['subjects'] || r['ClassID'] || '',
        'Reference':        extra['reference']       || '',
        'Promo Code':       extra['promoCode']       || '',
        'Submission Date':  extra['submissionDate']  || new Date(r['Timestamp'] || Date.now()).toLocaleDateString('en-AU'),
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollment-requests/:row/approve ────────────────────────────
router.post('/enrollment-requests/:row/approve', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const rowNum  = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: 'sheetId and valid row required' }); return; }

  try {
    const rows = await readTabRows(sheetId, SHEET_TABS.enrollment_requests);
    const request = rows.find(r => r._row === rowNum);
    if (!request) { res.status(404).json({ error: 'Enrollment request not found' }); return; }

    const now     = new Date().toISOString();
    const today   = new Date().toLocaleDateString('en-AU');
    const extra   = unpackNotes(request['Notes'] || '');
    const reqType = (request['RequestType'] || request['Request Type'] || 'student').toLowerCase().trim();

    // Mark request as Active/Approved
    const statusColLetter = colLetter('enrollment_requests', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.enrollment_requests}!${statusColLetter}${rowNum}`, 'Active');

    if (reqType === 'new-class') {
      res.json({ ok: true, requestType: 'new-class' }); return;
    }

    const users = await readUsersTab(sheetId);
    const userMap = new Map(users.map(u => [u.userId, u]));

    if (reqType === 'tutor') {
      // Activate the tutor's Users tab entry
      const applicantUserId = request['UserID'] || '';
      const user = userMap.get(applicantUserId);
      if (user) {
        const sCol = colLetter('users', 'Status');
        await updateCell(sheetId, `${SHEET_TABS.users}!${sCol}${user._row}`, 'Active');
        await touchUser(sheetId, user._row);
        // Add to Teachers tab (extension)
        await appendRow(sheetId, SHEET_TABS.teachers, [
          applicantUserId, applicantUserId,
          extra['subjects'] || '', '', extra['subjects'] || '', extra['extra'] || '',
        ]);
      }
    } else {
      // Student / family approval
      const parentEmail  = extra['parentEmail']  || '';
      const parentName   = extra['parentName']   || 'Parent';
      const studentName  = extra['studentName']  || '';
      const studentEmail = (extra['studentEmail'] || '').toLowerCase().trim();
      const parentPhone  = extra['parentPhone']  || '';

      // Activate the parent in Users tab (already exists as Inactive from enroll step)
      const parentUser = users.find(u => u.email === parentEmail.toLowerCase().trim());
      let parentId = parentUser?.userId || '';
      if (parentUser) {
        const sCol = colLetter('users', 'Status');
        await updateCell(sheetId, `${SHEET_TABS.users}!${sCol}${parentUser._row}`, 'Active');
        await touchUser(sheetId, parentUser._row);
      } else if (parentEmail) {
        // Edge case: parent not in Users yet
        parentId = await generateUserId('parent', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          parentId, parentEmail.toLowerCase().trim(), 'parent', parentName, 'Active', today, now,
        ]);
      }

      // Create student in Users tab + Students extension
      if (studentName) {
        const studentId = await generateUserId('student', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          studentId, studentEmail, 'student', studentName, 'Active', today, now,
        ]);
        await appendRow(sheetId, SHEET_TABS.students, [
          studentId, studentId, parentId, '', parentPhone, extra['extra'] || '',
        ]);
        // Also update Parents extension tab
        const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
        const parentExt  = parentRows.find(r => r['UserID'] === parentId || r['ParentID'] === parentId);
        if (parentExt) {
          const existingChildren = (parentExt['Children'] || '').split(';').map((s: string) => s.trim()).filter(Boolean);
          if (!existingChildren.includes(studentName)) {
            existingChildren.push(studentName);
            const childrenColIdx = 2; // Children is col C (index 2) in new parents schema
            const col = String.fromCharCode(65 + childrenColIdx);
            await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${parentExt._row}`, existingChildren.join('; '));
          }
        } else if (parentId) {
          await appendRow(sheetId, SHEET_TABS.parents, [
            parentId, parentId, studentName, parentPhone, extra['extra'] || '',
          ]);
        }
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/enrollment-requests/:row/reject ─────────────────────────────
router.post('/enrollment-requests/:row/reject', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const rowNum  = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: 'sheetId and valid row required' }); return; }

  try {
    const statusColLetter = colLetter('enrollment_requests', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.enrollment_requests}!${statusColLetter}${rowNum}`, 'Rejected');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
