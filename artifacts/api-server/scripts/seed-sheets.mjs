/**
 * Seed script — replaces ALL tab data with clean sample data.
 * Run: node artifacts/api-server/scripts/seed-sheets.mjs
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY env vars.
 *
 * NOTE on Subjects schema:
 *   Each Subject row represents ONE (class, day) combination, not the class
 *   in general. A class that runs on multiple days has multiple Subject rows
 *   with the same `Name` but different `Days` and `SubjectID`. Enrollments
 *   reference the day-specific SubjectID, so per-day student lists and counts
 *   are accurate.
 */

import { google } from 'googleapis';

const SHEET_ID = '1CwS-vj_Qb2gc3VQ5bwpONCNKjibwMCqMOZD_HLT8rQo';

const NOW = new Date().toISOString();

// ─── Auth ────────────────────────────────────────────────────────────────────
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  return new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

// ─── Sample data ─────────────────────────────────────────────────────────────

const USERS = [
  ['DEV-001', 'aibharatiaiharch@gmail.com',       'developer', 'Bharati (Dev)',       'Active', NOW, NOW],
  ['PRN-001', 'bharati.h@gmail.com',             'principal', 'Bharati H',           'Active', NOW, NOW],
  ['TCH-001', 'sarah.chen@edutrack.com',         'tutor',     'Dr. Sarah Chen',      'Active', NOW, NOW],
  ['TCH-002', 'james.taylor@edutrack.com',       'tutor',     'Mr. James Taylor',    'Active', NOW, NOW],
  ['TCH-003', 'rachel.kim@edutrack.com',         'tutor',     'Ms. Rachel Kim',      'Active', NOW, NOW],
  ['TCH-004', 'priya.sharma@edutrack.com',       'tutor',     'Ms. Priya Sharma',    'Active', NOW, NOW],
  ['TCH-005', 'david.wong@edutrack.com',         'tutor',     'Mr. David Wong',      'Active', NOW, NOW],
  ['TCH-006', 'anita.patel@edutrack.com',        'tutor',     'Ms. Anita Patel',     'Active', NOW, NOW],
  ['TCH-007', 'ravi.kumar@edutrack.com',         'tutor',     'Mr. Ravi Kumar',      'Active', NOW, NOW],
  ['TCH-008', 'lisa.brown@edutrack.com',         'tutor',     'Ms. Lisa Brown',      'Active', NOW, NOW],
  ['STU-001', 'aisha.patel@mail.com',            'student',   'Aisha Patel',         'Active', NOW, NOW],
  ['STU-002', 'liam.nguyen@mail.com',            'student',   'Liam Nguyen',         'Active', NOW, NOW],
  ['STU-003', 'maya.sharma@mail.com',            'student',   'Maya Sharma',         'Active', NOW, NOW],
  ['STU-004', 'ethan.kim@mail.com',              'student',   'Ethan Kim',           'Active', NOW, NOW],
  ['STU-005', 'sara.ali@mail.com',               'student',   'Sara Ali',            'Active', NOW, NOW],
  ['STU-006', 'noah.chen@mail.com',              'student',   'Noah Chen',           'Active', NOW, NOW],
  ['STU-007', 'zoe.roberts@mail.com',            'student',   'Zoe Roberts',         'Active', NOW, NOW],
  ['STU-008', 'aarav.singh@mail.com',            'student',   'Aarav Singh',         'Active', NOW, NOW],
  ['STU-009', 'chloe.martin@mail.com',           'student',   'Chloe Martin',        'Active', NOW, NOW],
  ['STU-010', 'leo.pham@mail.com',               'student',   'Leo Pham',            'Active', NOW, NOW],
  ['PAR-001', 'parent.patel@mail.com',           'parent',    'Deepa Patel',         'Active', NOW, NOW],
  ['PAR-002', 'parent.nguyen@mail.com',          'parent',    'Minh Nguyen',         'Active', NOW, NOW],
  ['PAR-003', 'parent.sharma@mail.com',          'parent',    'Raj Sharma',          'Active', NOW, NOW],
  ['PAR-004', 'parent.kim@mail.com',             'parent',    'Joon Kim',            'Active', NOW, NOW],
  ['PAR-005', 'parent.ali@mail.com',             'parent',    'Fatima Ali',          'Active', NOW, NOW],
];

