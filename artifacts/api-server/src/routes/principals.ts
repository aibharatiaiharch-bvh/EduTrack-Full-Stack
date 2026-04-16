import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, colLetter,
  generateUserId, generateTabId,
  readTabRows, readUsersTab, appendRow, updateCell, touchUser,
} from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || '';
}

async function deleteSheetRow(spreadsheetId: string, tabTitle: string, rowNum: number): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = meta.data.sheets?.find((s: any) => s.properties?.title === tabTitle);
  const sheetId = sheetMeta?.properties?.sheetId;
  if (sheetId === undefined) throw new Error(`Tab "${tabTitle}" not found`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
}

// ─── POST /api/principals/add-teacher ───────────────────────────────────────
// Users tab is written FIRST (master ID registry), then Teachers extension tab.
router.post('/principals/add-teacher', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, subjects, specialty, zoomLink } = req.body as {
    name?: string; email?: string; subjects?: string; specialty?: string; zoomLink?: string;
  };
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const now      = new Date().toISOString();
  const today    = new Date().toLocaleDateString('en-AU');
  const emailNorm = (email || '').trim().toLowerCase();

  try {
    let userId: string;
    const users   = await readUsersTab(sheetId);
    const existing = emailNorm ? users.find(u => u.email === emailNorm) : undefined;

    if (existing) {
      // Reuse existing UserID — person already in Users tab
      userId = existing.userId;
    } else {
      // New person — write to Users tab FIRST
      userId = await generateUserId('tutor', sheetId);
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, emailNorm, 'tutor', name.trim(), 'Active', today, now,
      ]);
    }

    // Write to Teachers extension tab (no Name/Email/Status — join from Users)
    const teacherId = await generateTabId('TCH', sheetId, SHEET_TABS.teachers);
    await appendRow(sheetId, SHEET_TABS.teachers, [
      teacherId, userId,
      (subjects || '').trim(),
      (zoomLink || '').trim(),
      (specialty || '').trim(),
      '',
    ]);

    res.json({ ok: true, userId, teacherId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/principals/add-student ───────────────────────────────────────
// Students default to Active. Parent is created/resolved by parentEmail.
router.post('/principals/add-student', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, phone, parentEmail, parentName, parentPhone } = req.body as {
    name?: string; email?: string; phone?: string;
    parentEmail?: string; parentName?: string; parentPhone?: string;
  };
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const now       = new Date().toISOString();
  const today     = new Date().toLocaleDateString('en-AU');
  const emailNorm = (email || '').trim().toLowerCase();
  const parentNorm = (parentEmail || '').trim().toLowerCase();

  try {
    const users = await readUsersTab(sheetId);
    const existingStudent = emailNorm ? users.find(u => u.email === emailNorm && u.role === 'student') : undefined;

    // Generate a fresh student UserID and write to Users tab (master)
    const studentId = await generateUserId('student', sheetId);
    await appendRow(sheetId, SHEET_TABS.users, [
      studentId, emailNorm, 'student', name.trim(), 'Active', today, now,
    ]);

    // Resolve or create parent
    let parentId = '';
    if (parentNorm) {
      const existingParentUser = users.find(u => u.email === parentNorm && u.role === 'parent');
      if (existingParentUser) {
        parentId = existingParentUser.userId;
        // Append student to parent's Children list in Parents extension tab
        const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
        const parentExt  = parentRows.find(r => r['UserID'] === parentId || r['ParentID'] === parentId);
        if (parentExt) {
          const existing = (parentExt['Children'] || '').split(';').map((s: string) => s.trim()).filter(Boolean);
          if (!existing.includes(name.trim())) {
            existing.push(name.trim());
            const col = String.fromCharCode(65 + 2); // Children = col C (index 2)
            await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${parentExt._row}`, existing.join('; '));
          }
        } else {
          // Parent in Users but no extension row — create one
          await appendRow(sheetId, SHEET_TABS.parents, [
            parentId, parentId, name.trim(), (parentPhone || '').trim(), '',
          ]);
        }
      } else {
        // Create new parent
        parentId = await generateUserId('parent', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          parentId, parentNorm, 'parent',
          (parentName || '').trim() || 'Parent', 'Active', today, now,
        ]);
        await appendRow(sheetId, SHEET_TABS.parents, [
          parentId, parentId, name.trim(), (parentPhone || '').trim(), '',
        ]);
      }
    }

    // Write to Students extension tab
    const studentExtId = await generateTabId('STU', sheetId, SHEET_TABS.students);
    await appendRow(sheetId, SHEET_TABS.students, [
      studentExtId, studentId, parentId, '', (phone || '').trim(), '',
    ]);

    res.json({ ok: true, userId: studentId, parentId, status: 'Active', reusedExisting: !!existingStudent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/principals/pending-students ───────────────────────────────────
// Students explicitly awaiting principal activation.
router.get('/principals/pending-students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const users = await readUsersTab(sheetId);
    const pending = users
      .filter(u => u.role === 'student' && u.status === 'inactive' && !!u.createdAt && u.createdAt === u.updatedAt)
      .map(u => ({
        _row:     u._row,
        UserID:   u.userId,
        Name:     u.name,
        Email:    u.email,
        'Added Date': u.createdAt,
        Status:   u.status,
      }));
    res.json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/principals/teachers ───────────────────────────────────────────
// Returns all active teachers — Users tab (master) joined with Teachers extension.
router.get('/principals/teachers', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [users, teacherRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.teachers),
    ]);
    const userMap = new Map(users.map(u => [u.userId, u]));

    // Active tutors/teachers from Users tab
    const activeTeachers = users.filter(u =>
      (u.role === 'tutor' || u.role === 'teacher') && u.status === 'active'
    );

    const enriched = activeTeachers.map(u => {
      const ext = teacherRows.find(t => t['UserID'] === u.userId || t['TeacherID'] === u.userId);
      return {
        _row:      u._row,
        UserID:    u.userId,
        TeacherID: ext?.['TeacherID'] || u.userId,
        Name:      u.name,
        Email:     u.email,
        Status:    u.status,
        Subjects:  ext?.['Subjects']  || '',
        'Zoom Link': ext?.['Zoom Link'] || '',
        Specialty: ext?.['Specialty'] || '',
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/principals/sync-user-status ──────────────────────────────────
// Activate or deactivate a user — writes to Users tab only (master).
router.post('/principals/sync-user-status', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId, status } = req.body as { userId?: string; status?: string };
  if (!sheetId || !userId || !status) {
    res.status(400).json({ error: 'sheetId, userId, and status are required' }); return;
  }

  try {
    const users = await readUsersTab(sheetId);
    const user  = users.find(u => u.userId === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const normalizedStatus = status.toLowerCase().trim() === 'active' ? 'Active' : 'Inactive';
    const statusCol = colLetter('users', 'Status');
    await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${user._row}`, normalizedStatus);
    await touchUser(sheetId, user._row);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/principals/clear-pending-students ────────────────────────────
// Remove old pending activation rows from the Students extension tab.
router.post('/principals/clear-pending-students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [users, studentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
    ]);
    const activeStudentIds = new Set(users.filter(u => u.role === 'student' && u.status === 'active').map(u => u.userId));
    const pendingRows = studentRows.filter(r => {
      const uid = r['UserID'] || '';
      return uid && !activeStudentIds.has(uid);
    });
    for (const row of pendingRows) {
      await deleteSheetRow(sheetId, SHEET_TABS.students, row._row);
    }
    res.json({ ok: true, removed: pendingRows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/principals/eligible-students ──────────────────────────────────
// Returns Active students linked to a given parent or student email.
// Joins Students extension with Users tab for display.
router.get('/principals/eligible-students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const parentEmail  = ((req.query.parentEmail  as string) || '').toLowerCase().trim();
  const studentEmail = ((req.query.studentEmail as string) || '').toLowerCase().trim();

  try {
    const [users, studentRows, parentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.parents),
    ]);
    const userMap = new Map(users.map(u => [u.userId, u]));

    // Find parent UserID from email
    let parentId = '';
    if (parentEmail) {
      const parentUser = users.find(u => u.email === parentEmail && u.role === 'parent');
      parentId = parentUser?.userId || '';
    }

    // Find student UserID from email
    let studentUserId = '';
    if (studentEmail) {
      const studentUser = users.find(u => u.email === studentEmail);
      studentUserId = studentUser?.userId || '';
    }

    const eligible = studentRows
      .filter(r => {
        const user = userMap.get(r['UserID'] || '');
        if (!user || user.status !== 'active') return false;
        if (parentId    && r['ParentID'] === parentId) return true;
        if (studentUserId && r['UserID'] === studentUserId) return true;
        return false;
      })
      .map(r => {
        const user   = userMap.get(r['UserID'] || '');
        const parent = userMap.get(r['ParentID'] || '');
        return {
          name:        user?.name  || r['UserID'] || '',
          email:       user?.email || '',
          userId:      r['UserID'] || '',
          parentEmail: parent?.email || '',
          classes:     r['Classes'] || '',
        };
      });

    res.json(eligible);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/principals/students-availability ──────────────────────────────
// All active students with enrollment state for a given class (by SubjectID or name).
router.get('/principals/students-availability', async (req, res): Promise<void> => {
  const sheetId   = getSheetId(req);
  const classParam = ((req.query.className as string) || (req.query.classId as string) || '').toLowerCase().trim();
  if (!sheetId)     { res.status(400).json({ error: 'sheetId is required' }); return; }
  if (!classParam)  { res.status(400).json({ error: 'className or classId is required' }); return; }

  try {
    const [users, studentRows, enrollments, subjects] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readTabRows(sheetId, SHEET_TABS.subjects),
    ]);
    const userMap = new Map(users.map(u => [u.userId, u]));

    // Resolve ClassID from name or direct ID
    const matchingSubject = subjects.find(s =>
      (s['SubjectID'] || '').toLowerCase() === classParam ||
      (s['Name']      || '').toLowerCase() === classParam
    );
    const classId = matchingSubject?.['SubjectID'] || classParam;

    // All UserIDs enrolled in this class
    const enrolledUserIds = new Set(
      enrollments
        .filter(r =>
          (r['ClassID'] || '').toLowerCase() === classId.toLowerCase() ||
          (r['ClassID'] || '').toLowerCase() === classParam
        )
        .map(r => r['UserID'] || '')
        .filter(Boolean),
    );

    const result = studentRows
      .filter(r => {
        const user = userMap.get(r['UserID'] || '');
        return user && user.status === 'active';
      })
      .map(r => {
        const user   = userMap.get(r['UserID'] || '');
        const parent = userMap.get(r['ParentID'] || '');
        return {
          name:        user?.name  || r['UserID'] || '',
          email:       user?.email || '',
          userId:      r['UserID'] || '',
          parentEmail: parent?.email || '',
          classes:     r['Classes'] || '',
          enrolled:    enrolledUserIds.has(r['UserID'] || ''),
        };
      });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/principals/reconcile ─────────────────────────────────────────
// Manual Reconcile Job: validates child tab UserIDs against Users master list,
// flags orphans, and ensures extension rows exist for all active users.
router.post('/principals/reconcile', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  try {
    const [users, studentRows, teacherRows, parentRows, enrollments, enrollmentRequests] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.teachers),
      readTabRows(sheetId, SHEET_TABS.parents),
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readTabRows(sheetId, SHEET_TABS.enrollment_requests),
    ]);

    const userIdSet  = new Set(users.map(u => u.userId));
    const report: {
      orphans: { tab: string; id: string; field: string }[];
      missingExtensions: { userId: string; role: string }[];
      fixedUpdatedAt: string[];
    } = {
      orphans: [],
      missingExtensions: [],
      fixedUpdatedAt: [],
    };

    // ── 1. Check Students extension — every UserID must exist in Users ──
    for (const row of studentRows) {
      const uid = row['UserID'] || '';
      if (uid && !userIdSet.has(uid)) {
        report.orphans.push({ tab: 'Students', id: uid, field: 'UserID' });
      }
      const parentId = row['ParentID'] || '';
      if (parentId && !userIdSet.has(parentId)) {
        report.orphans.push({ tab: 'Students', id: parentId, field: 'ParentID' });
      }
    }

    // ── 2. Check Teachers extension ──
    for (const row of teacherRows) {
      const uid = row['UserID'] || '';
      if (uid && !userIdSet.has(uid)) {
        report.orphans.push({ tab: 'Teachers', id: uid, field: 'UserID' });
      }
    }

    // ── 3. Check Parents extension ──
    for (const row of parentRows) {
      const uid = row['UserID'] || '';
      if (uid && !userIdSet.has(uid)) {
        report.orphans.push({ tab: 'Parents', id: uid, field: 'UserID' });
      }
    }

    // ── 4. Check Enrollments — UserID + ParentID + TeacherID ──
    for (const row of enrollments) {
      const uid = row['UserID'] || '';
      if (uid && !userIdSet.has(uid)) {
        report.orphans.push({ tab: 'Enrollments', id: uid, field: 'UserID' });
      }
      const pid = row['ParentID'] || '';
      if (pid && !userIdSet.has(pid)) {
        report.orphans.push({ tab: 'Enrollments', id: pid, field: 'ParentID' });
      }
      const tid = row['TeacherID'] || '';
      if (tid && !userIdSet.has(tid)) {
        report.orphans.push({ tab: 'Enrollments', id: tid, field: 'TeacherID' });
      }
    }

    // ── 5. Check Enrollment Requests ──
    for (const row of enrollmentRequests) {
      const uid = row['UserID'] || '';
      if (uid && !userIdSet.has(uid)) {
        report.orphans.push({ tab: 'Enrollment Requests', id: uid, field: 'UserID' });
      }
    }

    // ── 6. Verify active users have extension rows ──
    const studentUserIds  = new Set(studentRows.map(r => r['UserID'] || ''));
    const teacherUserIds  = new Set(teacherRows.map(r => r['UserID'] || ''));
    const parentUserIds   = new Set(parentRows.map(r => r['UserID']  || ''));

    for (const user of users) {
      if (user.status !== 'active') continue;
      if (user.role === 'student' && !studentUserIds.has(user.userId)) {
        report.missingExtensions.push({ userId: user.userId, role: 'student' });
      }
      if ((user.role === 'tutor' || user.role === 'teacher') && !teacherUserIds.has(user.userId)) {
        report.missingExtensions.push({ userId: user.userId, role: 'teacher' });
      }
      if (user.role === 'parent' && !parentUserIds.has(user.userId)) {
        report.missingExtensions.push({ userId: user.userId, role: 'parent' });
      }
    }

    // ── 7. Ensure UpdatedAt is populated on all Users rows ──
    const now = new Date().toISOString();
    const updatedAtCol = colLetter('users', 'UpdatedAt');
    for (const user of users) {
      if (!user.updatedAt) {
        await updateCell(sheetId, `${SHEET_TABS.users}!${updatedAtCol}${user._row}`, now);
        report.fixedUpdatedAt.push(user.userId);
      }
    }

    res.json({
      ok:       true,
      summary: {
        orphans:           report.orphans.length,
        missingExtensions: report.missingExtensions.length,
        fixedUpdatedAt:    report.fixedUpdatedAt.length,
      },
      details: report,
      message:  report.orphans.length === 0 && report.missingExtensions.length === 0
        ? 'All data is consistent. No issues found.'
        : `Found ${report.orphans.length} orphaned ID(s) and ${report.missingExtensions.length} missing extension row(s).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
