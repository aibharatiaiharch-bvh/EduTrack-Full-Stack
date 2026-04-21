import { google } from 'googleapis';

const spreadsheetId = process.argv[2] || process.env.DEFAULT_SHEET_ID;
const dryRun = process.argv.includes('--dry-run');
if (!spreadsheetId) {
  console.error('Missing spreadsheet id');
  process.exit(1);
}

const sheets = await getClient();

const tabMap = {
  users: 'Users',
  teachers: 'Teachers',
  subjects: 'Subjects',
  students: 'Students',
  enrollments: 'Enrollments',
  attendance: 'Attendance',
};

function normalize(val) {
  return String(val || '').trim();
}

function makeId(prefix, n) {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

async function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Missing Google service account env vars');
  key = key.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

async function read(tab) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z` });
  const values = res.data.values || [];
  const headers = values[0] || [];
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  });
}

async function writeRange(tab, startRow, rows) {
  if (!rows.length || dryRun) return;
  const endCol = String.fromCharCode(65 + rows[0].length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${startRow}:${endCol}${startRow + rows.length - 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

const teacherRows = await read(tabMap.teachers);
const subjectRows = await read(tabMap.subjects);
const studentRows = await read(tabMap.students).catch(() => []);
const enrollmentRows = await read(tabMap.enrollments);
const attendanceRows = await read(tabMap.attendance);

const teacherIdMap = new Map();
const newTeacherRows = [];
let t = 1;
for (const row of teacherRows) {
  const oldId = normalize(row.TeacherID);
  if (!oldId) continue;
  const newId = makeId('TCH', t++);
  teacherIdMap.set(oldId, newId);
  newTeacherRows.push([
    newId,
    normalize(row.UserID),
    normalize(row.Name),
    normalize(row.Subjects),
    normalize(row['Zoom Link']),
    normalize(row.Specialty),
    normalize(row.Notes),
  ]);
}

const subjectIdMap = new Map();
const newSubjectRows = [];
let s = 1;
for (const row of subjectRows) {
  const oldId = normalize(row.SubjectID);
  if (!oldId) continue;
  const newId = makeId('SUB', s++);
  subjectIdMap.set(oldId, newId);
  const oldTeacherId = normalize(row.TeacherID);
  newSubjectRows.push([
    newId,
    normalize(row.Name),
    normalize(row.Type),
    teacherIdMap.get(oldTeacherId) || oldTeacherId,
    normalize(row.Room),
    normalize(row.Days),
    normalize(row.Time),
    normalize(row.Status) || 'Active',
    normalize(row.MaxCapacity),
    normalize(row['Teacher Name']),
  ]);
}

const updatedEnrollments = enrollmentRows.map(row => {
  const classId = normalize(row.ClassID);
  const teacherId = normalize(row.TeacherID);
  return [
    normalize(row.EnrollmentID),
    normalize(row.UserID),
    normalize(row['Student Name']),
    subjectIdMap.get(classId) || classId,
    normalize(row.ParentID),
    normalize(row.Status),
    normalize(row.EnrolledAt),
    teacherIdMap.get(teacherId) || teacherId,
    normalize(row['Teacher Name']),
    normalize(row.TeacherEmail),
    normalize(row['Zoom Link']),
    normalize(row['Class Type']),
    normalize(row.ClassDate),
    normalize(row.ClassTime),
    normalize(row.Notes),
    normalize(row.Fee),
  ];
});

const updatedStudents = studentRows.map(row => {
  const oldList = normalize(row.Classes);
  const remapped = oldList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => subjectIdMap.get(id) || id)
    .join(', ');
  return [
    normalize(row.StudentID),
    normalize(row.UserID),
    normalize(row.Name),
    normalize(row.ParentID),
    remapped,
    normalize(row.Phone),
    normalize(row.Notes),
    normalize(row.CurrentSchool),
    normalize(row.CurrentGrade),
    normalize(row.PreviousStudent),
    normalize(row['Parent Name']),
  ];
});

const updatedAttendance = attendanceRows.map(row => {
  const classId = normalize(row.SubjectID);
  return [
    normalize(row.AttendanceID),
    subjectIdMap.get(classId) || classId,
    normalize(row.UserID),
    normalize(row.SessionDate),
    normalize(row.Status),
    normalize(row.Notes),
    normalize(row.MarkedBy),
    normalize(row.MarkedAt),
    normalize(row.Within24Hrs),
    normalize(row['Student Name']),
    normalize(row['Teacher Name']),
  ];
});

console.log(JSON.stringify({
  dryRun,
  teachersRenumbered: teacherIdMap.size,
  subjectsRenumbered: subjectIdMap.size,
  studentsUpdated: updatedStudents.length,
  enrollmentsUpdated: updatedEnrollments.length,
  attendanceUpdated: updatedAttendance.length,
  sampleTeacherMap: Array.from(teacherIdMap.entries()).slice(0, 3),
  sampleSubjectMap: Array.from(subjectIdMap.entries()).slice(0, 3),
}, null, 2));

await writeRange(tabMap.teachers, 2, newTeacherRows);
await writeRange(tabMap.subjects, 2, newSubjectRows);
await writeRange(tabMap.students, 2, updatedStudents);
await writeRange(tabMap.enrollments, 2, updatedEnrollments);
await writeRange(tabMap.attendance, 2, updatedAttendance);
