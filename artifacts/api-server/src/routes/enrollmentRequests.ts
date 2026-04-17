import { Router } from "express";
import { readTabRows, readUsersTab, updateCell, colLetter, SHEET_TABS, appendRow, generateUserId, generateTabId } from "../lib/googleSheets";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { getSetting } from "../lib/settings";

const router = Router();

function getSheetId(req: any): string {
  return req.query.sheetId || req.body?.sheetId || process.env.DEFAULT_SHEET_ID || "";
}

function tryParseJson(val: string): Record<string, string> {
  try { return val.startsWith("{") ? JSON.parse(val) : {}; } catch { return {}; }
}

function buildWelcomeEmail(studentName: string, classes: string, principalName: string): string {
  const classLine = classes
    ? `<p>You have expressed interest in: <strong>${classes}</strong>. Our team will be in touch shortly to confirm class placement and scheduling details.</p>`
    : `<p>Our team will be in touch shortly to confirm class placement and scheduling details.</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #1d4ed8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Welcome to EduTrack!</h1>
      </div>
      <div style="padding: 32px; background: #f9fafb; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px;">Dear Parent/Guardian of <strong>${studentName}</strong>,</p>
        <p>We are delighted to welcome <strong>${studentName}</strong> to our tutoring program. Your enrolment request has been reviewed and <strong>approved</strong>.</p>
        ${classLine}
        <p>If you have any questions in the meantime, please don't hesitate to reply to this email — we're happy to help.</p>
        <p style="margin-top: 32px;">Warm regards,<br/>
        <strong>${principalName}</strong><br/>
        <span style="color: #6b7280; font-size: 14px;">EduTrack</span></p>
      </div>
    </div>
  `;
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

      // Build a human-readable "Requested On" date from available sources
      const rawDate = extra.submittedAt || extra.createdAt || (
        row["EnrolledAt"] && !row["EnrolledAt"].startsWith("{") ? row["EnrolledAt"] : ""
      );
      let requestedOn = "";
      if (rawDate) {
        try {
          requestedOn = new Date(rawDate).toLocaleDateString("en-AU", {
            day: "numeric", month: "short", year: "numeric",
          });
        } catch { requestedOn = rawDate; }
      }

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
        "Requested On":       requestedOn,
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: read and enrich an enrollment row
async function getEnrollRow(sheetId: string, rowNum: number) {
  const [enrollRows, users] = await Promise.all([
    readTabRows(sheetId, SHEET_TABS.enrollments),
    readUsersTab(sheetId),
  ]);
  const enrollRow = enrollRows.find(r => r._row === rowNum);
  const extra = enrollRow ? (tryParseJson(enrollRow["Notes"] || "") || tryParseJson(enrollRow["EnrolledAt"] || "")) : {};
  return { enrollRow, users, extra };
}

// Helper: activate student, create parent user + extension rows
async function activateStudent(sheetId: string, enrollRow: any, users: any[], extra: any) {
  const studentUserId = enrollRow["UserID"] || "";
  const studentName   = enrollRow["Student Name"] || extra.studentName || extra.applicantName || "";
  const parentEmail   = (extra.parentEmail || extra.applicantEmail || enrollRow["ParentID"] || "").toLowerCase().trim();
  const parentPhone   = extra.parentPhone || extra.phone || "";
  const classes       = enrollRow["ClassID"] || extra.classesInterested || extra.subjects || "";
  const currentSchool = extra.currentSchool || "";
  const currentGrade  = extra.currentGrade || "";
  const now           = new Date().toISOString();

  // Activate student in Users tab
  if (studentUserId) {
    const studentUser = users.find((u: any) => u.userId === studentUserId);
    if (studentUser && (studentUser as any)._row) {
      const col = colLetter("users", "Status");
      await updateCell(sheetId, `${SHEET_TABS.users}!${col}${(studentUser as any)._row}`, "Active");
    }
  }

  // Ensure student row in Students tab
  if (studentUserId && studentName) {
    const studentRows = await readTabRows(sheetId, SHEET_TABS.students);
    const existing = studentRows.find(r => r["UserID"] === studentUserId || r["StudentID"] === studentUserId);
    if (!existing) {
      const parentUser = users.find((u: any) => u.email === parentEmail && u.role === "parent");
      await appendRow(sheetId, SHEET_TABS.students, [
        studentUserId, studentUserId, studentName, parentUser?.userId || "",
        classes, "", "", currentSchool, currentGrade, "No",
      ]);
    }
  }

  // Ensure parent user in Users tab
  let parentUserId = "";
  if (parentEmail) {
    const existingParent = users.find((u: any) => u.email === parentEmail && u.role === "parent");
    if (existingParent) {
      parentUserId = existingParent.userId;
    } else {
      parentUserId = await generateUserId("parent", sheetId);
      await appendRow(sheetId, SHEET_TABS.users, [
        parentUserId, parentEmail, "parent", "Parent", "Active", now, now,
      ]);
    }
  }

  // Ensure parent row in Parents tab
  if (parentUserId && studentName) {
    const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
    const existingParentRow = parentRows.find(r => r["UserID"] === parentUserId || r["ParentID"] === parentUserId);
    if (existingParentRow) {
      const currentChildren = existingParentRow["Children"] || "";
      const names = currentChildren ? currentChildren.split(";").map((n: string) => n.trim()) : [];
      if (!names.includes(studentName)) {
        names.push(studentName);
        const col = colLetter("parents", "Children");
        await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${existingParentRow._row}`, names.join("; "));
      }
    } else {
      const parentTabId = await generateTabId("PAR", sheetId, SHEET_TABS.parents);
      await appendRow(sheetId, SHEET_TABS.parents, [
        parentTabId, parentUserId, "Parent", studentName, parentPhone, "",
      ]);
    }
  }

  return { studentName, parentEmail, classes, extra };
}

// POST /api/enrollment-requests/:row/approve
// Marks request as Approved (awaiting payment) — does NOT activate the user yet
router.post("/enrollment-requests/:row/approve", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: "Missing sheetId or row" }); return; }
  try {
    const col = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, "Approved");
    res.json({ ok: true, action: "approved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enrollment-requests/:row/mark-paid
// Confirms payment — activates the student account and creates parent/student records
router.post("/enrollment-requests/:row/mark-paid", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: "Missing sheetId or row" }); return; }
  try {
    // Mark enrollment as Paid
    const col = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, "Paid");

    // Read enrollment row then activate student + create parent records
    const { enrollRow, users, extra } = await getEnrollRow(sheetId, rowNum);
    if (!enrollRow) { res.status(404).json({ error: "Enrollment row not found" }); return; }

    const { studentName, parentEmail, classes } = await activateStudent(sheetId, enrollRow, users, extra);

    // Send welcome email now that payment is confirmed
    if (isEmailConfigured()) {
      const studentEmail   = extra.studentEmail || "";
      const principalName  = getSetting('PRINCIPAL_NAME') || "The Principal";
      const principalEmail = process.env.PRINCIPAL_EMAIL || "";
      const recipients = [parentEmail, studentEmail].filter(e => e && e.includes("@"));
      const uniqueRecipients = [...new Set(recipients)];
      if (uniqueRecipients.length > 0) {
        try {
          await sendEmail({
            to: uniqueRecipients,
            cc: principalEmail || undefined,
            subject: `Welcome to EduTrack — ${studentName} is approved!`,
            html: buildWelcomeEmail(studentName, classes, principalName),
          });
        } catch (emailErr: any) {
          console.error("Welcome email failed:", emailErr.message);
        }
      }
    }

    res.json({ ok: true, action: "paid" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/enrollment-requests/:row/assign-class
// Lets the principal set or change the ClassID on an enrollment row
router.patch("/enrollment-requests/:row/assign-class", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: "Missing sheetId or row" }); return; }
  const { classId } = req.body as { classId?: string };
  if (!classId) { res.status(400).json({ error: "classId is required" }); return; }
  try {
    const col = colLetter("enrollments", "ClassID");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, classId);
    res.json({ ok: true });
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
