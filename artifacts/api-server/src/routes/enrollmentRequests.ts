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
  // Link people to the live app's sign-in page so they can log in immediately
  // (NOT the public /enroll form — they're already enrolled).
  const appBase = (process.env.EDUTRACK_APP_URL || "https://edutrack.app").replace(/\/$/, "");
  const loginLink = `${appBase}/sign-in`;

  // Render the comma-separated class list as a real bulleted list so each
  // approved class is easy to read on its own line.
  const classItems = (classes || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const classBlock = classItems.length
    ? `
        <p style="margin-bottom: 8px;">You have been approved for the following:</p>
        <ul style="margin: 0 0 16px 20px; padding: 0;">
          ${classItems.map(c => `<li style="margin: 4px 0;">${c}</li>`).join("")}
        </ul>
      `
    : `<p>Our team will be in touch shortly to confirm class placement and scheduling details.</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #1d4ed8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Welcome to EduTrack!</h1>
      </div>
      <div style="padding: 32px; background: #f9fafb; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
        <p style="font-size: 16px;">Dear <strong>${studentName}</strong>,</p>
        <p>Your enrolment has been reviewed and <strong>approved</strong>. Your account is now active.</p>
        ${classBlock}
        <p style="margin: 20px 0;">
          <a href="${loginLink}" style="display: inline-block; background: #1d4ed8; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Log in to EduTrack</a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">Or open: <a href="${loginLink}" style="color: #1d4ed8;">${loginLink}</a></p>
        <p>Sign in with this email address — no password needed. From the dashboard you can view your schedule, class calendar, and analysis.</p>
        <p>If you have any questions, just reply to this email.</p>
        <p style="margin-top: 32px;">Warm regards,<br/>
        <strong>${principalName}</strong><br/>
        <span style="color: #6b7280; font-size: 14px;">EduTrack</span></p>
      </div>
    </div>
  `;
}

// Status values that mean this row is a settled class enrollment, NOT a pending request.
// Only "Pending" and "Approved" rows stay visible in the Requests queue.
const ACTIVE_ENROLLMENT_STATUSES = new Set([
  "active", "inactive", "rejected",
  // legacy single-column values (migrated rows)
  "paid", "enrolled", "cancelled", "canceled",
  "late cancellation", "fee waived", "fee confirmed",
]);

