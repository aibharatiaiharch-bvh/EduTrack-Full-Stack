import { Router, type IRouter } from 'express';
import {
  getUncachableGoogleSheetClient, SHEET_TABS, SHEET_HEADERS, colLetter,
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

  const { name, email, subjects, specialty, zoomLink, role } = req.body as {
    name?: string; email?: string; subjects?: string; specialty?: string; zoomLink?: string; role?: string;
  };
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  // Allowed staff roles. Defaults to "tutor" for back-compat.
  const ALLOWED_ROLES = new Set(['principal', 'tutor', 'staff']);
  const roleNorm = (role || 'tutor').trim().toLowerCase();
  if (!ALLOWED_ROLES.has(roleNorm)) {
    res.status(400).json({ error: `role must be one of: principal, tutor, staff` });
    return;
  }

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
      // New person — write to Users tab FIRST with the requested role
      userId = await generateUserId(roleNorm, sheetId);
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, emailNorm, roleNorm, name.trim(), 'Active', today, now,
      ]);
    }

    // Write to Teachers extension tab — Name at col C so sheet is always human-readable.
    // TeacherID is set equal to UserID so Subjects.TeacherID === Teachers.TeacherID === Users.UserID.
    // This is the design intent (see enrollmentRequests.ts) and prevents prefix collisions
    // when the staff is a Principal (PRN-) or non-tutor Staff (STF-) rather than a Tutor (TCH-).
    const teacherId = userId;
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

    // Write to Students extension tab — keep student name in col C
    const studentExtId = await generateTabId('STU', sheetId, SHEET_TABS.students);
    const isReEnroll = previousStudent === true || previousStudent === 'true' || previousStudent === 'yes';
    const subjectsStr = Array.isArray(subjectsInterested) ? subjectsInterested.join(', ') : (subjectsInterested || '');
    await appendRow(sheetId, SHEET_TABS.students, [
      studentExtId, studentId,
      parentNorm || '', // col C = Parent Email
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

// ─── POST /api/principals/assign-student-classes ────────────────────────────
// Bulk-assign multiple classes to one Active student.
// Skips classes the student is already actively enrolled in.
router.post('/principals/assign-student-classes', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { userId, classIds } = req.body as { userId?: string; classIds?: string[] };
  if (!userId || !Array.isArray(classIds) || classIds.length === 0) {
    res.status(400).json({ error: 'userId and classIds[] are required' }); return;
  }

  try {
    const [users, studentRows, subjects, enrollments] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.subjects),
      readTabRows(sheetId, SHEET_TABS.enrollments),
    ]);

    const student = users.find(u => u.userId === userId && u.role === 'student' && u.status === 'active');
    if (!student) { res.status(404).json({ error: 'Active student not found' }); return; }

    const studentExt = studentRows.find(r => r['UserID'] === userId);
    const parentId   = studentExt?.['ParentID'] || '';

    const subjectMap = new Map(subjects.map(s => [s['SubjectID'] || '', s]));

    // (UserID, ClassID) pairs already active — skip duplicates
    const existingActive = new Set(
      enrollments
        .filter(r => (r['UserID'] === userId) &&
          ((r['Status'] || '').toLowerCase().trim() !== 'inactive' &&
           (r['Status'] || '').toLowerCase().trim() !== 'cancelled' &&
           (r['Status'] || '').toLowerCase().trim() !== 'canceled'))
        .map(r => r['ClassID'] || ''),
    );

    const baseHeaders = SHEET_HEADERS.enrollments.filter(h => h !== 'Fee');
    const now = new Date().toISOString();
    const sheets = await getUncachableGoogleSheetClient();

    const created: string[] = [];
    const skipped: string[] = [];
    const finalAssignedClassIds = new Set<string>(
      enrollments
        .filter(r => (r['UserID'] === userId) &&
          ((r['Status'] || '').toLowerCase().trim() !== 'inactive' &&
           (r['Status'] || '').toLowerCase().trim() !== 'cancelled' &&
           (r['Status'] || '').toLowerCase().trim() !== 'canceled'))
        .map(r => r['ClassID'] || '')
        .filter(Boolean),
    );

    // Helpers for auto-creating Present attendance rows for past sessions in current month
    const parseWeekday = (days: string): number | null => {
      const d = (days || '').trim().toLowerCase().slice(0, 3);
      const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      return d in map ? map[d] : null;
    };
    const month = new Date().toISOString().slice(0, 7);
    const getSessionDatesInMonth = (m: string, weekdayNum: number): string[] => {
      const [year, mon] = m.split('-').map(Number);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const dates: string[] = [];
      const d = new Date(year, mon - 1, 1);
      while (d.getMonth() === mon - 1) {
        if (d.getDay() === weekdayNum && d <= today) dates.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
      return dates;
    };

    // Pre-load attendance once so we can de-dupe Present rows
    const attendanceRows = await readTabRows(sheetId, SHEET_TABS.attendance);
    const existingAttKeys = new Set(
      attendanceRows.map(r => `${r['SubjectID']}|${r['UserID']}|${r['SessionDate']}`),
    );
    const newAttendanceRows: string[][] = [];
    const HEADERS_AT = SHEET_HEADERS.attendance;

    for (const classId of classIds) {
      if (!classId) continue;
      if (existingActive.has(classId)) { skipped.push(classId); continue; }

      const subject = subjectMap.get(classId);
      const teacherId = subject?.['TeacherID'] || '';
      const teacher   = teacherId ? users.find(u => u.userId === teacherId) : undefined;

      const enrollmentId = await generateTabId('ENR', sheetId, SHEET_TABS.enrollments);
      const rowValues = baseHeaders.map(h => {
        if (h === 'EnrollmentID') return enrollmentId;
        if (h === 'UserID')       return userId;
        if (h === 'Student Name') return student.name || '';
        if (h === 'ClassID')      return classId;
        if (h === 'ParentID')     return parentId;
        if (h === 'Status')       return 'Active';
        if (h === 'EnrolledAt')   return now;
        if (h === 'TeacherID')    return teacherId;
        if (h === 'Teacher Name') return subject?.['Teacher Name'] || teacher?.name || '';
        if (h === 'TeacherEmail') return teacher?.email || '';
        if (h === 'Zoom Link')    return '';
        if (h === 'Class Type')   return subject?.['Type'] || '';
        if (h === 'ClassDate')    return 'TBD';
        if (h === 'ClassTime')    return subject?.['Time'] || 'TBD';
        return '';
      });
      rowValues.push('Not Applicable'); // Fee column at end

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_TABS.enrollments}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
      created.push(classId);
      finalAssignedClassIds.add(classId);

      // ── Default to Present for all past session dates in the current month ──
      const weekdayNum = parseWeekday(subject?.['Days'] || '');
      if (weekdayNum === null) continue;
      const sessionDates = getSessionDatesInMonth(month, weekdayNum);
      const teacherName = subject?.['Teacher Name'] || teacher?.name || '';
      for (const sessionDate of sessionDates) {
        const key = `${classId}|${userId}|${sessionDate}`;
        if (existingAttKeys.has(key)) continue;
        const attendanceId = `ATT-STU-${userId}-${classId}-${sessionDate.replace(/-/g, '')}`;
        const attRow = HEADERS_AT.map(h => {
          if (h === 'AttendanceID') return attendanceId;
          if (h === 'SubjectID')    return classId;
          if (h === 'UserID')       return userId;
          if (h === 'SessionDate')  return sessionDate;
          if (h === 'Status')       return 'Present';
          if (h === 'MarkedBy')     return 'system';
          if (h === 'MarkedAt')     return now;
          if (h === 'Student Name') return student.name || '';
          if (h === 'Teacher Name') return teacherName;
          return '';
        });
        newAttendanceRows.push(attRow);
        existingAttKeys.add(key);
      }
    }

    if (studentExt) {
      const classesCol = colLetter('students', 'Classes');
      await updateCell(sheetId, `${SHEET_TABS.students}!${classesCol}${studentExt._row}`, [...finalAssignedClassIds].join(', '));
    }

    if (newAttendanceRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_TABS.attendance}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newAttendanceRows },
      });
    }

    res.json({ ok: true, created, skipped, attendanceCreated: newAttendanceRows.length });
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
      if (gid !== undefined && gid !== null) gidMap.set(title, gid);
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

