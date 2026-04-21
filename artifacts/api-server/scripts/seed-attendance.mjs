/**
 * Seeds the Attendance tab with realistic sample data.
 * Uses correct SubjectID format (SUB-MAT-MON etc.) and fills Student/Teacher Name.
 * Run: node artifacts/api-server/scripts/seed-attendance.mjs
 */
import { google } from 'googleapis';

const SHEET_ID = '1CwS-vj_Qb2gc3VQ5bwpONCNKjibwMCqMOZD_HLT8rQo';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  key = key.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  return new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

// ── Lookup maps ───────────────────────────────────────────────────────────────
const STUDENT = {
  'STU-001': 'Aisha Patel',
  'STU-002': 'Liam Nguyen',
  'STU-003': 'Maya Sharma',
  'STU-004': 'Ethan Kim',
  'STU-005': 'Sara Ali',
  'STU-006': 'Noah Chen',
  'STU-007': 'Zoe Roberts',
  'STU-008': 'Aarav Singh',
  'STU-009': 'Chloe Martin',
  'STU-010': 'Leo Pham',
};

const SUBJECT_TEACHER = {
  'SUB-MAT-MON': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen'   },
  'SUB-MAT-WED': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen'   },
  'SUB-MAT-FRI': { teacherId: 'TCH-001', teacherName: 'Dr. Sarah Chen'   },
  'SUB-ENG-TUE': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor' },
  'SUB-ENG-THU': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor' },
  'SUB-ENG-FRI': { teacherId: 'TCH-002', teacherName: 'Mr. James Taylor' },
  'SUB-SCI-MON': { teacherId: 'TCH-003', teacherName: 'Ms. Rachel Kim'   },
  'SUB-SCI-FRI': { teacherId: 'TCH-003', teacherName: 'Ms. Rachel Kim'   },
  'SUB-ART-TUE': { teacherId: 'TCH-004', teacherName: 'Ms. Priya Sharma' },
  'SUB-ART-THU': { teacherId: 'TCH-004', teacherName: 'Ms. Priya Sharma' },
  'SUB-MUS-MON': { teacherId: 'TCH-005', teacherName: 'Mr. David Wong'   },
  'SUB-MUS-FRI': { teacherId: 'TCH-005', teacherName: 'Mr. David Wong'   },
};

// Per-day enrollments (mirrors seed-sheets.mjs)
const ENROLLMENTS = {
  'SUB-ENG-TUE': ['STU-002'],
  'SUB-ENG-THU': ['STU-001','STU-003','STU-005','STU-006','STU-007','STU-009'],
  'SUB-ENG-FRI': ['STU-001','STU-003','STU-005','STU-006','STU-007','STU-008','STU-009','STU-010'],
  'SUB-MAT-MON': ['STU-001','STU-002','STU-004','STU-006'],
  'SUB-MAT-WED': ['STU-002','STU-004','STU-006','STU-008','STU-009','STU-010'],
  'SUB-MAT-FRI': ['STU-001','STU-004','STU-006','STU-008','STU-010'],
  'SUB-SCI-MON': ['STU-002','STU-003','STU-005','STU-007','STU-008'],
  'SUB-SCI-FRI': ['STU-002','STU-003','STU-005','STU-007','STU-008','STU-001','STU-009'],
  'SUB-ART-TUE': ['STU-001'],
  'SUB-ART-THU': ['STU-003'],
  'SUB-MUS-MON': ['STU-004'],
  'SUB-MUS-FRI': ['STU-006'],
};

// April 2026 session dates by weekday (up to Apr 18 to keep past only)
const DATES = {
  Mon: ['2026-04-06','2026-04-13'],
  Tue: ['2026-04-07','2026-04-14'],
  Wed: ['2026-04-01','2026-04-08','2026-04-15'],
  Thu: ['2026-04-02','2026-04-09','2026-04-16'],
  Fri: ['2026-04-03','2026-04-10','2026-04-17'],
};

// Which SubjectID maps to which weekday key
const SUBJECT_DAY = {
  'SUB-MAT-MON': 'Mon', 'SUB-MAT-WED': 'Wed', 'SUB-MAT-FRI': 'Fri',
  'SUB-ENG-TUE': 'Tue', 'SUB-ENG-THU': 'Thu', 'SUB-ENG-FRI': 'Fri',
  'SUB-SCI-MON': 'Mon', 'SUB-SCI-FRI': 'Fri',
  'SUB-ART-TUE': 'Tue', 'SUB-ART-THU': 'Thu',
  'SUB-MUS-MON': 'Mon', 'SUB-MUS-FRI': 'Fri',
};

// A handful of absences: [subjectId, studentId, sessionDate, within24Hrs, notes]
const ABSENCES = [
  ['SUB-ENG-THU', 'STU-003', '2026-04-02', 'No',  'Parent emailed day before'],
  ['SUB-MAT-MON', 'STU-002', '2026-04-06', 'Yes', 'Same-day cancellation'],
  ['SUB-SCI-FRI', 'STU-005', '2026-04-10', 'No',  'Sick - notified previous day'],
  ['SUB-ENG-FRI', 'STU-008', '2026-04-17', 'Yes', 'Same-day cancellation'],
  ['SUB-MAT-WED', 'STU-009', '2026-04-15', 'No',  'Medical appointment'],
  ['SUB-SCI-MON', 'STU-007', '2026-04-13', 'Yes', 'Last-minute cancel'],
];

const MARKED_AT = '2026-04-18T09:00:00.000Z';
const HEADER = ['AttendanceID','SubjectID','UserID','SessionDate','Status','Notes','MarkedBy','MarkedAt','Within24Hrs','Student Name','Teacher Name'];

async function main() {
  const auth = getAuth();
  await auth.authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  // Build absence lookup for quick check
  const absenceKey = new Set(ABSENCES.map(([s, u, d]) => `${s}::${u}::${d}`));

  const rows = [];
  let idx = 1;

  for (const [subjectId, students] of Object.entries(ENROLLMENTS)) {
    const day = SUBJECT_DAY[subjectId];
    const dates = DATES[day] || [];
    const { teacherId, teacherName } = SUBJECT_TEACHER[subjectId];

    for (const sessionDate of dates) {
      for (const userId of students) {
        const key = `${subjectId}::${userId}::${sessionDate}`;
        const absRow = ABSENCES.find(([s, u, d]) => s === subjectId && u === userId && d === sessionDate);
        const status = absRow ? 'Absent' : 'Present';
        const notes  = absRow ? absRow[4] : '';
        const w24    = absRow ? absRow[3] : '';

        rows.push([
          `ATT-${String(idx++).padStart(3,'0')}`,
          subjectId,
          userId,
          sessionDate,
          status,
          notes,
          absRow ? 'system' : teacherId,
          MARKED_AT,
          w24,
          STUDENT[userId] || userId,
          teacherName,
        ]);
      }
    }
  }

  console.log(`\n⏳ Clearing Attendance data rows…`);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'Attendance!A2:Z' });

  console.log(`⏳ Writing ${rows.length} attendance rows…`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Attendance!A2',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✅ Done — ${rows.length} rows written.\n`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
