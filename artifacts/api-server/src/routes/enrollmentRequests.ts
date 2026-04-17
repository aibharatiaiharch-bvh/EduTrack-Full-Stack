import { Router } from "express";
import { readTabRows, updateCell, colLetter, SHEET_TABS } from "../lib/googleSheets";

const router = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || "";
}

function tryParseJson(val: string): Record<string, string> {
  try { return val.startsWith("{") ? JSON.parse(val) : {}; } catch { return {}; }
}

// GET /api/enrollment-requests — returns all rows from Enrollments tab, enriched with unpacked notes
router.get("/enrollment-requests", async (req, res) => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: "Missing sheetId" }); return; }
  try {
    const rows = await readTabRows(sheetId, SHEET_TABS.enrollments);

    // Enrich rows: unpack Notes JSON (or legacy EnrolledAt JSON) into named fields
    const enriched = rows.map(row => {
      const extra = tryParseJson(row["Notes"] || "") || tryParseJson(row["EnrolledAt"] || "");
      return {
        ...row,
        "Student Name":       row["Student Name"] || extra.studentName || extra.applicantName || extra.requesterName || "",
        "Parent Email":       row["Parent Email"] || extra.parentEmail || extra.applicantEmail || extra.requesterEmail || row["ParentID"] || "",
        "Classes Interested": row["Classes Interested"] || extra.classesInterested || extra.classWanted || extra.subjects || row["ClassID"] || "",
        "Phone":              extra.parentPhone || extra.phone || "",
        "School":             extra.currentSchool || "",
        "Grade":              extra.currentGrade || "",
        "Previously Enrolled": extra.previouslyEnrolled || "",
        "Reference":          extra.reference || "",
        "Extra Notes":        extra.extra || "",
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/approve
router.post("/enrollment-requests/:row/approve", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) {
    res.status(400).json({ error: "Missing sheetId or row" }); return;
  }
  try {
    const col = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, "Approved");
    res.json({ ok: true, action: "approved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/reject
router.post("/enrollment-requests/:row/reject", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) {
    res.status(400).json({ error: "Missing sheetId or row" }); return;
  }
  try {
    const col = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, "Rejected");
    res.json({ ok: true, action: "rejected" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
