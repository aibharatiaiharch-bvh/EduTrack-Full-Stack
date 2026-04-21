import { google } from 'googleapis';

const spreadsheetId = process.argv[2] || process.env.DEFAULT_SHEET_ID;
const dryRun = process.argv.includes('--dry-run');
if (!spreadsheetId) {
  console.error('Usage: node clean-parent-names.mjs <spreadsheetId> [--dry-run]');
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
  return {
    headers,
    rows: values.slice(1).map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
      return obj;
    }),
  };
}

const { headers, rows } = await read('Users');
const idCol   = headers.indexOf('UserID');
const nameCol = headers.indexOf('Name');
if (idCol < 0 || nameCol < 0) {
  console.error('Could not find UserID and Name columns in Users tab');
  process.exit(1);
}
const nameColLetter = String.fromCharCode(65 + nameCol);

console.log(`Loaded ${rows.length} Users rows.`);

const updates = [];
for (const r of rows) {
  const id   = (r['UserID'] || '').trim();
  const name = (r['Name'] || '');
  if (!id.startsWith('PAR-')) continue;
  const at = name.indexOf('@');
  if (at < 0) continue;
  const cleaned = name.slice(0, at).trim();
  if (cleaned && cleaned !== name) {
    updates.push({ row: r._row, id, oldName: name, newName: cleaned });
  }
}

if (updates.length === 0) {
  console.log('No PAR- rows with @ in Name. Nothing to do.');
  process.exit(0);
}

console.log(`\nWill update ${updates.length} row(s):`);
for (const u of updates) {
  console.log(`  Row ${u.row} (${u.id}): "${u.oldName}" → "${u.newName}"`);
}

if (dryRun) {
  console.log('\n--dry-run set — no writes performed.');
  process.exit(0);
}

for (const u of updates) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Users!${nameColLetter}${u.row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[u.newName]] },
  });
  console.log(`  ✓ Row ${u.row} updated`);
}
console.log(`\nDone. ${updates.length} row(s) cleaned.`);
