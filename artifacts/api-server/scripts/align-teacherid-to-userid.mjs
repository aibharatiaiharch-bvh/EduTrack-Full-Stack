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

const teachers = await read('Teachers');
console.log(`Loaded ${teachers.length} Teachers rows.`);

const updates = [];
for (const t of teachers) {
  const tid = (t['TeacherID'] || '').trim();
  const uid = (t['UserID'] || '').trim();
  if (uid && tid !== uid) {
    updates.push({ row: t._row, name: t['Name'], oldTid: tid, newTid: uid });
  }
}

if (updates.length === 0) {
  console.log('All TeacherIDs already match their UserID. Nothing to do.');
  process.exit(0);
}

console.log(`\nWill update ${updates.length} row(s):`);
for (const u of updates) {
  console.log(`  Row ${u.row}: ${u.name}  TeacherID  ${u.oldTid} → ${u.newTid}`);
}

if (dryRun) {
  console.log('\n--dry-run set — no writes performed.');
  process.exit(0);
}

for (const u of updates) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Teachers!A${u.row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[u.newTid]] },
  });
  console.log(`  ✓ Row ${u.row} updated`);
}
console.log(`\nDone. ${updates.length} row(s) aligned.`);
