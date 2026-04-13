import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS, generateUserId } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
}

async function appendRow(spreadsheetId: string, tab: string, values: string[]): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function updateCell(spreadsheetId: string, range: string, value: string): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

async function readRows(spreadsheetId: string, tab: string): Promise<{ _row: number; [k: string]: any }[]> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z` });
  const rows = res.data.values || [];
  if (rows.length < 1) return [];
  const headerRow = rows[0] as string[];
  return rows.slice(1).map((row, i) => {
    const obj: any = { _row: i + 2 };
    headerRow.forEach((h, idx) => { obj[h] = (row as string[])[idx] || ''; });
    return obj;
  });
}

// POST /api/principals/add-teacher
// Users tab is written FIRST (master ID registry), then Teachers tab gets the same ID.
router.post('/principals/add-teacher', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, subjects, role: teacherRole } = req.body as {
    name?: string; email?: string; subjects?: string; role?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const today = new Date().toLocaleDateString('en-AU');
  const emailNorm = (email || '').trim().toLowerCase();

  try {
    let userId: string;

    if (emailNorm) {
      // Check if this email already has a Users tab entry — reuse their existing ID
      const users = await readRows(sheetId, SHEET_TABS.users);
      const existing = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (existing) {
        // Person already exists — reuse their ID so Teachers tab and Users tab stay in sync
        userId = existing['UserID'] || await generateUserId('tutor', sheetId);
      } else {
        // New person — generate ID and write to Users tab FIRST
        userId = await generateUserId('tutor', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'tutor', name.trim(), today, 'Active',
        ]);
      }
    } else {
      // No email — generate ID and register in Users tab without login ability
      userId = await generateUserId('tutor', sheetId);
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, '', 'tutor', name.trim(), today, 'Active',
      ]);
    }

    // Write to Teachers tab with the same UserID
    await appendRow(sheetId, SHEET_TABS.teachers, [
      userId,
      name.trim(),
      emailNorm,
      (subjects || '').trim(),
      (teacherRole || 'Tutor').trim(),
      'Active',
    ]);

    res.json({ ok: true, userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/principals/add-student
// Adds a student to the Students tab with a unique UserID.
// Students default to Inactive — the principal must activate them (e.g. after payment).
// If an email is provided, also creates a Users tab entry (role: student/Inactive).
// Links the student to their parent via ParentID if parentEmail is supplied.
router.post('/principals/add-student', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { name, email, phone, parentEmail, parentName, parentPhone } = req.body as {
    name?: string; email?: string; phone?: string;
    parentEmail?: string; parentName?: string; parentPhone?: string;
  };

  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const emailNorm    = (email || '').trim().toLowerCase();
  const parentNorm   = (parentEmail || '').trim().toLowerCase();
  const today        = new Date().toLocaleDateString('en-AU');

  try {
    // Generate a unique student UserID
    const userId = await generateUserId('student', sheetId);

    // Register in Users tab as Inactive — requires principal activation
    if (emailNorm) {
      const users = await readRows(sheetId, SHEET_TABS.users);
      const exists = users.find(u => (u['Email'] || '').toLowerCase().trim() === emailNorm);
      if (!exists) {
        await appendRow(sheetId, SHEET_TABS.users, [
          userId, emailNorm, 'student', name.trim(), today, 'Inactive',
        ]);
      }
    } else {
      await appendRow(sheetId, SHEET_TABS.users, [
        userId, '', 'student', name.trim(), today, 'Inactive',
      ]);
    }

    // Resolve Parent ID — look up or create parent record
    let parentId = '';
    if (parentNorm) {
      // Check if parent already exists in the Users tab
      const users = await readRows(sheetId, SHEET_TABS.users);
      const existingParentUser = users.find(u =>
        (u['Email'] || '').toLowerCase().trim() === parentNorm && u['Role'] === 'parent'
      );
      if (existingParentUser) {
        parentId = existingParentUser['UserID'] || '';
      }
      if (!parentId) {
        // Check Parents tab for an existing record with a ParentID
        const parents = await readRows(sheetId, SHEET_TABS.parents);
        const existingParent = parents.find(p =>
          (p['Email'] || '').toLowerCase().trim() === parentNorm
        );
        if (existingParent) {
          parentId = existingParent['ParentID'] || '';
          // Update Children list on the existing parent row
          if (existingParent._row) {
            const existingChildren = (existingParent['Children'] || '').split(';').map((s: string) => s.trim()).filter(Boolean);
            if (!existingChildren.includes(name.trim())) {
              existingChildren.push(name.trim());
              const sheets = await getUncachableGoogleSheetClient();
              const childrenIdx = 3; // Children is column D (index 3)
              const col = String.fromCharCode(65 + childrenIdx);
              await sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `${SHEET_TABS.parents}!${col}${existingParent._row}`,
                valueInputOption: 'RAW',
                requestBody: { values: [[existingChildren.join('; ')]] },
              });
            }
          }
        }
      }
      if (!parentId) {
        // Create new parent record
        parentId = await generateUserId('parent', sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          parentId, parentNorm, 'parent', (parentName || '').trim() || 'Parent', today, 'Active',
        ]);
        await appendRow(sheetId, SHEET_TABS.parents, [
          parentNorm, (parentName || '').trim() || 'Parent',
          (parentPhone || '').trim(), name.trim(), today, 'Active', parentId,
        ]);
      }
    }

    // Write to Students tab with status mirrored from Users tab
    await appendRow(sheetId, SHEET_TABS.students, [
      userId,
      name.trim(),
      emailNorm,
      '',
      'Active',
      (phone || '').trim(),
      parentNorm,
      parentId,
    ]);

    res.json({ ok: true, userId, parentId, status: 'Active' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principals/pending-students?sheetId=X
// Returns students in Inactive status — awaiting principal activation (e.g. after payment).
router.get('/principals/pending-students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const users = await readRows(sheetId, SHEET_TABS.users);
    const pending = users.filter(u =>
      u['Role'] === 'student' && (u['Status'] || '').toLowerCase() === 'inactive'
    );
    res.json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principals/teachers?sheetId=X
// Returns all active teachers from the Teachers tab for dropdown population.
router.get('/principals/teachers', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  try {
    const rows = await readRows(sheetId, SHEET_TABS.teachers);
    const active = rows.filter(r => (r['Status'] || '').toLowerCase() === 'active');
    res.json(active);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/principals/sync-user-status', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const { userId, status } = req.body as { userId?: string; status?: string };
  if (!sheetId || !userId || !status) { res.status(400).json({ error: 'sheetId, userId, and status are required' }); return; }

  try {
    const users = await readRows(sheetId, SHEET_TABS.users);
    const user = users.find(u => u['UserID'] === userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const normalizedStatus = status.toLowerCase().trim() === 'active' ? 'Active' : 'Inactive';
    const userStatusCol = 'F';
    await appendRow(sheetId, SHEET_TABS.archive, [
      user['UserID'] || '',
      user['Email'] || '',
      user['Role'] || '',
      user['Name'] || '',
      user['Added Date'] || '',
      normalizedStatus,
      new Date().toLocaleDateString('en-AU'),
    ]);

    if ((user['Role'] || '').toLowerCase().trim() === 'student') {
      const studentRows = await readRows(sheetId, SHEET_TABS.students);
      const student = studentRows.find(r =>
        (r['UserID'] || '') === userId ||
        ((r['Email'] || '').toLowerCase().trim() === (user['Email'] || '').toLowerCase().trim())
      );
      if (student) {
        const studentStatusCol = 'E';
        await updateCell(sheetId, `${SHEET_TABS.students}!${studentStatusCol}${student._row}`, normalizedStatus);
      }
    }

    if ((user['Role'] || '').toLowerCase().trim() === 'tutor' || (user['Role'] || '').toLowerCase().trim() === 'teacher') {
      const teacherRows = await readRows(sheetId, SHEET_TABS.teachers);
      const teacher = teacherRows.find(r =>
        (r['UserID'] || '') === userId ||
        ((r['Email'] || '').toLowerCase().trim() === (user['Email'] || '').toLowerCase().trim())
      );
      if (teacher) {
        const teacherStatusCol = 'F';
        await updateCell(sheetId, `${SHEET_TABS.teachers}!${teacherStatusCol}${teacher._row}`, normalizedStatus);
      }
    }

    await updateCell(sheetId, `${SHEET_TABS.users}!${userStatusCol}${user._row}`, normalizedStatus);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principals/eligible-students
// Returns Active students from the Students tab linked to a given parent or student email.
// Used by the Join Class form to show a dropdown of who can enrol.
router.get('/principals/eligible-students', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const parentEmail  = ((req.query.parentEmail  as string) || '').toLowerCase().trim();
  const studentEmail = ((req.query.studentEmail as string) || '').toLowerCase().trim();

  try {
    const rows = await readRows(sheetId, SHEET_TABS.students);
    const eligible = rows.filter(r => {
      const status = (r['Status'] || '').toLowerCase().trim();
      if (status !== 'active') return false;
      if (parentEmail  && (r['Parent Email'] || '').toLowerCase().trim() === parentEmail)  return true;
      if (studentEmail && (r['Email'] || '').toLowerCase().trim() === studentEmail) return true;
      return false;
    }).map(r => ({
      name:        r['Name'] || '',
      email:       r['Email'] || '',
      userId:      r['UserID'] || '',
      parentEmail: r['Parent Email'] || '',
      classes:     r['Classes'] || '',
    }));

    res.json(eligible);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principals/students-availability
// Returns all active students plus enrollment state for a given class.
router.get('/principals/students-availability', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const className = ((req.query.className as string) || '').toLowerCase().trim();
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  if (!className) { res.status(400).json({ error: 'className is required' }); return; }

  try {
    const [students, enrollments] = await Promise.all([
      readRows(sheetId, SHEET_TABS.students),
      readRows(sheetId, SHEET_TABS.enrollments),
    ]);

    const enrolledNames = new Set(
      enrollments
        .filter(r => (r['Class Name'] || '').toLowerCase().trim() === className)
        .map(r => (r['Student Name'] || '').toLowerCase().trim())
        .filter(Boolean),
    );

    const activeStudents = students
      .filter(r => (r['Status'] || '').toLowerCase().trim() === 'active')
      .map(r => {
        const name = r['Name'] || '';
        return {
          name,
          email: r['Email'] || '',
          userId: r['UserID'] || '',
          parentEmail: r['Parent Email'] || '',
          classes: r['Classes'] || '',
          enrolled: enrolledNames.has(name.toLowerCase().trim()),
        };
      });

    res.json(activeStudents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