// ─── GET /api/principals/students ───────────────────────────────────────────
// Returns all students from Users tab, enriched with extension-tab fields
// (currentGrade, currentSchool, phone, parentId, notes, previousStudent)
// from the Students tab, plus parentPhone from the Parents extension tab.
router.get('/principals/students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const [users, studentRows, parentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.parents),
    ]);

    const students = users.filter(u => u.role === 'student');
    const userMap = new Map(users.map(u => [u.userId, u]));
    const parentExtById = new Map(
      parentRows.map(r => [r['ParentID'] || r['UserID'] || '', r] as const).filter(([k]) => k)
    );
    const enriched = students.map(u => {
      const ext = studentRows.find(r => r['UserID'] === u.userId || r['StudentID'] === u.userId);
      const parentId = ext?.['ParentID'] || '';
      const parentUser = parentId ? userMap.get(parentId) : undefined;
      const parentExt  = parentId ? parentExtById.get(parentId) : undefined;
      return {
        _row:            u._row,
        userId:          u.userId,
        email:           u.email,
        role:            u.role,
        name:            u.name,
        status:          u.status,
        createdAt:       u.createdAt,
        updatedAt:       u.updatedAt,
        currentGrade:    ext?.['CurrentGrade']    || ext?.['currentGrade']    || '',
        currentSchool:   ext?.['CurrentSchool']   || ext?.['currentSchool']   || '',
        phone:           ext?.['Phone']           || '',
        notes:           ext?.['Notes']           || '',
        previousStudent: ext?.['PreviousStudent'] || '',
        parentId,
        parentEmail:     parentUser?.email || '',
        parentName:      parentUser?.name  || ext?.['Parent Name'] || '',
        parentPhone:     parentExt?.['Phone'] || '',
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/principals/students/:userId ───────────────────────────────────
// Inline-edits one or more student fields and writes back to the sheet.
// Accepts any subset of: currentSchool, currentGrade, phone, notes, parentName,
// parentPhone, previousStudent, parentEmail, classes.
//   - Plain Students-tab fields are written to the Students extension tab.
//   - parentPhone is written to the Parents extension tab (looked up by ParentID).
//   - parentName updates BOTH the Users tab Name (master) of the linked parent
//     AND the Students tab "Parent Name" cell (denormalised display copy).
//   - parentEmail re-links the student to a different (or new) parent:
//       * empty   → clears ParentID + Parent Name
//       * existing parent user → re-links to that ParentID
//       * existing user with another role → 409
//       * new email → creates a new parent in Users + Parents tabs
router.put('/principals/students/:userId', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const userId = (req.params.userId || '').trim();
  if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

  const body = (req.body || {}) as {
    currentSchool?: string; currentGrade?: string; phone?: string; notes?: string;
    parentName?: string; parentPhone?: string; previousStudent?: boolean | string;
    parentEmail?: string; classes?: string;
  };

  // Whitelist the fields we accept so unknown keys can't sneak through.
  const ALLOWED = ['currentSchool', 'currentGrade', 'phone', 'notes', 'parentName', 'parentPhone', 'previousStudent', 'parentEmail', 'classes'] as const;
  const provided = ALLOWED.filter(k => Object.prototype.hasOwnProperty.call(body, k));
  if (provided.length === 0) { res.status(400).json({ error: 'No editable fields provided' }); return; }

  try {
    const [users, studentRows, parentRows] = await Promise.all([
      readUsersTab(sheetId),
      readTabRows(sheetId, SHEET_TABS.students),
      readTabRows(sheetId, SHEET_TABS.parents),
    ]);

    const userRow = users.find(u => u.userId === userId);
    if (!userRow || userRow.role !== 'student') {
      res.status(404).json({ error: 'Student not found' }); return;
    }

    const ext = studentRows.find(r => r['UserID'] === userId || r['StudentID'] === userId);
    if (!ext) { res.status(404).json({ error: 'Student extension row not found' }); return; }

    // ── Phase 1: parentEmail relink FIRST, so any parentName/parentPhone in
    // the same payload target the NEW parent (not the old one).
    // Tracks the effective parentId and any newly-appended parent extension row.
    let effectiveParentId = ext['ParentID'] || '';
    let appendedParentExt: { parentId: string; row: Record<string, string> } | null = null;

    if (provided.includes('parentEmail')) {
      const newEmail = (body.parentEmail || '').trim().toLowerCase();
      const parentIdCol = colLetter('students', 'ParentID');
      const parentNameCol = colLetter('students', 'Parent Name');

      if (!newEmail) {
        await updateCell(sheetId, `${SHEET_TABS.students}!${parentIdCol}${ext._row}`, '');
        await updateCell(sheetId, `${SHEET_TABS.students}!${parentNameCol}${ext._row}`, '');
        effectiveParentId = '';
      } else {
        const existing = users.find(u => u.email === newEmail);
        if (existing && existing.role !== 'parent') {
          res.status(409).json({
            error: `Email is already used by a ${existing.role} — pick a different email.`,
          });
          return;
        }

        let newParentId: string;
        let newParentName: string;
        if (existing) {
          newParentId   = existing.userId;
          newParentName = existing.name;
        } else {
          newParentName = (body.parentName || ext['Parent Name'] || 'Parent').trim() || 'Parent';
          newParentId   = await generateUserId('parent', sheetId);
          const today = new Date().toLocaleDateString('en-AU');
          const now   = new Date().toISOString();
          await appendRow(sheetId, SHEET_TABS.users, [
            newParentId, newEmail, 'parent', newParentName, 'Active', today, now,
          ]);
          // Track the newly-appended parent extension row so a same-payload
          // parentPhone write can locate it without another sheet read.
          const newParentExtRow = {
            ParentID: newParentId, UserID: newParentId, Name: newParentName,
            'Children Names': userRow.name || '', Phone: '', Notes: '',
          };
          await appendRow(sheetId, SHEET_TABS.parents, [
            newParentId, newParentId, newParentName, userRow.name || '', '', '',
          ]);
          appendedParentExt = { parentId: newParentId, row: newParentExtRow };
        }

        await updateCell(sheetId, `${SHEET_TABS.students}!${parentIdCol}${ext._row}`, newParentId);
        await updateCell(sheetId, `${SHEET_TABS.students}!${parentNameCol}${ext._row}`, newParentName);
        effectiveParentId = newParentId;
      }
    }

    // ── Phase 2: plain Students-tab fields (excluding parentName which is
    // handled below so it can also sync to the Users tab).
    const studentTabFields: Record<string, string> = {
      currentSchool:   'CurrentSchool',
      currentGrade:    'CurrentGrade',
      phone:           'Phone',
      notes:           'Notes',
      parentName:      'Parent Name',
    classes:         'Classes',
    };

    for (const k of provided) {
      const header = studentTabFields[k];
      if (!header) continue;
      const col = colLetter('students', header);
      const val = String((body as any)[k] ?? '').trim();
      await updateCell(sheetId, `${SHEET_TABS.students}!${col}${ext._row}`, val);
    }

    // previousStudent — normalised to Yes/No
    if (provided.includes('previousStudent')) {
      const v = body.previousStudent;
      const yes = v === true || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes';
      const col = colLetter('students', 'PreviousStudent');
      await updateCell(sheetId, `${SHEET_TABS.students}!${col}${ext._row}`, yes ? 'Yes' : 'No');
    }

    // ── Phase 3: parent-linked writes use effectiveParentId (post-relink).
    if (provided.includes('parentName') && effectiveParentId) {
      const parentUser = users.find(u => u.userId === effectiveParentId);
      if (parentUser) {
        const col = colLetter('users', 'Name');
        await updateCell(sheetId, `${SHEET_TABS.users}!${col}${parentUser._row}`, String(body.parentName || '').trim());
        await touchUser(sheetId, parentUser._row);
      }
      // If we just created the parent in this same request, the Users-tab Name
      // was already set above using body.parentName fallback — no extra write needed.
    }

    if (provided.includes('parentPhone') && effectiveParentId) {
      const parentExt = parentRows.find(r => (r['ParentID'] || r['UserID']) === effectiveParentId);
      const phoneVal = String(body.parentPhone || '').trim();
      if (parentExt) {
        const col = colLetter('parents', 'Phone');
        await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${parentExt._row}`, phoneVal);
      } else if (appendedParentExt && appendedParentExt.parentId === effectiveParentId) {
        // We just appended this parent's extension row in Phase 1 — append a
        // separate row would duplicate, so re-read the appended row and patch
        // its Phone cell. Simplest: read parents tab again to find the new row.
        const refreshed = await readTabRows(sheetId, SHEET_TABS.parents);
        const row = refreshed.find(r => (r['ParentID'] || r['UserID']) === effectiveParentId);
        if (row && phoneVal) {
          const col = colLetter('parents', 'Phone');
          await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${row._row}`, phoneVal);
        }
      } else if (phoneVal) {
        // Linked parent has no extension row yet — create a minimal one.
        const parentUser = users.find(u => u.userId === effectiveParentId);
        await appendRow(sheetId, SHEET_TABS.parents, [
          effectiveParentId, effectiveParentId, parentUser?.name || '', userRow.name || '', phoneVal, '',
        ]);
      }
    }

    await touchUser(sheetId, userRow._row);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
