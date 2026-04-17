import { Router } from "express";
import { readTabRows, readUsersTab, updateCell, colLetter, SHEET_TABS, appendRow, generateUserId, generateTabId } from "../lib/googleSheets";
import { sendEmail, isEmailConfigured } from "../lib/email";

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
    // 1. Mark the enrollment request as Approved
    const enrollCol = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${enrollCol}${rowNum}`, "Approved");

    // 2. Read this enrollment row and all users
    const [enrollRows, users] = await Promise.all([
      readTabRows(sheetId, SHEET_TABS.enrollments),
      readUsersTab(sheetId),
    ]);
    const enrollRow = enrollRows.find(r => r._row === rowNum);
    const extra = enrollRow ? (tryParseJson(enrollRow["Notes"] || "") || tryParseJson(enrollRow["EnrolledAt"] || "")) : {};

    const studentUserId  = enrollRow?.["UserID"] || "";
    const studentName    = enrollRow?.["Student Name"] || extra.studentName || extra.applicantName || "";
    const studentEmail   = extra.studentEmail || "";
    const parentEmail    = (extra.parentEmail || extra.applicantEmail || enrollRow?.["ParentID"] || "").toLowerCase().trim();
    const parentPhone    = extra.parentPhone || extra.phone || "";
    const classes        = enrollRow?.["ClassID"] || extra.classesInterested || extra.subjects || "";
    const currentSchool  = extra.currentSchool || "";
    const currentGrade   = extra.currentGrade || "";
    const now            = new Date().toISOString();

    // 3. Activate the student in Users tab
    if (studentUserId) {
      const studentUser = users.find(u => u.userId === studentUserId);
      if (studentUser && (studentUser as any)._row) {
        const userStatusCol = colLetter("users", "Status");
        await updateCell(sheetId, `${SHEET_TABS.users}!${userStatusCol}${(studentUser as any)._row}`, "Active");
      }
    }

    // 4. Ensure student has a row in the Students extension tab
    if (studentUserId && studentName) {
      const studentRows = await readTabRows(sheetId, SHEET_TABS.students);
      const existingStudent = studentRows.find(r => r["UserID"] === studentUserId || r["StudentID"] === studentUserId);
      if (!existingStudent) {
        // Find parent ID (look up or will be created below)
        const parentUser = users.find(u => u.email === parentEmail && u.role === "parent");
        const parentId   = parentUser?.userId || "";
        await appendRow(sheetId, SHEET_TABS.students, [
          studentUserId, studentUserId, studentName, parentId, classes,
          "", "", currentSchool, currentGrade, "No",
        ]);
      }
    }

    // 5. Ensure parent user exists in Users tab
    let parentUserId = "";
    if (parentEmail) {
      const existingParent = users.find(u => u.email === parentEmail && u.role === "parent");
      if (existingParent) {
        parentUserId = existingParent.userId;
      } else {
        // Create parent user
        parentUserId = await generateUserId("parent", sheetId);
        await appendRow(sheetId, SHEET_TABS.users, [
          parentUserId, parentEmail, "parent", "Parent", "Active", now, now,
        ]);
      }
    }

    // 6. Ensure parent has a row in the Parents extension tab
    if (parentUserId && studentName) {
      const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
      const existingParentRow = parentRows.find(r => r["UserID"] === parentUserId || r["ParentID"] === parentUserId);
      if (existingParentRow) {
        // Append student name to Children column if not already there
        const currentChildren = existingParentRow["Children"] || "";
        const names = currentChildren ? currentChildren.split(";").map((n: string) => n.trim()) : [];
        if (!names.includes(studentName)) {
          names.push(studentName);
          const childrenCol = colLetter("parents", "Children");
          await updateCell(sheetId, `${SHEET_TABS.parents}!${childrenCol}${existingParentRow._row}`, names.join("; "));
        }
      } else {
        // Create new parent row in Parents tab
        const parentTabId = await generateTabId("PAR", sheetId, SHEET_TABS.parents);
        await appendRow(sheetId, SHEET_TABS.parents, [
          parentTabId, parentUserId, "Parent", studentName, parentPhone, "",
        ]);
      }
    }

    // 7. Send welcome email if SMTP is configured
    if (isEmailConfigured() && enrollRow) {
      const principalName  = process.env.PRINCIPAL_NAME || "The Principal";
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
