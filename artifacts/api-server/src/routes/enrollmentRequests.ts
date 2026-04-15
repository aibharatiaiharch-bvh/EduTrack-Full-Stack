import { Router } from "express";
import { getSheets, updateCell } from "../lib/googleSheets";

const router = Router();
const TAB = "EnrollmentRequests";

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || "";
}

async function readRequestRows(spreadsheetId: string) {
  try {
    const sheets = await getSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabExists = meta.data.sheets?.some(
      (s) => s.properties?.title === TAB
    );
    if (!tabExists) return [];

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!A1:Z`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map((row, i) => {
      const obj: Record<string, any> = { _row: i + 2 };
      headers.forEach((h: string, idx: number) => {
        obj[h] = row[idx] ?? "";
      });
      return obj;
    });
  } catch {
    return [];
  }
}

// GET /api/enrollment-requests
router.get("/api/enrollment-requests", async (req, res) => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: "Missing sheetId" }); return; }
  try {
    const rows = await readRequestRows(sheetId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/approve
router.post("/api/enrollment-requests/:row/approve", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) {
    res.status(400).json({ error: "Missing sheetId or row" }); return;
  }
  try {
    const rows = await readRequestRows(sheetId);
    const headers = rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== "_row") : [];
    const statusCol = String.fromCharCode(65 + headers.indexOf("Status"));
    if (statusCol !== "@") {
      await updateCell(sheetId, `${TAB}!${statusCol}${rowNum}`, "Approved");
    }
    res.json({ ok: true, action: "approved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/reject
router.post("/api/enrollment-requests/:row/reject", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) {
    res.status(400).json({ error: "Missing sheetId or row" }); return;
  }
  try {
    const rows = await readRequestRows(sheetId);
    const headers = rows.length > 0 ? Object.keys(rows[0]).filter(k => k !== "_row") : [];
    const statusCol = String.fromCharCode(65 + headers.indexOf("Status"));
    if (statusCol !== "@") {
      await updateCell(sheetId, `${TAB}!${statusCol}${rowNum}`, "Rejected");
    }
    res.json({ ok: true, action: "rejected" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