const TEACHERS = [
  ['TCH-001', 'TCH-001', 'Dr. Sarah Chen',   'Mathematics',   'https://zoom.us/j/111111',        'Senior Mathematics',  ''],
  ['TCH-002', 'TCH-002', 'Mr. James Taylor', 'English',       'https://zoom.us/j/222222',        'English Literature',  ''],
  ['TCH-003', 'TCH-003', 'Ms. Rachel Kim',   'Science',       'https://zoom.us/j/333333',        'Physics & Chemistry', ''],
  ['TCH-004', 'TCH-004', 'Ms. Priya Sharma', 'Art',           'https://zoom.us/j/444444',        'Visual Arts',         ''],
  ['TCH-005', 'TCH-005', 'Mr. David Wong',   'Music',         'https://zoom.us/j/555555',        'Music Theory & Piano',''],
  ['TCH-006', 'TCH-006', 'Ms. Anita Patel',  'Mathematics',   'https://zoom.us/j/666666',        'Primary Mathematics', ''],
  ['TCH-007', 'TCH-007', 'Mr. Ravi Kumar',   'Science',       'https://zoom.us/j/777777',        'Biology & Chemistry', ''],
  ['TCH-008', 'TCH-008', 'Ms. Lisa Brown',   'English',       'https://zoom.us/j/888888',        'Writing & Grammar',   ''],
];

const PARENTS = [
  ['PAR-001', 'PAR-001', 'Deepa Patel',  'STU-001,STU-006', '0421 100 001', ''],
  ['PAR-002', 'PAR-002', 'Minh Nguyen',  'STU-002,STU-007', '0421 100 002', ''],
  ['PAR-003', 'PAR-003', 'Raj Sharma',   'STU-003,STU-008', '0421 100 003', ''],
  ['PAR-004', 'PAR-004', 'Joon Kim',     'STU-004,STU-009', '0421 100 004', ''],
  ['PAR-005', 'PAR-005', 'Fatima Ali',   'STU-005,STU-010', '0421 100 005', ''],
];

// ─── Subjects: ONE row per (Class, Day) ──────────────────────────────────────
// SubjectID format: SUB-<CLASS>-<DAY>
const SUBJECTS = [
  // Mathematics — Mon, Wed, Fri @ 9:00 AM (Sarah Chen)
  ['SUB-MAT-MON', 'Mathematics', 'Group',      'TCH-001', 'Room A1', 'Mon', '9:00 AM',  'Active', '8'],
  ['SUB-MAT-WED', 'Mathematics', 'Group',      'TCH-001', 'Room A1', 'Wed', '9:00 AM',  'Active', '8'],
  ['SUB-MAT-FRI', 'Mathematics', 'Group',      'TCH-001', 'Room A1', 'Fri', '9:00 AM',  'Active', '8'],
  // English — Tue, Thu, Fri @ 11:00 AM (James Taylor)
  ['SUB-ENG-TUE', 'English',     'Group',      'TCH-002', 'Room B2', 'Tue', '11:00 AM', 'Active', '8'],
  ['SUB-ENG-THU', 'English',     'Group',      'TCH-002', 'Room B2', 'Thu', '11:00 AM', 'Active', '8'],
  ['SUB-ENG-FRI', 'English',     'Group',      'TCH-002', 'Room B2', 'Fri', '11:00 AM', 'Active', '8'],
  // Science — Mon, Fri @ 2:00 PM (Rachel Kim)
  ['SUB-SCI-MON', 'Science',     'Group',      'TCH-003', 'Room C3', 'Mon', '2:00 PM',  'Active', '8'],
  ['SUB-SCI-FRI', 'Science',     'Group',      'TCH-003', 'Room C3', 'Fri', '2:00 PM',  'Active', '8'],
  // Art — Tue, Thu @ 3:00 PM (Priya Sharma) — Individual
  ['SUB-ART-TUE', 'Art',         'Individual', 'TCH-004', 'Room D1', 'Tue', '3:00 PM',  'Active', '1'],
  ['SUB-ART-THU', 'Art',         'Individual', 'TCH-004', 'Room D1', 'Thu', '3:00 PM',  'Active', '1'],
  // Music — Mon, Fri @ 10:00 AM (David Wong) — Individual
  ['SUB-MUS-MON', 'Music',       'Individual', 'TCH-005', 'Room E2', 'Mon', '10:00 AM', 'Active', '1'],
  ['SUB-MUS-FRI', 'Music',       'Individual', 'TCH-005', 'Room E2', 'Fri', '10:00 AM', 'Active', '1'],
];

