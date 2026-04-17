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

// ─── Protect the Name column (col D, index 3) in the Users tab ───────────────
// Called after the first student is added. Idempotent — skips if already set.
async function ensureNameColumnProtected(spreadsheetId: string): Promise<void> {
  try {
    const sheets = await getUncachableGoogleSheetClient();
    const meta   = await sheets.spreadsheets.get({ spreadsheetId });
    const usersTab = meta.data.sheets?.find((s: any) => s.properties?.title === SHEET_TABS.users);
    if (!usersTab) return;

    const numericSheetId = usersTab.properties?.sheetId;

    // Skip if Name column (col D = index 3) is already covered by a protection
    const existing = (usersTab as any).protectedRanges || [];
    const covered  = existing.some((p: any) =>
      p.range?.startColumnIndex <= 3 && p.range?.endColumnIndex > 3
    );
    if (covered) return;

    // Only the service account can edit; everyone else sees a hard block
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const editors = serviceEmail ? { users: [serviceEmail] } : undefined;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId:            numericSheetId,
                startColumnIndex:   3,   // column D = Name
                endColumnIndex:     4,
              },
              description: 'Name — set automatically by EduTrack. Do not edit manually.',
              warningOnly: !editors,
              ...(editors ? { editors } : {}),
            },
          },
        }],
      },
    });
  } catch { /* non-critical — never break student creation */ }
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

    // Write to Teachers extension tab — Name at col C so sheet is always human-readable
    const teacherId = await generateTabId('TCH', sheetId, SHEET_TABS.teachers);
    await appendRow(sheetId, SHEET_TABS.teachers, [
      teacherId, userId,
      name.trim(),                    // col C = Name (denormalised for readability)
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

  const { name, email, phone, parentEmail, parentName, parentPhone, currentSchool, currentGrade, previousStudent, subjectsInterested, notes } = req.body as {
    name?: string; email?: string; phone?: string;
    parentEmail?: string; parentName?: string; parentPhone?: string;
    currentSchool?: string; currentGrade?: string; previousStudent?: boolean | string;
    subjectsInterested?: string[]; notes?: string;
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
            const col = String.fromCharCode(65 + 3); // Children = col D (index 3, after Name at C)
            await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${parentExt._row}`, existing.join('; '));
          }
        } else {
          // Parent in Users but no extension row — create one
          // col C = parent's Name (from Users master), col D = Children (student name)
          await appendRow(sheetId, SHEET_TABS.parents, [
            parentId, parentId,
            existingParentUser.name,  // col C = parent's Name
            name.trim(),              // col D = Children (first child)
            (parentPhone || '').trim(),
            '',
          ]);
        }
      } else {
        // Create new parent
        const resolvedParentName = (parentName || '').trim() || 'Parent';
        parentId = await generateUserId('parent', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          parentId, parentNorm, 'parent', resolvedParentName, 'Active', today, now,
        ]);
        // col C = parent's Name, col D = Children (first child = this student)
        await appendRow(sheetId, SHEET_TABS.parents, [
          parentId, parentId,
          resolvedParentName,   // col C = parent's Name
          name.trim(),          // col D = Children
          (parentPhone || '').trim(),
          '',
        ]);
      }
    }

    // Write to Students extension tab — Name at col C so sheet is always human-readable
    const studentExtId = await generateTabId('STU', sheetId, SHEET_TABS.students);
    const isReEnroll = previousStudent === true || previousStudent === 'true' || previousStudent === 'yes';
    const subjectsStr = Array.isArray(subjectsInterested) ? subjectsInterested.join(', ') : (subjectsInterested || '');
    await appendRow(sheetId, SHEET_TABS.students, [
      studentExtId, studentId,
      name.trim(),                    // col C = Name (denormalised for readability)
      parentId,
      subjectsStr,
      (phone || '').trim(),
      (notes || '').trim(),
      (currentSchool || '').trim(),
      (currentGrade  || '').trim(),
      isReEnroll ? 'Yes' : 'No',
    ]);

    // Fire-and-forget: ensure Name column is protected in the sheet
    ensureNameColumnProtected(sheetId).catch(() => {});

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
      readTabRows(sheetId, SHEET_TABS.enrollments),
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

// ─── POST /api/principals/reassign-teacher ──────────────────────────────────
// Emergency reassignment: updates the teacher on a Subject + all its active Enrollments.
router.post('/principals/reassign-teacher', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { classId, newTeacherId } = req.body as { classId?: string; newTeacherId?: string };
  if (!classId || !newTeacherId) {
    res.status(400).json({ error: 'classId and newTeacherId are required' }); return;
  }

  try {
    const [users, teacherRows, subjectRows, enrollmentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.teachers),
      readTabRows(sheetId, SHEET_TABS.subjects),
      readTabRows(sheetId, SHEET_TABS.enrollments),
    ]);

    // Resolve new teacher details
    const teacherUser = users.find(u => u.userId === newTeacherId);
    if (!teacherUser) { res.status(404).json({ error: 'Teacher not found in Users tab' }); return; }

    const teacherExt  = teacherRows.find(t => t['UserID'] === newTeacherId || t['TeacherID'] === newTeacherId);
    const teacherName  = teacherUser.name;
    const teacherEmail = teacherUser.email;
    const zoomLink     = teacherExt?.['Zoom Link'] || '';

    // 1. Update Subjects tab — TeacherID column (col D, index 3)
    const subject = subjectRows.find(s => (s['SubjectID'] || '').toLowerCase() === classId.toLowerCase());
    if (!subject) { res.status(404).json({ error: 'Class not found in Subjects tab' }); return; }

    const subjectTeacherCol = colLetter('subjects', 'TeacherID');
    await updateCell(sheetId, `${SHEET_TABS.subjects}!${subjectTeacherCol}${subject._row}`, newTeacherId);

    // 2. Update all active Enrollments for this class
    const activeEnrollments = enrollmentRows.filter(e =>
      (e['ClassID'] || '').toLowerCase() === classId.toLowerCase() &&
      !['cancelled', 'rejected'].includes((e['Status'] || '').toLowerCase())
    );

    const teacherIdCol    = colLetter('enrollments', 'TeacherID');
    const teacherNameCol  = colLetter('enrollments', 'Teacher Name');
    const teacherEmailCol = colLetter('enrollments', 'TeacherEmail');
    const zoomLinkCol     = colLetter('enrollments', 'Zoom Link');

    for (const enr of activeEnrollments) {
      await updateCell(sheetId, `${SHEET_TABS.enrollments}!${teacherIdCol}${enr._row}`,    newTeacherId);
      await updateCell(sheetId, `${SHEET_TABS.enrollments}!${teacherNameCol}${enr._row}`,  teacherName);
      await updateCell(sheetId, `${SHEET_TABS.enrollments}!${teacherEmailCol}${enr._row}`, teacherEmail);
      await updateCell(sheetId, `${SHEET_TABS.enrollments}!${zoomLinkCol}${enr._row}`,     zoomLink);
    }

    res.json({
      ok: true,
      updatedEnrollments: activeEnrollments.length,
      teacher: { id: newTeacherId, name: teacherName, email: teacherEmail, zoomLink },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/principals/reconcile-active
// Finds all users who have an Approved enrollment but are still Pending — activates them
router.post('/principals/reconcile-active', async (req, res) => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId required' }); return; }
  try {
    const [enrollRows, users] = await Promise.all([
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readUsersTab(sheetId),
    ]);

    const approvedUserIds = new Set(
      enrollRows
        .filter(r => ['approved', 'paid'].includes((r['Status'] || '').toLowerCase()))
        .map(r => r['UserID'])
        .filter(Boolean)
    );

    const statusCol = colLetter('users', 'Status');
    const fixed: string[] = [];

    for (const user of users) {
      if (user.status === 'pending' && approvedUserIds.has(user.userId)) {
        const row = (user as any)._row;
        if (row) {
          await updateCell(sheetId, `${SHEET_TABS.users}!${statusCol}${row}`, 'Active');
          fixed.push(user.userId);
        }
      }
    }

    res.json({ ok: true, fixed, count: fixed.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/principals/find-duplicates ─────────────────────────────────────
// Scans Users, Students, Teachers, Parents tabs for rows sharing the same ID
router.get('/principals/find-duplicates', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [users, studentRows, teacherRows, parentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.teachers),
      readTabRows(sheetId, SHEET_TABS.parents),
    ]);

    function findDupes(rows: any[], field: string, label: string) {
      const seen = new Map<string, number[]>();
      for (const row of rows) {
        const id = (row[field] || '').trim();
        if (!id) continue;
        if (!seen.has(id)) seen.set(id, []);
        seen.get(id)!.push(row._row);
      }
      return [...seen.entries()]
        .filter(([, rowNums]) => rowNums.length > 1)
        .map(([id, rowNums]) => ({ tab: label, id, rows: rowNums }));
    }

    const userRows = users.map(u => ({ ...u, _row: (u as any)._row }));
    const all = [
      ...findDupes(userRows, 'userId', 'Users'),
      ...findDupes(studentRows, 'UserID', 'Students'),
      ...findDupes(teacherRows, 'UserID', 'Teachers'),
      ...findDupes(parentRows, 'UserID', 'Parents'),
    ];

    res.json({ ok: true, total: all.length, duplicates: all });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/principals/remove-duplicates ───────────────────────────────────
// Deletes duplicate rows in each tab, keeping the FIRST occurrence.
// Rows are deleted from highest to lowest to preserve row numbers during deletion.
router.post('/principals/remove-duplicates', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [users, studentRows, teacherRows, parentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.teachers),
      readTabRows(sheetId, SHEET_TABS.parents),
    ]);

    function dupeRowsToDelete(rows: any[], field: string, tabTitle: string) {
      const seen = new Set<string>();
      const toDelete: { tabTitle: string; row: number }[] = [];
      for (const row of rows) {
        const id = (row[field] || '').trim();
        if (!id) continue;
        if (seen.has(id)) {
          toDelete.push({ tabTitle, row: row._row });
        } else {
          seen.add(id);
        }
      }
      return toDelete;
    }

    const userRows = users.map(u => ({ ...u, _row: (u as any)._row }));
    const toDelete = [
      ...dupeRowsToDelete(userRows, 'userId', SHEET_TABS.users),
      ...dupeRowsToDelete(studentRows, 'UserID', SHEET_TABS.students),
      ...dupeRowsToDelete(teacherRows, 'UserID', SHEET_TABS.teachers),
      ...dupeRowsToDelete(parentRows, 'UserID', SHEET_TABS.parents),
    ];

    if (toDelete.length === 0) {
      res.json({ ok: true, deleted: 0, message: 'No duplicate rows found.' });
      return;
    }

    // Get tab GIDs (Google's internal sheet IDs for batchUpdate)
    const sheets = await getUncachableGoogleSheetClient();
    const meta   = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const gidMap = new Map<string, number>();
    for (const sh of (meta.data.sheets || [])) {
      const title = sh.properties?.title || '';
      const gid   = sh.properties?.sheetId;
      if (gid !== undefined) gidMap.set(title, gid);
    }

    // Delete highest row numbers first so earlier row numbers stay valid
    const sorted = [...toDelete].sort((a, b) => b.row - a.row);
    let deleted = 0;
    for (const { tabTitle, row } of sorted) {
      const gid = gidMap.get(tabTitle);
      if (gid === undefined) continue;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: gid, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
            },
          }],
        },
      });
      deleted++;
    }

    res.json({ ok: true, deleted, message: `Removed ${deleted} duplicate row(s).` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
