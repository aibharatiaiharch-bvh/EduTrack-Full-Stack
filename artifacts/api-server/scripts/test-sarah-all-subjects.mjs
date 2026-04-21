import { google } from 'googleapis';

const spreadsheetId = process.argv[2] || process.env.DEFAULT_SHEET_ID;
const dryRun = process.argv.includes('--dry-run');
if (!spreadsheetId) {
  console.error('Missing spreadsheet id');
  process.exit(1);
}

async function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error('Missing Google service account env vars');
  key = key.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

const sheets = await getClient();

async function read(tab) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z` });
  const values = res.data.values || [];
  const headers = values[0] || [];
  return { headers, rows: values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  }) };
}

const teachers = await read('Teachers');
const subjects = await read('Subjects');

const sarah = teachers.rows.find(t => /sarah/i.test(t.Name || '') && /chen/i.test(t.Name || ''))
  || teachers.rows.find(t => t.TeacherID === 'TCH-001');
if (!sarah) {
  console.error('Could not find Dr. Sarah Chen or TCH-001 in Teachers tab');
  process.exit(1);
}

const sarahTeacherId = sarah.TeacherID;
const sarahName = sarah.Name;
console.log(`Will reassign all ${subjects.rows.length} subjects to ${sarahName} (${sarahTeacherId})`);

// Build alternating Type if you want — but keep existing Types so the aggregation test is real.
const updates = subjects.rows.map(s => {
  const teacherIdCol = subjects.headers.indexOf('TeacherID') + 1;
  const teacherNameCol = subjects.headers.indexOf('Teacher Name') + 1;
  return { row: s._row, teacherIdCol, teacherNameCol };
});

if (dryRun) {
  console.log('Dry-run. Would update', updates.length, 'subject rows.');
  process.exit(0);
}

const data = [];
const colLetter = (n) => String.fromCharCode(64 + n);
for (const u of updates) {
  data.push({ range: `Subjects!${colLetter(u.teacherIdCol)}${u.row}`, values: [[sarahTeacherId]] });
  if (u.teacherNameCol > 0) {
    data.push({ range: `Subjects!${colLetter(u.teacherNameCol)}${u.row}`, values: [[sarahName]] });
  }
}

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: { valueInputOption: 'RAW', data },
});
console.log('Updated', updates.length, 'subjects to point at', sarahTeacherId);
