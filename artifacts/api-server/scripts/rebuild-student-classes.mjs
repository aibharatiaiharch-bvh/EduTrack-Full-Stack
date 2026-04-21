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
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  });
}

const studentRows = await read('Students');
const enrollmentRows = await read('Enrollments');
const subjectRows = await read('Subjects');

const subjectNameById = new Map(subjectRows.map(s => [String(s.SubjectID || '').trim(), String(s.Name || '').trim()]));

const INACTIVE = ['inactive','cancelled','canceled','rejected','late cancellation'];
const activeEnrollments = enrollmentRows.filter(e => !INACTIVE.includes(String(e.Status || '').toLowerCase()));

const classesByUser = new Map();
for (const e of activeEnrollments) {
  const uid = String(e.UserID || '').trim();
  const cid = String(e.ClassID || '').trim();
  if (!uid || !cid) continue;
  const name = subjectNameById.get(cid) || cid;
  if (!classesByUser.has(uid)) classesByUser.set(uid, new Set());
  classesByUser.get(uid).add(name);
}

const updates = [];
const preview = [];
for (const s of studentRows) {
  const uid = String(s.UserID || '').trim();
  const newClasses = Array.from(classesByUser.get(uid) || []).sort().join(', ');
  const oldClasses = String(s.Classes || '').trim();
  if (newClasses !== oldClasses) {
    updates.push({ row: s._row, value: newClasses });
    preview.push({ name: s.Name, before: oldClasses, after: newClasses });
  }
}

console.log(JSON.stringify({ dryRun, totalStudents: studentRows.length, willChange: updates.length, preview }, null, 2));

if (!dryRun && updates.length) {
  const data = updates.map(u => ({ range: `Students!E${u.row}`, values: [[u.value]] }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
  console.log('Wrote', updates.length, 'student rows');
}
