import { getUncachableGoogleSheetClient, SHEET_TABS } from './googleSheets.js';
import { sendEmail } from './email.js';

const TAB_ENTRIES = Object.entries(SHEET_TABS) as [string, string][];

function toCSV(rows: any[][]): string {
  return rows
    .map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    )
    .join('\n');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export async function sendDailyBackup(spreadsheetId: string): Promise<{ tabsSent: string[]; recipient: string }> {
  const recipient =
    process.env.BACKUP_RECIPIENT ||
    process.env.PRINCIPAL_EMAIL;

  if (!recipient) throw new Error('No recipient — set BACKUP_RECIPIENT or PRINCIPAL_EMAIL.');
  if (!spreadsheetId) throw new Error('No Sheet ID configured.');

  const sheets = await getUncachableGoogleSheetClient();
  const now = new Date();
  const dateStr = formatDate(now);
  const fileDate = now.toISOString().slice(0, 10);

  const tabsSent: string[] = [];
  const attachments: { filename: string; content: string; contentType: string }[] = [];
  const summary: { tab: string; rows: number }[] = [];

  for (const [, tabTitle] of TAB_ENTRIES) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabTitle}!A1:Z`,
      });
      const values = res.data.values || [];
      if (values.length <= 1) {
        summary.push({ tab: tabTitle, rows: 0 });
        continue;
      }
      const dataRows = values.length - 1;
      summary.push({ tab: tabTitle, rows: dataRows });
      attachments.push({
        filename: `${tabTitle.toLowerCase()}_${fileDate}.csv`,
        content: toCSV(values as any[][]),
        contentType: 'text/csv',
      });
      tabsSent.push(tabTitle);
    } catch {
      summary.push({ tab: tabTitle, rows: -1 });
    }
  }

  const totalRecords = summary.reduce((n, s) => n + Math.max(s.rows, 0), 0);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; margin: 0; padding: 0; background: #f5f5f5; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .header { background: #1e3a5f; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 14px; opacity: .8; }
    .body { padding: 28px 32px; }
    .stat { display: inline-block; background: #f0f4ff; border-radius: 8px; padding: 12px 20px; margin-bottom: 24px; }
    .stat .num { font-size: 28px; font-weight: 700; color: #1e3a5f; }
    .stat .label { font-size: 12px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f8f9fa; text-align: left; padding: 10px 12px; font-weight: 600; color: #555; border-bottom: 2px solid #e9ecef; }
    td { padding: 9px 12px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .ok { color: #22863a; font-weight: 600; }
    .zero { color: #999; }
    .error { color: #d73a49; }
    .footer { background: #f8f9fa; padding: 18px 32px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #d4edda; color: #155724; }
    .badge-grey  { background: #e9ecef; color: #6c757d; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>📊 EduTrack Daily Backup</h1>
      <p>${dateStr}</p>
    </div>
    <div class="body">
      <div class="stat">
        <div class="num">${totalRecords}</div>
        <div class="label">Total records across ${tabsSent.length} tabs</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tab</th>
            <th>Records</th>
            <th>CSV</th>
          </tr>
        </thead>
        <tbody>
          ${summary.map(s => `
          <tr>
            <td>${s.tab}</td>
            <td class="${s.rows > 0 ? 'ok' : s.rows === 0 ? 'zero' : 'error'}">${s.rows < 0 ? 'Error' : s.rows}</td>
            <td>${s.rows > 0 ? `<span class="badge badge-green">Attached</span>` : `<span class="badge badge-grey">Empty</span>`}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin-top:20px; font-size:13px; color:#555;">
        CSV files for each tab are attached to this email. Open them in Excel, Google Sheets, or any spreadsheet app.
      </p>
    </div>
    <div class="footer">
      This is an automated daily backup sent by EduTrack. Sheet ID: <code>${spreadsheetId}</code>
    </div>
  </div>
</body>
</html>`;

  await sendEmail({
    to: recipient,
    subject: `EduTrack Daily Backup — ${now.toISOString().slice(0, 10)}`,
    html,
    attachments,
  });

  return { tabsSent, recipient };
}
