/**
 * Seed script — replaces ALL tab data with clean sample data.
 * Run: node artifacts/api-server/scripts/seed-sheets.mjs
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY env vars.
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
  // id,          email,                              role,        name,                 status, createdAt, updatedAt
  ['DEV-001', 'aibharatiaiharch@gmail.com',       'developer', 'Bharati (Dev)',       'Active', NOW, NOW],
  ['PRN-001', 'bharati.h@gmail.com',             'principal', 'Bharati H',           'Active', NOW, NOW],
  // Teachers
  ['TCH-001', 'sarah.chen@edutrack.com',         'tutor',     'Dr. Sarah Chen',      'Active', NOW, NOW],
  ['TCH-002', 'james.taylor@edutrack.com',       'tutor',     'Mr. James Taylor',    'Active', NOW, NOW],
  ['TCH-003', 'rachel.kim@edutrack.com',         'tutor',     'Ms. Rachel Kim',      'Active', NOW, NOW],
  ['TCH-004', 'priya.sharma@edutrack.com',       'tutor',     'Ms. Priya Sharma',    'Active', NOW, NOW],
  ['TCH-005', 'david.wong@edutrack.com',         'tutor',     'Mr. David Wong',      'Active', NOW, NOW],
  ['TCH-006', 'anita.patel@edutrack.com',        'tutor',     'Ms. Anita Patel',     'Active', NOW, NOW],
  ['TCH-007', 'ravi.kumar@edutrack.com',         'tutor',     'Mr. Ravi Kumar',      'Active', NOW, NOW],
  ['TCH-008', 'lisa.brown@edutrack.com',         'tutor',     'Ms. Lisa Brown',      'Active', NOW, NOW],
  // Students
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
  // Parents
  ['PAR-001', 'parent.patel@mail.com',           'parent',    'Deepa Patel',         'Active', NOW, NOW],
  ['PAR-002', 'parent.nguyen@mail.com',          'parent',    'Minh Nguyen',         'Active', NOW, NOW],
  ['PAR-003', 'parent.sharma@mail.com',          'parent',    'Raj Sharma',          'Active', NOW, NOW],
  ['PAR-004', 'parent.kim@mail.com',             'parent',    'Joon Kim',            'Active', NOW, NOW],
  ['PAR-005', 'parent.ali@mail.com',             'parent',    'Fatima Ali',          'Active', NOW, NOW],
];

const TEACHERS = [
  // TeacherID, UserID,    Name,               Subjects,        Zoom Link,                         Specialty,             Notes
  ['TCH-001', 'TCH-001', 'Dr. Sarah Chen',   'Mathematics',   'https://zoom.us/j/111111',        'Senior Mathematics',  ''],
  ['TCH-002', 'TCH-002', 'Mr. James Taylor', 'English',       'https://zoom.us/j/222222',        'English Literature',  ''],
  ['TCH-003', 'TCH-003', 'Ms. Rachel Kim',   'Science',       'https://zoom.us/j/333333',        'Physics & Chemistry', ''],
  ['TCH-004', 'TCH-004', 'Ms. Priya Sharma', 'Art',           'https://zoom.us/j/444444',        'Visual Arts',         ''],
  ['TCH-005', 'TCH-005', 'Mr. David Wong',   'Music',         'https://zoom.us/j/555555',        'Music Theory & Piano',''],
  ['TCH-006', 'TCH-006', 'Ms. Anita Patel',  'Mathematics',   'https://zoom.us/j/666666',        'Primary Mathematics', ''],
  ['TCH-007', 'TCH-007', 'Mr. Ravi Kumar',   'Science',       'https://zoom.us/j/777777',        'Biology & Chemistry', ''],
  ['TCH-008', 'TCH-008', 'Ms. Lisa Brown',   'English',       'https://zoom.us/j/888888',        'Writing & Grammar',   ''],
];

const STUDENTS = [
  // StudentID, UserID,    Name,           ParentID,  Classes,                     Phone,         Notes, CurrentSchool,         Grade, PreviousStudent
  ['STU-001', 'STU-001', 'Aisha Patel',   'PAR-001', 'SUB-001,SUB-002,SUB-004',  '0411 000 001', '',    'Greenfield Primary',  'Grade 5', 'No'],
  ['STU-002', 'STU-002', 'Liam Nguyen',   'PAR-002', 'SUB-001,SUB-003',          '0411 000 002', '',    'Riverside High',      'Grade 8', 'No'],
  ['STU-003', 'STU-003', 'Maya Sharma',   'PAR-003', 'SUB-002,SUB-003',          '0411 000 003', '',    'Sunnydale Academy',   'Grade 6', 'Yes'],
  ['STU-004', 'STU-004', 'Ethan Kim',     'PAR-004', 'SUB-001,SUB-005',          '0411 000 004', '',    'Lakeside College',    'Grade 9', 'No'],
  ['STU-005', 'STU-005', 'Sara Ali',      'PAR-005', 'SUB-002,SUB-003',          '0411 000 005', '',    'Greenfield Primary',  'Grade 4', 'No'],
  ['STU-006', 'STU-006', 'Noah Chen',     'PAR-001', 'SUB-001,SUB-002',          '0411 000 006', '',    'Riverside High',      'Grade 7', 'Yes'],
  ['STU-007', 'STU-007', 'Zoe Roberts',   'PAR-002', 'SUB-003',                  '0411 000 007', '',    'Sunnydale Academy',   'Grade 5', 'No'],
  ['STU-008', 'STU-008', 'Aarav Singh',   'PAR-003', 'SUB-001,SUB-003',          '0411 000 008', '',    'Lakeside College',    'Grade 10','No'],
  ['STU-009', 'STU-009', 'Chloe Martin',  'PAR-004', 'SUB-002',                  '0411 000 009', '',    'Greenfield Primary',  'Grade 3', 'No'],
  ['STU-010', 'STU-010', 'Leo Pham',      'PAR-005', 'SUB-001,SUB-002',          '0411 000 010', '',    'Riverside High',      'Grade 8', 'Yes'],
];

const PARENTS = [
  // ParentID,  UserID,    Name,          Children,           Phone,         Notes
  ['PAR-001', 'PAR-001', 'Deepa Patel',  'STU-001,STU-006', '0421 100 001', ''],
  ['PAR-002', 'PAR-002', 'Minh Nguyen',  'STU-002,STU-007', '0421 100 002', ''],
  ['PAR-003', 'PAR-003', 'Raj Sharma',   'STU-003,STU-008', '0421 100 003', ''],
  ['PAR-004', 'PAR-004', 'Joon Kim',     'STU-004,STU-009', '0421 100 004', ''],
  ['PAR-005', 'PAR-005', 'Fatima Ali',   'STU-005,STU-010', '0421 100 005', ''],
];

const SUBJECTS = [
  // SubjectID, Name,          Type,         TeacherID, Room,    Days,             Time,       Status,  MaxCapacity
  ['SUB-001', 'Mathematics', 'Group',      'TCH-001', 'Room A1', 'Mon,Wed,Fri',  '9:00 AM',  'Active', '8'],
  ['SUB-002', 'English',     'Group',      'TCH-002', 'Room B2', 'Tue,Thu,Fri',  '11:00 AM', 'Active', '8'],
  ['SUB-003', 'Science',     'Group',      'TCH-003', 'Room C3', 'Mon,Fri',      '2:00 PM',  'Active', '6'],
  ['SUB-004', 'Art',         'Individual', 'TCH-004', 'Room D1', 'Tue,Thu',      '3:00 PM',  'Active', '1'],
  ['SUB-005', 'Music',       'Individual', 'TCH-005', 'Room E2', 'Mon,Fri',      '10:00 AM', 'Active', '1'],
];

// Enrollments — who is enrolled in which subject
// EnrollmentID, UserID, Student Name, ClassID, ParentID, Status, EnrolledAt,
// TeacherID, Teacher Name, TeacherEmail, Zoom Link, Class Type,
// ClassDate, ClassTime, Notes, Fee
const ENROLLMENTS = [
  // Mathematics (SUB-001) — 6 students
  ['ENR-001', 'STU-001', 'Aisha Patel',  'SUB-001', 'PAR-001', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],
  ['ENR-002', 'STU-002', 'Liam Nguyen',  'SUB-001', 'PAR-002', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],
  ['ENR-003', 'STU-004', 'Ethan Kim',    'SUB-001', 'PAR-004', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],
  ['ENR-004', 'STU-006', 'Noah Chen',    'SUB-001', 'PAR-001', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],
  ['ENR-005', 'STU-008', 'Aarav Singh',  'SUB-001', 'PAR-003', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],
  ['ENR-006', 'STU-010', 'Leo Pham',     'SUB-001', 'PAR-005', 'Active', NOW, 'TCH-001', 'Dr. Sarah Chen',   'sarah.chen@edutrack.com',  'https://zoom.us/j/111111', 'Group', '', '9:00 AM', '', 'Not Applicable'],

  // English (SUB-002) — 5 students
  ['ENR-007', 'STU-001', 'Aisha Patel',  'SUB-002', 'PAR-001', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],
  ['ENR-008', 'STU-003', 'Maya Sharma',  'SUB-002', 'PAR-003', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],
  ['ENR-009', 'STU-005', 'Sara Ali',     'SUB-002', 'PAR-005', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],
  ['ENR-010', 'STU-006', 'Noah Chen',    'SUB-002', 'PAR-001', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],
  ['ENR-011', 'STU-009', 'Chloe Martin', 'SUB-002', 'PAR-004', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],
  ['ENR-012', 'STU-010', 'Leo Pham',     'SUB-002', 'PAR-005', 'Active', NOW, 'TCH-002', 'Mr. James Taylor', 'james.taylor@edutrack.com', 'https://zoom.us/j/222222', 'Group', '', '11:00 AM', '', 'Not Applicable'],

  // Science (SUB-003) — 4 students
  ['ENR-013', 'STU-002', 'Liam Nguyen',  'SUB-003', 'PAR-002', 'Active', NOW, 'TCH-003', 'Ms. Rachel Kim',   'rachel.kim@edutrack.com',  'https://zoom.us/j/333333', 'Group', '', '2:00 PM', '', 'Not Applicable'],
  ['ENR-014', 'STU-003', 'Maya Sharma',  'SUB-003', 'PAR-003', 'Active', NOW, 'TCH-003', 'Ms. Rachel Kim',   'rachel.kim@edutrack.com',  'https://zoom.us/j/333333', 'Group', '', '2:00 PM', '', 'Not Applicable'],
  ['ENR-015', 'STU-005', 'Sara Ali',     'SUB-003', 'PAR-005', 'Active', NOW, 'TCH-003', 'Ms. Rachel Kim',   'rachel.kim@edutrack.com',  'https://zoom.us/j/333333', 'Group', '', '2:00 PM', '', 'Not Applicable'],
  ['ENR-016', 'STU-007', 'Zoe Roberts',  'SUB-003', 'PAR-002', 'Active', NOW, 'TCH-003', 'Ms. Rachel Kim',   'rachel.kim@edutrack.com',  'https://zoom.us/j/333333', 'Group', '', '2:00 PM', '', 'Not Applicable'],
  ['ENR-017', 'STU-008', 'Aarav Singh',  'SUB-003', 'PAR-003', 'Active', NOW, 'TCH-003', 'Ms. Rachel Kim',   'rachel.kim@edutrack.com',  'https://zoom.us/j/333333', 'Group', '', '2:00 PM', '', 'Not Applicable'],

  // Art (SUB-004) — 1 student (Individual)
  ['ENR-018', 'STU-001', 'Aisha Patel',  'SUB-004', 'PAR-001', 'Active', NOW, 'TCH-004', 'Ms. Priya Sharma', 'priya.sharma@edutrack.com', 'https://zoom.us/j/444444', 'Individual', '', '3:00 PM', '', 'Not Applicable'],

  // Music (SUB-005) — 1 student (Individual)
  ['ENR-019', 'STU-004', 'Ethan Kim',    'SUB-005', 'PAR-004', 'Active', NOW, 'TCH-005', 'Mr. David Wong',   'david.wong@edutrack.com',  'https://zoom.us/j/555555', 'Individual', '', '10:00 AM', '', 'Not Applicable'],
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

    // 1. Clear the entire tab
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1:Z`,
    });

    // 2. Write header + rows in one shot (UPDATE, not append)
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
