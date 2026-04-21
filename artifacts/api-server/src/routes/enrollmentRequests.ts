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

function buildWelcomeEmail(studentName: string, classes: string, principalName: string, loginEmail?: string): string {
  // Link people to the live app's sign-in page so they can log in immediately
  // (NOT the public /enroll form — they're already enrolled).
  const appBase = (process.env.EDUTRACK_APP_URL || "https://edutrack.app").replace(/\/$/, "");
  const loginLink = `${appBase}/sign-in`;

  // Render the class list as a real bulleted list so each approved class is
  // easy to read on its own line. We split on ";" first because individual
  // labels can themselves contain commas (e.g. teacher names like "Smith, J."
  // or time ranges) — splitting on "," would inflate one pick into several.
  // Fall back to "," only when no ";" is present, so legacy rows still render.
  const raw = classes || "";
  const parts = raw.includes(";") ? raw.split(";") : raw.split(",");
  const classItems = parts.map(s => s.trim()).filter(Boolean);
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
        ${loginEmail ? `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Your login email</p>
          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1d4ed8;">${loginEmail}</p>
        </div>
        ` : ""}
        <p>Use the email address above to sign in — no password needed. From the dashboard you can view your schedule, class calendar, and analysis.</p>
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

    // ?all=1 → return every row (used by the principal "All Enrollments" view + diagnostics)
    const showAll = String(req.query.all || "") === "1";
    const requestRows = showAll ? rows : rows.filter(row => {
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
async function activateTutor(sheetId: string, enrollRow: any, users: any[], extra: any, rowNum?: number) {
  const tutorUserId = enrollRow["UserID"] || "";
  const tutorName   = enrollRow["Student Name"] || extra.applicantName || extra.requesterName || "";
  const tutorEmail  = (extra.applicantEmail || extra.requesterEmail || enrollRow["ParentID"] || "").toLowerCase().trim();
  const zoomLink    = extra.zoomLink || extra.reference || "";

  // Stamp the tutor's own teacher details onto her Enrollment row so the
  // Enrollments sheet and any downstream lookups have Teacher Name/Email.
  if (rowNum && tutorUserId) {
    const tIdCol    = colLetter("enrollments", "TeacherID");
    const tNameCol  = colLetter("enrollments", "Teacher Name");
    const tEmailCol = colLetter("enrollments", "TeacherEmail");
    const zoomCol   = colLetter("enrollments", "Zoom Link");
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tIdCol}${rowNum}`, tutorUserId);
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tNameCol}${rowNum}`, tutorName);
    await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tEmailCol}${rowNum}`, tutorEmail);
    if (zoomLink) await updateCell(sheetId, `${SHEET_TABS.enrollments}!${zoomCol}${rowNum}`, zoomLink);
  }
  const phone       = extra.phone || extra.parentPhone || "";
  const notesText   = extra.extra || "";
  // Selected per-day Subject rows (";"-separated SubjectIDs from the form;
  // fall back to "," for legacy rows).
  const rawSel = String(enrollRow["ClassID"] || extra.subjects || "");
  const selectedIds: string[] = (rawSel.includes(";") ? rawSel.split(";") : rawSel.split(","))
    .map(s => s.trim()).filter(Boolean);

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
    const teacherIdCol   = colLetter("subjects", "TeacherID");
    const teacherNameCol = colLetter("subjects", "Teacher Name");
    for (const sid of selectedIds) {
      const sub = subjectRows.find((r: any) => r["SubjectID"] === sid);
      if (!sub) { subjectLabels.push(sid); continue; }
      const day = sub["Days"] ? ` (${sub["Days"]})` : "";
      subjectLabels.push(`${sub["Name"]}${day}`);
      // Only assign if the Subject row currently has no teacher, so we never
      // overwrite an existing assignment.
      const currentTeacher = (sub["TeacherID"] || "").trim();
      if (!currentTeacher && tutorUserId) {
        await updateCell(sheetId, `${SHEET_TABS.subjects}!${teacherIdCol}${sub._row}`, tutorUserId);
        await updateCell(sheetId, `${SHEET_TABS.subjects}!${teacherNameCol}${sub._row}`, tutorName);
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
      // Fill in zoom link and notes/phone if currently blank
      if (!existing["Zoom Link"] && zoomLink) {
        const col = colLetter("teachers", "Zoom Link");
        await updateCell(sheetId, `${SHEET_TABS.teachers}!${col}${existing._row}`, zoomLink);
      }
      if (!existing["Notes"] && (notesText || phone)) {
        const col = colLetter("teachers", "Notes");
        await updateCell(sheetId, `${SHEET_TABS.teachers}!${col}${existing._row}`, notesText || phone);
      }
    } else {
      // Use the tutor's Users-tab UserID as the Teachers-tab TeacherID too,
      // so Subject.TeacherID === Teachers.TeacherID and the calendar's
      // teacher-by-id lookup resolves the tutor's name on each class slot.
      await appendRow(sheetId, SHEET_TABS.teachers, [
        tutorUserId, tutorUserId, tutorName, subjectsField, zoomLink, "", notesText || phone,
      ]);
    }
  }

  return { tutorName, tutorEmail, subjectsField };
}

// Helper: activate student, create parent user + extension rows
async function activateStudent(sheetId: string, enrollRow: any, users: any[], extra: any) {
  const studentUserId  = enrollRow["UserID"] || "";
  const studentName    = enrollRow["Student Name"] || extra.studentName || extra.applicantName || "";
  const parentEmail    = (extra.parentEmail || extra.applicantEmail || enrollRow["ParentID"] || "").toLowerCase().trim();
  const parentPhone    = extra.parentPhone || extra.phone || "";
  const studentPhone   = extra.studentPhone || parentPhone;
  const rawClasses     = String(enrollRow["ClassID"] || extra.classesInterested || extra.subjects || "");
  const currentSchool  = extra.currentSchool || "";
  const currentGrade   = extra.currentGrade || "";
  const now            = new Date().toISOString();

  // Parse the picked items. New rows store SubjectIDs joined with ";"; legacy
  // rows may store full labels joined with "," or "; ".
  const picks = (rawClasses.includes(";") ? rawClasses.split(";") : rawClasses.split(","))
    .map(s => s.trim()).filter(Boolean);

  // Resolve picks against the Subjects tab. New-format picks are SubjectIDs
  // (e.g. "SUB-MAT-FRI"); legacy picks (from cached older bundles) are full
  // labels like "Mathematics — Fri — 9:00 AM (Group) — Dr. Sarah Chen", so
  // we fuzzy-match by the first segment (subject name) + the day substring.
  const subjectRows = await readTabRows(sheetId, SHEET_TABS.subjects);
  const resolved: { id: string; label: string }[] = [];
  const interestOnly: string[] = [];
  for (const p of picks) {
    const direct = subjectRows.find((r: any) => r["SubjectID"] === p);
    if (direct) {
      const day = direct["Days"] ? ` (${direct["Days"]})` : "";
      resolved.push({ id: direct["SubjectID"], label: `${direct["Name"]}${day}` });
      continue;
    }
    // Legacy label fallback
    const segs = p.split(/—|–|-/).map(s => s.trim()).filter(Boolean);
    const name = segs[0] || "";
    const dayMatch = p.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);
    const day = dayMatch ? dayMatch[1].slice(0, 3).toLowerCase() : "";
    const fuzzy = subjectRows.find((r: any) =>
      (r["Name"] || "").toLowerCase() === name.toLowerCase() &&
      (!day || (r["Days"] || "").toLowerCase().includes(day))
    );
    if (fuzzy) {
      const d = fuzzy["Days"] ? ` (${fuzzy["Days"]})` : "";
      resolved.push({ id: fuzzy["SubjectID"], label: `${fuzzy["Name"]}${d}` });
    } else {
      interestOnly.push(p);
    }
  }
  const classes = [...resolved.map(r => r.label), ...interestOnly].join("; ");

  // ── 1. Activate student in Users tab ──────────────────────────────────────
  if (studentUserId) {
    const studentUser = users.find((u: any) => u.userId === studentUserId);
    if (studentUser && (studentUser as any)._row) {
      const col = colLetter("users", "Status");
      await updateCell(sheetId, `${SHEET_TABS.users}!${col}${(studentUser as any)._row}`, "Active");
    }
  }

  // ── 2. Ensure parent user + parent tab row FIRST so we have the ID/name ──
  let parentUserId = "";
  let parentDisplayName = "Parent";
  if (parentEmail) {
    const existingParent = users.find((u: any) => u.email === parentEmail && u.role === "parent");
    if (existingParent) {
      parentUserId = existingParent.userId;
      parentDisplayName = existingParent.name || "Parent";
    } else {
      parentUserId = await generateUserId("parent", sheetId);
      parentDisplayName = studentName ? `${studentName}'s Parent` : "Parent";
      await appendRow(sheetId, SHEET_TABS.users, [
        parentUserId, parentEmail, "parent", parentDisplayName, "Active", now, now,
      ]);
    }
  }

  // Ensure parent row in Parents tab
  if (parentUserId && studentName) {
    const parentRows = await readTabRows(sheetId, SHEET_TABS.parents);
    const existingParentRow = parentRows.find(r => r["UserID"] === parentUserId || r["ParentID"] === parentUserId);
    if (existingParentRow) {
      const currentChildren = existingParentRow["Children Names"] || existingParentRow["Children"] || "";
      const names = currentChildren ? currentChildren.split(/[,;]/).map((n: string) => n.trim()).filter(Boolean) : [];
      const childList = Array.from(new Set([...names, studentName])).filter(Boolean);
      const col = colLetter("parents", "Children Names");
      await updateCell(sheetId, `${SHEET_TABS.parents}!${col}${existingParentRow._row}`, childList.join(", "));
    } else {
      const parentTabId = await generateTabId("PAR", sheetId, SHEET_TABS.parents);
      await appendRow(sheetId, SHEET_TABS.parents, [
        parentTabId, parentUserId, parentDisplayName, studentName, parentPhone, "",
      ]);
    }
  }

  // ── 3. Ensure student row in Students tab (after parent exists) ───────────
  // Schema: StudentID, UserID, Name, ParentID, Classes, Phone, Notes, CurrentSchool, CurrentGrade, PreviousStudent
  if (studentUserId && studentName) {
    const studentRows = await readTabRows(sheetId, SHEET_TABS.students);
    const existing = studentRows.find(r => r["UserID"] === studentUserId || r["StudentID"] === studentUserId);
    if (!existing) {
      await appendRow(sheetId, SHEET_TABS.students, [
        studentUserId,        // StudentID
        studentUserId,        // UserID
        studentName,          // Name
        parentUserId,         // ParentID — actual parent UserID (FK)
        classes,              // Classes — human-readable subject labels
        studentPhone,         // Phone
        "",                   // Notes
        currentSchool,        // CurrentSchool
        currentGrade,         // CurrentGrade
        "No",                 // PreviousStudent
        parentDisplayName,    // Parent Name — human-readable
      ]);
    } else {
      // Update existing row's Classes and Phone if they're blank
      if (!existing["Classes"] && classes) {
        const col = colLetter("students", "Classes");
        await updateCell(sheetId, `${SHEET_TABS.students}!${col}${existing._row}`, classes);
      }
      if (!existing["Phone"] && studentPhone) {
        const col = colLetter("students", "Phone");
        await updateCell(sheetId, `${SHEET_TABS.students}!${col}${existing._row}`, studentPhone);
      }
      if (!existing["ParentID"] && parentUserId) {
        const col = colLetter("students", "ParentID");
        await updateCell(sheetId, `${SHEET_TABS.students}!${col}${existing._row}`, parentUserId);
      }
      if (!existing["Parent Name"] && parentDisplayName) {
        const col = colLetter("students", "Parent Name");
        await updateCell(sheetId, `${SHEET_TABS.students}!${col}${existing._row}`, parentDisplayName);
      }
    }
  }

  return { studentName, parentEmail, classes, extra, parentUserId, parentDisplayName, resolved };
}

