// Google Sheets integration via Replit Connector
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
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

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
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
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client. Tokens expire.
export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function getUncachableGoogleDriveClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export const SHEET_TABS = {
  students: 'Students',
  teachers: 'Teachers',
  subjects: 'Subjects',
  enrollments: 'Enrollments',
  users: 'Users',
  enrollment_requests: 'Enrollment Requests',
  parents: 'Parents',
  archive: 'Archive',
};

export const SHEET_HEADERS = {
  students: ['UserID', 'Name', 'Email', 'Classes', 'Status', 'Phone', 'Parent Email'],
  teachers: ['UserID', 'Name', 'Email', 'Subjects', 'Role', 'Status'],
  subjects: ['Name', 'Teacher', 'Room', 'Days', 'Status'],
  enrollments: ['Student Name', 'Class Name', 'Class Date', 'Class Time', 'Parent Email', 'Status', 'Override Action'],
  users: ['UserID', 'Email', 'Role', 'Name', 'Added Date', 'Status'],
  enrollment_requests: ['Student Name', 'Date of Birth', 'Current School', 'Current Grade', 'Parent Name', 'Parent Email', 'Parent Phone', 'Student Phone', 'Classes Interested', 'Notes', 'Submission Date', 'Status', 'Request Type'],
  parents: ['Email', 'Parent Name', 'Phone', 'Children', 'Added Date', 'Status'],
  archive: ['UserID', 'Email', 'Role', 'Name', 'Added Date', 'Status', 'Archived Date'],
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
 * Reads existing IDs from Users + Archive tabs so numbers never repeat even after archiving.
 */
export async function generateUserId(role: string, spreadsheetId: string): Promise<string> {
  const prefix = ROLE_PREFIXES[role.toLowerCase()] || 'USR';
  const sheets = await getUncachableGoogleSheetClient();
  const allIds: string[] = [];

  // Scan all tabs that hold UserIDs so numbers never repeat across any tab
  for (const tab of [SHEET_TABS.users, SHEET_TABS.archive, SHEET_TABS.students, SHEET_TABS.teachers]) {
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