// GET /api/enrollment-requests — returns only pending/awaiting-approval rows from Enrollments tab
router.get("/enrollment-requests", async (req, res) => {
  const sheetId = getSheetId(req);
  if (!sheetId) { res.status(400).json({ error: "Missing sheetId" }); return; }
  try {
    const rows = await readTabRows(sheetId, SHEET_TABS.enrollments);

    // Filter to only rows that are actual requests (Pending, Approved, or no status yet)
    const requestRows = rows.filter(row => {
      const status = (row["Status"] || "").toLowerCase().trim();
      return !ACTIVE_ENROLLMENT_STATUSES.has(status);
    });

    // Enrich rows: unpack Notes JSON (or legacy EnrolledAt JSON) into named fields
    const enriched = requestRows.map(row => {
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

// Helper: activate tutor — flip Users-tab status to Active, ensure Teachers-tab
// row, and stamp the tutor's UserID onto each per-day Subject row they listed
// (only if that row currently has no teacher assigned, so we never clobber an
// existing assignment).
async function activateTutor(sheetId: string, enrollRow: any, users: any[], extra: any) {
  const tutorUserId = enrollRow["UserID"] || "";
  const tutorName   = enrollRow["Student Name"] || extra.applicantName || extra.requesterName || "";
  const tutorEmail  = (extra.applicantEmail || extra.requesterEmail || enrollRow["ParentID"] || "").toLowerCase().trim();
  const zoomLink    = extra.zoomLink || "";
  const phone       = extra.phone || extra.parentPhone || "";
  const notesText   = extra.extra || "";
  // Selected per-day Subject rows (comma-separated SubjectIDs from the form)
  const selectedIds: string[] = String(enrollRow["ClassID"] || extra.subjects || "")
    .split(",").map(s => s.trim()).filter(Boolean);

  // Activate tutor in Users tab
  if (tutorUserId) {
    const tutorUser = users.find((u: any) => u.userId === tutorUserId);
    if (tutorUser && (tutorUser as any)._row) {
      const col = colLetter("users", "Status");
      await updateCell(sheetId, `${SHEET_TABS.users}!${col}${(tutorUser as any)._row}`, "Active");
    }
  }

  // Resolve human labels for the chosen Subject rows + assign teacher to each
  let subjectLabels: string[] = [];
  if (selectedIds.length) {
    const subjectRows = await readTabRows(sheetId, SHEET_TABS.subjects);
    const teacherCol  = colLetter("subjects", "TeacherID");
    for (const sid of selectedIds) {
      const sub = subjectRows.find((r: any) => r["SubjectID"] === sid);
      if (!sub) { subjectLabels.push(sid); continue; }
      const day = sub["Days"] ? ` (${sub["Days"]})` : "";
      subjectLabels.push(`${sub["Name"]}${day}`);
      // Only assign if the Subject row currently has no teacher, so we never
      // overwrite an existing assignment.
      const currentTeacher = (sub["TeacherID"] || "").trim();
      if (!currentTeacher && tutorUserId) {
        await updateCell(sheetId, `${SHEET_TABS.subjects}!${teacherCol}${sub._row}`, tutorUserId);
      }
    }
  }
  const subjectsField = subjectLabels.join(", ");

  // Ensure Teachers-tab row
  if (tutorUserId && tutorName) {
    const teacherRows = await readTabRows(sheetId, SHEET_TABS.teachers);
    const existing = teacherRows.find((r: any) => r["UserID"] === tutorUserId);
    if (existing) {
      // Append any new subject labels to the existing Subjects column.
      const current = (existing["Subjects"] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...current, ...subjectLabels]));
      if (merged.length !== current.length) {
        const col = colLetter("teachers", "Subjects");
        await updateCell(sheetId, `${SHEET_TABS.teachers}!${col}${existing._row}`, merged.join(", "));
      }
    } else {
      const teacherTabId = await generateTabId("TCH", sheetId, SHEET_TABS.teachers);
      await appendRow(sheetId, SHEET_TABS.teachers, [
        teacherTabId, tutorUserId, tutorName, subjectsField, zoomLink, "", notesText || phone,
      ]);
    }
  }

  return { tutorName, tutorEmail, subjectsField };
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
// Confirms payment — activates the student account and marks the enrollment row Active
router.post("/enrollment-requests/:row/mark-paid", async (req, res) => {
  const sheetId = getSheetId(req);
  const rowNum = parseInt(req.params.row, 10);
  if (!sheetId || isNaN(rowNum)) { res.status(400).json({ error: "Missing sheetId or row" }); return; }
  try {
    // Mark enrollment row as Active (not Paid — Enrollments tab only tracks class membership state)
    const col = colLetter("enrollments", "Status");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${col}${rowNum}`, "Active");

    // Read enrollment row then activate based on Class Type
    const { enrollRow, users, extra } = await getEnrollRow(sheetId, rowNum);
    if (!enrollRow) { res.status(404).json({ error: "Enrollment row not found" }); return; }

    res.json({ ok: true, action: "paid" });

    const classType = (enrollRow["Class Type"] || "").toLowerCase().trim();
    const principalName  = getSetting('PRINCIPAL_NAME') || "The Principal";
    const principalEmail = getSetting('PRINCIPAL_EMAIL') || process.env.PRINCIPAL_EMAIL || "";

    if (classType === "tutor") {
      const { tutorName, tutorEmail, subjectsField } = await activateTutor(sheetId, enrollRow, users, extra);
      if (isEmailConfigured() && tutorEmail.includes("@")) {
        const ccRecipients = [principalEmail].filter(e => e && e.includes("@"));
        sendEmail({
          to: [tutorEmail],
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          subject: `Welcome to EduTrack — your tutor account is active`,
          html: buildWelcomeEmail(tutorName, subjectsField, principalName),
        }).catch((emailErr: any) => {
          console.error("Welcome email failed:", emailErr.message);
        });
      }
    } else {
      const { studentName, parentEmail, classes } = await activateStudent(sheetId, enrollRow, users, extra);
      if (isEmailConfigured()) {
        const studentEmail = extra.studentEmail || "";
        const recipients = [parentEmail, studentEmail].filter(e => e && e.includes("@"));
        const ccRecipients = [principalEmail].filter(e => e && e.includes("@"));
        const uniqueRecipients = [...new Set(recipients)];
        if (uniqueRecipients.length > 0) {
          sendEmail({
            to: uniqueRecipients,
            cc: ccRecipients.length > 0 ? ccRecipients : undefined,
            subject: `Welcome to EduTrack — ${studentName}'s enrollment is confirmed`,
            html: buildWelcomeEmail(studentName, classes, principalName),
          }).catch((emailErr: any) => {
            console.error("Welcome email failed:", emailErr.message);
          });
        }
      }
    }
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