// Helper to build student name/email lookup for enrollments
const STUDENT_INFO = {
  'STU-001': { name: 'Aisha Patel',   email: 'aisha.patel@mail.com',   parent: 'PAR-001', parentEmail: 'parent.patel@mail.com' },
  'STU-002': { name: 'Liam Nguyen',   email: 'liam.nguyen@mail.com',   parent: 'PAR-002', parentEmail: 'parent.nguyen@mail.com' },
  'STU-003': { name: 'Maya Sharma',   email: 'maya.sharma@mail.com',   parent: 'PAR-003', parentEmail: 'parent.sharma@mail.com' },
  'STU-004': { name: 'Ethan Kim',     email: 'ethan.kim@mail.com',     parent: 'PAR-004', parentEmail: 'parent.kim@mail.com' },
  'STU-005': { name: 'Sara Ali',      email: 'sara.ali@mail.com',      parent: 'PAR-005', parentEmail: 'parent.ali@mail.com' },
  'STU-006': { name: 'Noah Chen',     email: 'noah.chen@mail.com',     parent: 'PAR-001', parentEmail: 'parent.patel@mail.com' },
  'STU-007': { name: 'Zoe Roberts',   email: 'zoe.roberts@mail.com',   parent: 'PAR-002', parentEmail: 'parent.nguyen@mail.com' },
  'STU-008': { name: 'Aarav Singh',   email: 'aarav.singh@mail.com',   parent: 'PAR-003', parentEmail: 'parent.sharma@mail.com' },
  'STU-009': { name: 'Chloe Martin',  email: 'chloe.martin@mail.com',  parent: 'PAR-004', parentEmail: 'parent.kim@mail.com' },
  'STU-010': { name: 'Leo Pham',      email: 'leo.pham@mail.com',      parent: 'PAR-005', parentEmail: 'parent.ali@mail.com' },
};

const SUBJECT_INFO = {
  'SUB-MAT-MON': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen',   teacherEmail: 'sarah.chen@edutrack.com',   zoom: 'https://zoom.us/j/111111', type: 'Group',      time: '9:00 AM',  name: 'Mathematics' },
  'SUB-MAT-WED': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen',   teacherEmail: 'sarah.chen@edutrack.com',   zoom: 'https://zoom.us/j/111111', type: 'Group',      time: '9:00 AM',  name: 'Mathematics' },
  'SUB-MAT-FRI': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen',   teacherEmail: 'sarah.chen@edutrack.com',   zoom: 'https://zoom.us/j/111111', type: 'Group',      time: '9:00 AM',  name: 'Mathematics' },
  'SUB-ENG-TUE': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor', teacherEmail: 'james.taylor@edutrack.com', zoom: 'https://zoom.us/j/222222', type: 'Group',      time: '11:00 AM', name: 'English' },
  'SUB-ENG-THU': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor', teacherEmail: 'james.taylor@edutrack.com', zoom: 'https://zoom.us/j/222222', type: 'Group',      time: '11:00 AM', name: 'English' },
  'SUB-ENG-FRI': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor', teacherEmail: 'james.taylor@edutrack.com', zoom: 'https://zoom.us/j/222222', type: 'Group',      time: '11:00 AM', name: 'English' },
  'SUB-SCI-MON': { teacherId: 'TCH-003', teacherName: 'Ms. Rachel Kim',   teacherEmail: 'rachel.kim@edutrack.com',   zoom: 'https://zoom.us/j/333333', type: 'Group',      time: '2:00 PM',  name: 'Science' },
  'SUB-SCI-FRI': { teacherId: 'TCH-003', teacherName: 'Ms. Rachel Kim',   teacherEmail: 'rachel.kim@edutrack.com',   zoom: 'https://zoom.us/j/333333', type: 'Group',      time: '2:00 PM',  name: 'Science' },
  'SUB-ART-TUE': { teacherId: 'TCH-004', teacherName: 'Ms. Priya Sharma', teacherEmail: 'priya.sharma@edutrack.com', zoom: 'https://zoom.us/j/444444', type: 'Individual', time: '3:00 PM',  name: 'Art' },
  'SUB-ART-THU': { teacherId: 'TCH-004', teacherName: 'Ms. Priya Sharma', teacherEmail: 'priya.sharma@edutrack.com', zoom: 'https://zoom.us/j/444444', type: 'Individual', time: '3:00 PM',  name: 'Art' },
  'SUB-MUS-MON': { teacherId: 'TCH-005', teacherName: 'Mr. David Wong',   teacherEmail: 'david.wong@edutrack.com',   zoom: 'https://zoom.us/j/555555', type: 'Individual', time: '10:00 AM', name: 'Music' },
  'SUB-MUS-FRI': { teacherId: 'TCH-005', teacherName: 'Mr. David Wong',   teacherEmail: 'david.wong@edutrack.com',   zoom: 'https://zoom.us/j/555555', type: 'Individual', time: '10:00 AM', name: 'Music' },
};

