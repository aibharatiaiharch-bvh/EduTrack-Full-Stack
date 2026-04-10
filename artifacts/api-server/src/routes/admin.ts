import { Router, type IRouter } from 'express';
import { getUncachableGoogleSheetClient, SHEET_TABS } from '../lib/googleSheets.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || '';
}

async function readConfig(spreadsheetId: string): Promise<Record<string, string>> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.config}!A1:C`,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return {};
  const config: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) config[row[0]] = row[1] || '';
  }
  return config;
}

async function upsertConfigKey(spreadsheetId: string, key: string, value: string): Promise<void> {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TABS.config}!A1:C`,
  });
  const rows = res.data.values || [];
  const today = new Date().toLocaleDateString('en-AU');
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === key);

  if (rowIndex >= 0) {
    const sheetRow = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TABS.config}!A${sheetRow}:C${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[key, value, today]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TABS.config}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[key, value, today]] },
    });
  }
}

// GET /api/admin/features?sheetId=X
// Returns current feature flag states from Config tab
router.get('/admin/features', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  const defaults = { assessments: true, billing: true, schedule: true };
  if (!sheetId) { res.json(defaults); return; }
  try {
    const config = await readConfig(sheetId);
    res.json({
      assessments: config['feature_assessments'] !== 'false',
      billing:     config['feature_billing']     !== 'false',
      schedule:    config['feature_schedule']    !== 'false',
    });
  } catch {
    res.json(defaults);
  }
});

// PUT /api/admin/features?sheetId=X
// Saves feature flag states to Config tab
router.put('/admin/features', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }
  const features = req.body as Record<string, boolean>;
  try {
    for (const [key, value] of Object.entries(features)) {
      await upsertConfigKey(sheetId, `feature_${key}`, String(value));
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/contact?sheetId=X
// Reads from Config tab in Google Sheet; falls back to env var
router.get('/admin/contact', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);

  if (sheetId) {
    try {
      const config = await readConfig(sheetId);
      const email = config['developer_email'] || process.env.DEVELOPER_EMAIL || '';
      const name  = config['developer_name']  || process.env.DEVELOPER_NAME  || 'App Developer';
      res.json({ email, name });
      return;
    } catch {
      // Config tab may not exist yet — fall through to env fallback
    }
  }

  const email = process.env.DEVELOPER_EMAIL || '';
  const name  = process.env.DEVELOPER_NAME  || 'App Developer';
  res.json({ email, name });
});

// PUT /api/admin/contact?sheetId=X
// Updates developer_email and developer_name in the Config tab
router.put('/admin/contact', async (req, res): Promise<void> => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: 'sheetId is required' }); return; }

  const { email, name } = req.body as { email?: string; name?: string };
  if (!email) { res.status(400).json({ error: 'email is required' }); return; }

  try {
    await upsertConfigKey(sheetId, 'developer_email', email.trim());
    if (name) await upsertConfigKey(sheetId, 'developer_name', name.trim());
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
