import { google } from 'googleapis';
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = '1CwS-vj_Qb2gc3VQ5bwpONCNKjibwMCqMOZD_HLT8rQo';
async function dump(tab){const r=await sheets.spreadsheets.values.get({spreadsheetId,range:`${tab}!A1:Z`});return r.data.values||[];}
const enr=await dump('Enrollments');console.log('=== Enrollments ===');for(const r of enr)console.log((r||[]).join(' | '));
const usr=await dump('Users');console.log('\n=== Users ===');for(const r of usr)console.log((r||[]).join(' | '));
const tch=await dump('Teachers');console.log('\n=== Teachers ===');for(const r of tch)console.log((r||[]).join(' | '));
const sub=await dump('Subjects');console.log('\n=== Subjects with TeacherID ===');const h=sub[0];const ti=h.indexOf('TeacherID'),si=h.indexOf('SubjectID'),ni=h.indexOf('Name'),di=h.indexOf('Days');for(const r of sub.slice(1)){if(r[ti])console.log(`${r[si]} | ${r[ni]} | ${r[di]} | TeacherID=${r[ti]}`);}