// Per-day enrollment design (chosen so the calendar exercises every color):
//   ENG-TUE = 1 (green)   ENG-THU = 6 (amber)   ENG-FRI = 8 (red)
//   MAT-MON = 4 (green)   MAT-WED = 6 (amber)   MAT-FRI = 5 (green)
//   SCI-MON = 5 (green)   SCI-FRI = 7 (amber)
//   ART-TUE/THU = 1 each (Individual)
//   MUS-MON/FRI = 1 each (Individual)
const PER_DAY_ENROLLMENTS = {
  'SUB-ENG-TUE': ['STU-002'], // Liam only
  'SUB-ENG-THU': ['STU-001', 'STU-003', 'STU-005', 'STU-006', 'STU-007', 'STU-009'],
  'SUB-ENG-FRI': ['STU-001', 'STU-003', 'STU-005', 'STU-006', 'STU-007', 'STU-008', 'STU-009', 'STU-010'],
  'SUB-MAT-MON': ['STU-001', 'STU-002', 'STU-004', 'STU-006'],
  'SUB-MAT-WED': ['STU-002', 'STU-004', 'STU-006', 'STU-008', 'STU-009', 'STU-010'],
  'SUB-MAT-FRI': ['STU-001', 'STU-004', 'STU-006', 'STU-008', 'STU-010'],
  'SUB-SCI-MON': ['STU-002', 'STU-003', 'STU-005', 'STU-007', 'STU-008'],
  'SUB-SCI-FRI': ['STU-002', 'STU-003', 'STU-005', 'STU-007', 'STU-008', 'STU-001', 'STU-009'],
  'SUB-ART-TUE': ['STU-001'],
  'SUB-ART-THU': ['STU-003'],
  'SUB-MUS-MON': ['STU-004'],
  'SUB-MUS-FRI': ['STU-006'],
};

// Build ENROLLMENTS rows from PER_DAY_ENROLLMENTS
const ENROLLMENTS = [];
let enrIdx = 1;
for (const [subjectId, studentIds] of Object.entries(PER_DAY_ENROLLMENTS)) {
  const subj = SUBJECT_INFO[subjectId];
  for (const sid of studentIds) {
    const s = STUDENT_INFO[sid];
    ENROLLMENTS.push([
      `ENR-${String(enrIdx++).padStart(3, '0')}`,
      sid, s.name, subjectId, s.parent, 'Active', NOW,
      subj.teacherId, subj.teacherName, subj.teacherEmail, subj.zoom,
      subj.type, '', subj.time, '', 'Not Applicable',
    ]);
  }
}