// Materialise one Enrollment row per resolved Subject so the calendar can
// match by ClassID === SubjectID. The original request row is rewritten to
// the first resolved SubjectID; any additional picks become new rows that
// clone the request's Student/Parent/Type fields.
async function materialiseStudentEnrollments(
  sheetId: string, rowNum: number, enrollRow: any,
  resolved: { id: string; label: string }[],
  studentUserId: string, studentName: string, parentDisplayName: string,
  users: any[],
) {
  if (!resolved.length) return;
  const subjectRows = await readTabRows(sheetId, SHEET_TABS.subjects);
  const teacherRows = await readTabRows(sheetId, SHEET_TABS.teachers);

  // Helper: get teacher email from Users tab (Teachers tab has no Email column)
  const teacherEmail = (teacherId: string): string => {
    const u = users.find((u: any) => u.userId === teacherId);
    return u?.email || "";
  };

  // Generate all ENR IDs upfront sequentially so IDs are contiguous
  const firstEnrollId = await generateTabId("ENR", sheetId, SHEET_TABS.enrollments);
  // For additional subjects we increment manually to avoid re-reading the sheet each time
  const firstNum = parseInt(firstEnrollId.split("-")[1] || "0", 10);
  const enrollIdFor = (i: number) => `ENR-${String(firstNum + i).padStart(3, "0")}`;

  // ── Rewrite the original request row for the first Subject ────────────────
  const first = resolved[0];
  const firstSub     = subjectRows.find((r: any) => r["SubjectID"] === first.id);
  const firstTid     = (firstSub?.["TeacherID"] || "").trim();
  const firstTeacher = teacherRows.find((t: any) => t["TeacherID"] === firstTid);

  const classIdCol  = colLetter("enrollments", "ClassID");
  const tIdCol      = colLetter("enrollments", "TeacherID");
  const tNameCol    = colLetter("enrollments", "Teacher Name");
  const tEmailCol   = colLetter("enrollments", "TeacherEmail");
  const zoomCol     = colLetter("enrollments", "Zoom Link");
  const classTypeCol = colLetter("enrollments", "Class Type");
  const enrollIdCol = colLetter("enrollments", "EnrollmentID");
  const parentCol   = colLetter("enrollments", "ParentID");

  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${enrollIdCol}${rowNum}`, enrollIdFor(0));
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${classIdCol}${rowNum}`, first.id);
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tIdCol}${rowNum}`, firstTid);
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tNameCol}${rowNum}`, firstTeacher?.["Name"] || "");
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${tEmailCol}${rowNum}`, teacherEmail(firstTid));
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${zoomCol}${rowNum}`, firstTeacher?.["Zoom Link"] || "");
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${classTypeCol}${rowNum}`, firstSub?.["Type"] || enrollRow["Class Type"] || "Group");
  await updateCell(sheetId, `${SHEET_TABS.enrollments}!${parentCol}${rowNum}`, parentDisplayName || "");

  // ── Append new rows for remaining SubjectIDs ──────────────────────────────
  const now = new Date().toISOString();
  const enrollmentSchema = [
    "EnrollmentID","UserID","Student Name","ClassID","ParentID","Status","EnrolledAt",
    "TeacherID","Teacher Name","TeacherEmail","Zoom Link","Class Type","ClassDate","ClassTime","Notes","Fee",
  ];
  for (let i = 1; i < resolved.length; i++) {
    const r   = resolved[i];
    const sub = subjectRows.find((x: any) => x["SubjectID"] === r.id);
    const tid = (sub?.["TeacherID"] || "").trim();
    const teacher = teacherRows.find((t: any) => t["TeacherID"] === tid);
    const data: Record<string, string> = {
      EnrollmentID: enrollIdFor(i),
      UserID: studentUserId,
      "Student Name": studentName,
      ClassID: r.id,
      ParentID: parentDisplayName || "",
      Status: "Active",
      EnrolledAt: now,
      TeacherID: tid,
      "Teacher Name": teacher?.["Name"] || "",
      TeacherEmail: teacherEmail(tid),
      "Zoom Link": teacher?.["Zoom Link"] || "",
      "Class Type": sub?.["Type"] || enrollRow["Class Type"] || "Group",
      ClassDate: "",
      ClassTime: sub?.["Time"] || "",
      Notes: enrollRow["Notes"] || "",
      Fee: enrollRow["Fee"] || "",
    };
    await appendRow(sheetId, SHEET_TABS.enrollments, enrollmentSchema.map(k => data[k] || ""));
  }
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
      const { tutorName, tutorEmail, subjectsField } = await activateTutor(sheetId, enrollRow, users, extra, rowNum);
      if (isEmailConfigured() && tutorEmail.includes("@")) {
        const ccRecipients = [principalEmail].filter(e => e && e.includes("@"));
        sendEmail({
          to: [tutorEmail],
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          subject: `Welcome to EduTrack — your tutor account is active`,
          html: buildWelcomeEmail(tutorName, subjectsField, principalName, tutorEmail),
        }).catch((emailErr: any) => {
          console.error("Welcome email failed:", emailErr.message);
        });
      }
    } else {
      const { studentName, parentEmail, classes, parentDisplayName, resolved } = await activateStudent(sheetId, enrollRow, users, extra);
      // Materialise one Enrollment row per Subject so the calendar shows this student on each class slot.
      try {
        await materialiseStudentEnrollments(sheetId, rowNum, enrollRow, resolved, enrollRow["UserID"] || "", studentName, parentDisplayName || "", users);
      } catch (matErr: any) {
        console.error("Materialise student enrollments failed:", matErr.message);
      }
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
            html: buildWelcomeEmail(studentName, classes, principalName, studentEmail || undefined),
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
