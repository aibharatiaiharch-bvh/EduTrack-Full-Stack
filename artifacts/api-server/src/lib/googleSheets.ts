// Google Sheets integration via Replit Connector in development,
// with service-account fallback for Railway/production.
import { google } from 'googleapis';

let connectionSettings: any;

function hasServiceAccountConfig() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY;
}

function getServiceAccountAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !privateKey) return null;
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });
}

async function getReplitAccessToken() {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Google Sheets connector unavailable');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        Accept: 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data: any) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getAuthClient() {
  if (hasServiceAccountConfig()) {
    try {
      const auth = getServiceAccountAuth();
      if (!auth) throw new Error('Google service account config invalid');
      await auth.authorize();
      return auth;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[googleSheets] Service account auth failed, falling back to Replit connector:', err);
      } else {
        throw err;
      }
    }
  }

  const accessToken = await getReplitAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

// WARNING: Never cache this client. Tokens expire.
export async function getUncachableGoogleSheetClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

export async function getUncachableGoogleDriveClient() {
  const auth = await getAuthClient();
  return google.drive({ version: 'v3', auth });
}

export const SHEET_TABS = {
  users: 'Users',
  students: 'Students',
  teachers: 'Teachers',
  subjects: 'Subjects',
  enrollments: 'Enrollments',
  parents: 'Parents',
  announcements: 'Announcements',
  pushSubscriptions: 'PushSubscriptions',
};

// ─── SCHEMA (Users = master, all others use IDs) ────────────────────────────
// Master: Users tab is the SINGLE SOURCE OF TRUTH for Name, Email, Role, Status.
// Extension tabs (Students, Teachers, Parents) store role-specific fields only.
// Transaction tabs (Enrollments) store IDs + events.
// Never duplicate Name/Email/Status in transactional tabs — join server-side.
export const SHEET_HEADERS = {
  // MASTER — all profile data lives here
  users: ['UserID', 'Email', 'Role', 'Name', 'Status', 'CreatedAt', 'UpdatedAt'],

  // EXTENSIONS — role-specific fields only, linked by UserID
  students: ['StudentID', 'UserID', 'Name', 'ParentID', 'Classes', 'Phone', 'Notes', 'CurrentSchool', 'CurrentGrade', 'PreviousStudent'],
  teachers: ['TeacherID', 'UserID', 'Name', 'Subjects', 'Zoom Link', 'Specialty', 'Notes'],
  parents:  ['ParentID',  'UserID', 'Name', 'Children', 'Phone', 'Notes'],

  // CLASSES — TeacherID FK links to Users; no Name/Email stored here
  subjects: ['SubjectID', 'Name', 'Type', 'TeacherID', 'Room', 'Days', 'Time', 'Status', 'MaxCapacity'],

  // TRANSACTIONS — UserIDs for all FKs; class date/time stored as session data
  enrollments: [
    'EnrollmentID', 'UserID', 'Student Name', 'ClassID', 'ParentID', 'Status', 'EnrolledAt',
    'TeacherID', 'Teacher Name', 'TeacherEmail', 'Zoom Link', 'Class Type',
    'ClassDate', 'ClassTime',
  ],

  // Announcements — standalone, no user FK needed
  announcements: ['AnnouncementID', 'Title', 'Message', 'Priority', 'IsActive', 'CreatedAt'],
};

/** Return the A1 column letter for a named field within a tab's header row. */
export function colLetter(tabKey: keyof typeof SHEET_HEADERS, field: string): string {
  const hdrs = SHEET_HEADERS[tabKey];
  const idx = hdrs.indexOf(field);
  if (idx < 0) throw new Error(`Field "${field}" not found in ${tabKey} headers`);
  return String.fromCharCode(65 + idx);
}

const ROLE_PREFIXES: Record<string, string> = {
  student: 'STU', tutor: 'TCH', teacher: 'TCH',
  parent: 'PAR', principal: 'PRN', admin: 'ADM', developer: 'DEV',
};

/**
 * Generate the next sequential UserID for a given role.
 * Reads existing IDs from Users + Archive tabs so numbers never repeat.
 */
export async function generateUserId(role: string, spreadsheetId: string): Promise<string> {
  const prefix = ROLE_PREFIXES[role.toLowerCase()] || 'USR';
  const sheets = await getUncachableGoogleSheetClient();
  const allIds: string[] = [];

  for (const tab of [SHEET_TABS.users, SHEET_TABS.archive]) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A2:A` });
      (res.data.values || []).forEach((row: any[]) => { if (row[0]) allIds.push(String(row[0])); });
    } catch {}
  }

  const pfx = prefix + '-';
  let max = 0;
  for (const id of allIds) {
    if (id.startsWith(pfx)) {
      const num = parseInt(id.slice(pfx.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${pfx}${String(max + 1).padStart(3, '0')}`;
}

/**
 * Generate the next sequential ID for a given tab prefix.
 */
export async function generateTabId(prefix: string, spreadsheetId: string, tab: string): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();
  let max = 0;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A2:A` });
    (res.data.values || []).forEach((row: any[]) => {
      const id = String(row[0] || '');
      if (id.startsWith(prefix + '-')) {
        const num = parseInt(id.slice(prefix.length + 1), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
  } catch {}
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Generic tab reader — returns rows mapped to header keys. */
export async function readTabRows(
  spreadsheetId: string,
  tab: string,
): Promise<{ _row: number; [k: string]: any }[]> {
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

/** Read Users tab and return normalised user objects. */
export async function readUsersTab(spreadsheetId: string) {
  const rows = await readTabRows(spreadsheetId, SHEET_TABS.users);
  return rows.map(r => ({
    _row: r._row,
    userId:    r['UserID'] || '',
    email:     (r['Email']  || '').toLowerCase().trim(),
    role:      (r['Role']   || '').toLowerCase().trim(),
    name:      r['Name']    || '',
    status:    (r['Status'] || 'active').toLowerCase().trim(),
    createdAt: r['CreatedAt'] || '',
    updatedAt: r['UpdatedAt'] || '',
  }));
}

/** Append a row to a tab. */
export async function appendRow(spreadsheetId: string, tab: string, values: string[]): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

/** Update a single cell. */
export async function updateCell(spreadsheetId: string, range: string, value: string): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

/** Update UpdatedAt column on a Users tab row. */
export async function touchUser(spreadsheetId: string, userRow: number): Promise<void> {
  const col = colLetter('users', 'UpdatedAt');
  await updateCell(spreadsheetId, `${SHEET_TABS.users}!${col}${userRow}`, new Date().toISOString());
}