// Build STUDENTS rows with auto-generated Classes column from PER_DAY_ENROLLMENTS
const studentClasses = {};
for (const [subjectId, studentIds] of Object.entries(PER_DAY_ENROLLMENTS)) {
  for (const sid of studentIds) {
    if (!studentClasses[sid]) studentClasses[sid] = [];
    studentClasses[sid].push(subjectId);
  }
}

const STUDENTS = [
  ['STU-001', 'STU-001', 'Aisha Patel',   'PAR-001', (studentClasses['STU-001'] || []).join(','), '0411 000 001', '', 'Greenfield Primary',  'Grade 5',  'No'],
  ['STU-002', 'STU-002', 'Liam Nguyen',   'PAR-002', (studentClasses['STU-002'] || []).join(','), '0411 000 002', '', 'Riverside High',      'Grade 8',  'No'],
  ['STU-003', 'STU-003', 'Maya Sharma',   'PAR-003', (studentClasses['STU-003'] || []).join(','), '0411 000 003', '', 'Sunnydale Academy',   'Grade 6',  'Yes'],
  ['STU-004', 'STU-004', 'Ethan Kim',     'PAR-004', (studentClasses['STU-004'] || []).join(','), '0411 000 004', '', 'Lakeside College',    'Grade 9',  'No'],
  ['STU-005', 'STU-005', 'Sara Ali',      'PAR-005', (studentClasses['STU-005'] || []).join(','), '0411 000 005', '', 'Greenfield Primary',  'Grade 4',  'No'],
  ['STU-006', 'STU-006', 'Noah Chen',     'PAR-001', (studentClasses['STU-006'] || []).join(','), '0411 000 006', '', 'Riverside High',      'Grade 7',  'Yes'],
  ['STU-007', 'STU-007', 'Zoe Roberts',   'PAR-002', (studentClasses['STU-007'] || []).join(','), '0411 000 007', '', 'Sunnydale Academy',   'Grade 5',  'No'],
  ['STU-008', 'STU-008', 'Aarav Singh',   'PAR-003', (studentClasses['STU-008'] || []).join(','), '0411 000 008', '', 'Lakeside College',    'Grade 10', 'No'],
  ['STU-009', 'STU-009', 'Chloe Martin',  'PAR-004', (studentClasses['STU-009'] || []).join(','), '0411 000 009', '', 'Greenfield Primary',  'Grade 3',  'No'],
  ['STU-010', 'STU-010', 'Leo Pham',      'PAR-005', (studentClasses['STU-010'] || []).join(','), '0411 000 010', '', 'Riverside High',      'Grade 8',  'Yes'],
];

// ─── Sheet tab definitions ────────────────────────────────────────────────────
const TABS = {
  Users:       {
    header: ['UserID','Email','Role','Name','Status','CreatedAt','UpdatedAt'],
    rows: USERS,
  },
  Teachers:    {
    header: ['TeacherID','UserID','Name','Subjects','Zoom Link','Specialty','Notes'],
    rows: TEACHERS,
  },
  Students:    {
    header: ['StudentID','UserID','Name','ParentID','Classes','Phone','Notes','CurrentSchool','CurrentGrade','PreviousStudent'],
    rows: STUDENTS,
  },
  Parents:     {
    header: ['ParentID','UserID','Name','Children','Phone','Notes'],
    rows: PARENTS,
  },
  Subjects:    {
    header: ['SubjectID','Name','Type','TeacherID','Room','Days','Time','Status','MaxCapacity'],
    rows: SUBJECTS,
  },
  Enrollments: {
    header: ['EnrollmentID','UserID','Student Name','ClassID','ParentID','Status','EnrolledAt','TeacherID','Teacher Name','TeacherEmail','Zoom Link','Class Type','ClassDate','ClassTime','Notes','Fee'],
    rows: ENROLLMENTS,
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const auth = getAuth();
  await auth.authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  for (const [tabName, { header, rows }] of Object.entries(TABS)) {
    console.log(`\n⏳ Clearing and seeding "${tabName}"…`);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1:Z`,
    });

    const values = [header, ...rows];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log(`   ✓ ${rows.length} rows written to "${tabName}"`);
  }

  console.log('\n✅ All tabs seeded successfully.\n');
}

main().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
