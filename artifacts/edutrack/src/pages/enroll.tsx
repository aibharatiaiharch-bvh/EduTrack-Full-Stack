import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Users, GraduationCap, BookOpen, Upload, Download, FileText, XCircle } from "lucide-react";

type SubjectRow = {
  _row: number;
  SubjectID: string;
  Name: string;
  Type: string;
  Teachers: string;
  Room: string;
  Days: string;
  Status: string;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type RequestType = "student" | "tutor" | "bulk";

const CSV_HEADERS = [
  "Student Name", "Student Email", "Age", "Current School", "Current Grade",
  "Previously Enrolled (Yes/No)", "Classes Interested", "Parent Email",
  "Parent Phone", "Reference", "Promo Code", "Notes",
];

const CSV_FIELD_MAP: Record<string, string> = {
  "student name":              "studentName",
  "student email":             "studentEmail",
  "age":                       "age",
  "current school":            "currentSchool",
  "current grade":             "currentGrade",
  "previously enrolled (yes/no)": "previouslyEnrolled",
  "previously enrolled":       "previouslyEnrolled",
  "classes interested":        "classesInterested",
  "parent email":              "parentEmail",
  "parent phone":              "parentPhone",
  "reference":                 "reference",
  "promo code":                "promoCode",
  "notes":                     "notes",
};

function downloadTemplate() {
  const sampleRow = [
    "Emma Johnson", "emma@email.com", "12", "Greenwood Primary", "Year 6",
    "No", "Maths Year 6", "parent@email.com", "0412 345 678", "Friend", "", "",
  ];
  const csv = [CSV_HEADERS.join(","), sampleRow.map(v => `"${v}"`).join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "EduTrack_Student_Upload_Template.csv";
  a.click();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i <= line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if ((ch === "," || i === line.length) && !inQuote) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const key = CSV_FIELD_MAP[h] || h;
      row[key] = values[i] || "";
    });
    return row;
  });
}

const SHEET_KEY = "edutrack_sheet_id";

const BULK_ALLOWED_ROLES = ["developer", "principal"];

export default function EnrollPage() {
  const [, setLocation] = useLocation();

  const urlSheetId = new URLSearchParams(window.location.search).get("sheetId") || "";
  const sheetId = urlSheetId || localStorage.getItem(SHEET_KEY) || "";
  const userRole = localStorage.getItem("edutrack_user_role") || "";
  const canBulkUpload = BULK_ALLOWED_ROLES.includes(userRole);

  useEffect(() => {
    if (urlSheetId) localStorage.setItem(SHEET_KEY, urlSheetId);
  }, [urlSheetId]);

  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const [studentForm, setStudentForm] = useState({
    studentName: "",
    studentEmail: "",
    previouslyEnrolled: "No",
    currentSchool: "",
    currentGrade: "",
    age: "",
    classesInterested: "",
    parentEmail: "",
    parentPhone: "",
    reference: "",
    promoCode: "",
    notes: "",
  });
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [tutorForm, setTutorForm] = useState({
    applicantName: "",
    applicantEmail: "",
    applicantPhone: "",
    previousUser: "No",
    timeZone: "",
    zoomLink: "",
    subjects: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState<{ total: number; success: number; failed: number; results: { row: number; name: string; ok: boolean; error?: string }[] } | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkResults(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setBulkRows(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleBulkSubmit() {
    if (!bulkRows.length) return;
    setBulkSubmitting(true);
    setBulkProgress(0);
    setBulkResults(null);
    const sid = sheetId || localStorage.getItem(SHEET_KEY) || "";
    try {
      const res = await fetch(apiUrl("/roles/enroll-bulk"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sid, students: bulkRows }),
      });
      const data = await res.json();
      setBulkResults(data);
      setBulkProgress(100);
    } catch {
      setBulkResults({ total: bulkRows.length, success: 0, failed: bulkRows.length, results: [] });
    }
    setBulkSubmitting(false);
  }

  useEffect(() => {
    const sid = sheetId;
    const url = sid
      ? apiUrl(`/subjects?sheetId=${encodeURIComponent(sid)}&status=active`)
      : apiUrl(`/subjects?status=active`);
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((rows: SubjectRow[]) => setSubjects(rows))
      .catch(() => setSubjects([]));
  }, [sheetId]);

  function setStudent(field: string, value: string) {
    setStudentForm((prev) => ({ ...prev, [field]: value }));
  }

  function setTutor(field: string, value: string) {
    setTutorForm((prev) => ({ ...prev, [field]: value }));
  }

  function addSubject(name: string) {
    if (!name || selectedSubjects.includes(name)) return;
    const next = [...selectedSubjects, name];
    setSelectedSubjects(next);
    setStudent("classesInterested", next.join(", "));
  }

  function removeSubject(name: string) {
    const next = selectedSubjects.filter(s => s !== name);
    setSelectedSubjects(next);
    setStudent("classesInterested", next.join(", "));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!sheetId) {
      setError("No spreadsheet is linked. Please open the enrolment link from your school settings.");
      return;
    }

    if (requestType === "student") {
      if (!studentForm.studentName.trim() || !studentForm.parentEmail.trim() || !studentForm.parentPhone.trim()) {
        setError("Please complete the required fields marked with *.");
        return;
      }
      if (!studentForm.classesInterested.trim() && selectedSubjects.length === 0) {
        setError("Please select at least one class from the list.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const userEmail = localStorage.getItem("edutrack_user_email") || "";
      const userName = localStorage.getItem("edutrack_user_name") || "";
      const resolvedSheetId = sheetId || localStorage.getItem(SHEET_KEY) || "";
      let body: Record<string, string>;

      if (requestType === "tutor") {
        body = {
          requestType: "tutor",
          studentName: tutorForm.applicantName,
          parentEmail: tutorForm.applicantEmail || userEmail,
          parentPhone: tutorForm.applicantPhone,
          previouslyEnrolled: tutorForm.previousUser,
          currentGrade: tutorForm.timeZone,
          classesInterested: tutorForm.subjects,
          reference: tutorForm.zoomLink,
          notes: tutorForm.notes,
          sheetId: resolvedSheetId,
          userEmail,
          userName,
        };
      } else {
        body = {
          requestType: "student",
          ...studentForm,
          sheetId: resolvedSheetId,
          userEmail,
          userName,
        };
      }

      const res = await fetch(apiUrl("/roles/enroll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 py-4 flex items-center bg-white border-b border-border shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">E</div>
            <span className="text-xl font-semibold text-foreground">EduTrack</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {requestType === "tutor" ? "Application Submitted!" : "Enrolment Submitted!"}
            </h1>
            <p className="text-muted-foreground">
              {requestType === "tutor"
                ? "Thank you. Your application has been received and will be reviewed by the principal. You will be contacted once your account is activated."
                : "Thank you. Your enrolment request has been received and will be reviewed by the principal. You will be contacted shortly."}
            </p>
            <Button variant="outline" onClick={() => setLocation("/")}>Return to Home</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center bg-white border-b border-border shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">E</div>
          <span className="text-xl font-semibold text-foreground">EduTrack</span>
        </div>
      </header>
      <main className="flex-1 flex justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Join EduTrack</h1>
            <p className="text-muted-foreground mt-1">
              Select how you are applying below, fill in your details, and the principal will review your request.
            </p>
          </div>
          {!requestType && (
            <div className={`grid grid-cols-1 gap-4 ${canBulkUpload ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <button type="button" onClick={() => setRequestType("student")} className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Student / Family</p>
                  <p className="text-sm text-muted-foreground mt-1">Enrol a student and set up a parent account.</p>
                </div>
              </button>
              <button type="button" onClick={() => setRequestType("tutor")} className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Tutor / Staff</p>
                  <p className="text-sm text-muted-foreground mt-1">Apply to join as a tutor or staff member.</p>
                </div>
              </button>
              {canBulkUpload && (
                <button type="button" onClick={() => { setRequestType("bulk"); setBulkRows([]); setBulkResults(null); }} className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-purple-400 hover:bg-purple-50 transition-all text-left">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Mass Upload</p>
                    <p className="text-sm text-muted-foreground mt-1">Upload a CSV file to enrol multiple students at once.</p>
                  </div>
                </button>
              )}
            </div>
          )}
          {requestType && (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                requestType === "tutor" ? "bg-green-100 text-green-700" :
                requestType === "bulk"  ? "bg-purple-100 text-purple-700" :
                "bg-blue-100 text-blue-700"
              }`}>
                {requestType === "tutor" ? <GraduationCap className="w-3.5 h-3.5" /> :
                 requestType === "bulk"  ? <Upload className="w-3.5 h-3.5" /> :
                 <Users className="w-3.5 h-3.5" />}
                {requestType === "tutor" ? "Tutor / Staff Application" : requestType === "bulk" ? "Mass Student Upload" : "Student Enrolment"}
              </div>
              <button type="button" onClick={() => setRequestType(null)} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                Change
              </button>
            </div>
          )}
          {requestType === "student" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Student Information</CardTitle>
                  <CardDescription>Details about the student enrolling.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="studentName">Student Full Name <span className="text-destructive">*</span></Label>
                      <Input id="studentName" value={studentForm.studentName} onChange={e => setStudent("studentName", e.target.value)} placeholder="e.g. Emma Johnson" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="studentEmail">Student Email <span className="text-destructive">*</span></Label>
                      <Input id="studentEmail" type="email" value={studentForm.studentEmail} onChange={e => setStudent("studentEmail", e.target.value)} placeholder="e.g. emma@email.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Previously Enrolled at This School? <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2">
                      {["Yes", "No"].map(opt => (
                        <button key={opt} type="button" onClick={() => setStudent("previouslyEnrolled", opt)} className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                          studentForm.previouslyEnrolled === opt ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-primary/40"
                        }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="currentSchool">Current School Attending <span className="text-destructive">*</span></Label>
                      <Input id="currentSchool" value={studentForm.currentSchool} onChange={e => setStudent("currentSchool", e.target.value)} placeholder="e.g. Greenwood Primary" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currentGrade">Current Grade / Year <span className="text-destructive">*</span></Label>
                      <Input id="currentGrade" value={studentForm.currentGrade} onChange={e => setStudent("currentGrade", e.target.value)} placeholder="e.g. Year 5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="age">Age <span className="text-destructive">*</span></Label>
                      <Input id="age" type="number" min="1" max="25" value={studentForm.age} onChange={e => setStudent("age", e.target.value)} placeholder="e.g. 12" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Classes Interested In</CardTitle>
                  <CardDescription>Select one or more classes from the dropdown list below.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="classesInterested">Classes Interested In <span className="text-destructive">*</span></Label>
                    <select id="classesInterested" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" value="" onChange={e => addSubject(e.target.value)}>
                      <option value="" disabled>{subjects.length > 0 ? "Select a class..." : "Select an option below..."}</option>
                      {subjects.filter(s => {
                        const label = `${s.Name} (${s.Type})${s.Teachers ? ` — ${s.Teachers}` : ""}`;
                        return !selectedSubjects.includes(label);
                      }).map(s => {
                        const label = `${s.Name} (${s.Type})${s.Teachers ? ` — ${s.Teachers}` : ""}`;
                        return <option key={s._row} value={label}>{label}</option>;
                      })}
                      {!selectedSubjects.includes("Not in list — New Request") && (
                        <option value="Not in list — New Request">➕ New Subject / Not in list</option>
                      )}
                    </select>
                    <p className="text-xs text-muted-foreground">Pick from the list to add classes. Selected classes appear below.</p>
                  </div>
                  {selectedSubjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedSubjects.map(name => (
                        <span key={name} className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium px-2.5 py-1 ${name === "Not in list — New Request" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                          <BookOpen className="h-3 w-3" />
                          {name}
                          <button type="button" onClick={() => removeSubject(name)} className="ml-0.5 hover:text-destructive transition-colors" aria-label={`Remove ${name}`}>×</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a class above to add it to the list.</div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Parent / Guardian Contact</CardTitle>
                  <CardDescription>Primary contact for this enrolment.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="parentEmail">Parent Email <span className="text-destructive">*</span></Label>
                      <Input id="parentEmail" type="email" value={studentForm.parentEmail} onChange={e => setStudent("parentEmail", e.target.value)} placeholder="e.g. sarah@email.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parentPhone">Phone <span className="text-destructive">*</span></Label>
                      <Input id="parentPhone" type="tel" value={studentForm.parentPhone} onChange={e => setStudent("parentPhone", e.target.value)} placeholder="e.g. 0412 345 678" required />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Additional Information</CardTitle>
                  <CardDescription>Optional — how did you hear about us, any promotional codes, or extra requests.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="reference">Reference (how did you hear about us?)</Label>
                      <Input id="reference" value={studentForm.reference} onChange={e => setStudent("reference", e.target.value)} placeholder="e.g. Friend, Google, Instagram…" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="promoCode">Promo Code</Label>
                      <Input id="promoCode" value={studentForm.promoCode} onChange={e => setStudent("promoCode", e.target.value)} placeholder="e.g. WELCOME10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    {selectedSubjects.includes("Not in list — New Request") && (
                      <p className="text-xs text-amber-600 font-medium">You selected "Not in list — New Request". Please describe the class or subject you are looking for below.</p>
                    )}
                    <textarea id="notes" rows={3} value={studentForm.notes} onChange={e => setStudent("notes", e.target.value)} placeholder={selectedSubjects.includes("Not in list — New Request") ? "Describe the class or subject you are looking for…" : "Any extra requests, scheduling needs, or information for the principal…"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                  </div>
                </CardContent>
              </Card>
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Enrolment Request"}
              </Button>
            </form>
          )}
          {requestType === "tutor" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your Details</CardTitle>
                  <CardDescription>Your application will be reviewed by the principal before your account is activated.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="applicantName">Full Name <span className="text-destructive">*</span></Label>
                      <Input id="applicantName" value={tutorForm.applicantName} onChange={e => setTutor("applicantName", e.target.value)} placeholder="e.g. James Smith" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="applicantEmail">Email Address <span className="text-destructive">*</span></Label>
                      <Input id="applicantEmail" type="email" value={tutorForm.applicantEmail || localStorage.getItem("edutrack_user_email") || ""} onChange={e => setTutor("applicantEmail", e.target.value)} placeholder="e.g. james@email.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="applicantPhone">Phone Number</Label>
                    <Input id="applicantPhone" type="tel" value={tutorForm.applicantPhone} onChange={e => setTutor("applicantPhone", e.target.value)} placeholder="e.g. 0412 345 678" />
                  </div>
                  <div className="space-y-2">
                    <Label>Previous User?</Label>
                    <div className="flex gap-2">
                      {["Yes", "No"].map(opt => (
                        <button key={opt} type="button" onClick={() => setTutor("previousUser", opt)} className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                          tutorForm.previousUser === opt ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-primary/40"
                        }`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeZone">Time Zone</Label>
                      <select id="timeZone" value={tutorForm.timeZone} onChange={e => setTutor("timeZone", e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">Select time zone</option>
                        <option value="East">East</option>
                        <option value="Central">Central</option>
                        <option value="Pacific">Pacific</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zoomLink">Zoom Link</Label>
                      <Input id="zoomLink" value={tutorForm.zoomLink} onChange={e => setTutor("zoomLink", e.target.value)} placeholder="e.g. https://zoom.us/j/..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subjects">Subjects / Areas You Teach <span className="text-destructive">*</span></Label>
                    <Input id="subjects" value={tutorForm.subjects} onChange={e => setTutor("subjects", e.target.value)} placeholder="e.g. Mathematics, Physics, Chemistry" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tutorNotes">Experience & Qualifications</Label>
                    <Textarea id="tutorNotes" value={tutorForm.notes} onChange={e => setTutor("notes", e.target.value)} placeholder="Tell us about your teaching background, qualifications, and availability…" rows={4} />
                  </div>
                </CardContent>
              </Card>
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Application"}
              </Button>
            </form>
          )}

          {requestType === "bulk" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4" /> Step 1 — Download the Template</CardTitle>
                  <CardDescription>Fill in the CSV template with your student list, then upload it below. Maximum 200 students per file.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                    <FileText className="w-4 h-4" /> Download CSV Template
                  </Button>
                  <div className="mt-3 text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">Required columns:</span> Student Name, Parent Email, Parent Phone</p>
                    <p><span className="font-medium text-foreground">Optional:</span> Student Email, Age, Current School, Current Grade, Previously Enrolled, Classes Interested, Reference, Promo Code, Notes</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Step 2 — Upload Your CSV</CardTitle>
                  <CardDescription>Select your completed CSV file. A preview will appear below before you submit.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">{bulkFileName ? bulkFileName : "Click to choose a CSV file"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{bulkRows.length > 0 ? `${bulkRows.length} student${bulkRows.length !== 1 ? "s" : ""} detected` : ".csv files only"}</p>
                    </div>
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
                  </label>

                  {bulkRows.length > 0 && !bulkResults && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview ({bulkRows.length} rows)</p>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="px-3 py-2 text-left font-medium">#</th>
                              <th className="px-3 py-2 text-left font-medium">Student Name</th>
                              <th className="px-3 py-2 text-left font-medium">Student Email</th>
                              <th className="px-3 py-2 text-left font-medium">Parent Email</th>
                              <th className="px-3 py-2 text-left font-medium">Classes</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkRows.map((row, i) => {
                              const missing = !row.studentName?.trim() || !row.parentEmail?.trim();
                              return (
                                <tr key={i} className={`border-b last:border-0 ${missing ? "bg-red-50" : "hover:bg-muted/30"}`}>
                                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium">{row.studentName || <span className="text-destructive">Missing</span>}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{row.studentEmail || "—"}</td>
                                  <td className="px-3 py-2">{row.parentEmail || <span className="text-destructive">Missing</span>}</td>
                                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{row.classesInterested || "—"}</td>
                                  <td className="px-3 py-2">{missing ? <span className="text-destructive font-medium">⚠ Fix required</span> : <span className="text-green-600">✓ Ready</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Button onClick={handleBulkSubmit} disabled={bulkSubmitting} className="w-full gap-2 mt-2">
                        <Upload className="w-4 h-4" />
                        {bulkSubmitting ? "Submitting…" : `Submit ${bulkRows.length} Student${bulkRows.length !== 1 ? "s" : ""}`}
                      </Button>
                    </div>
                  )}

                  {bulkResults && (
                    <div className="space-y-3">
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${bulkResults.failed === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                        <CheckCircle2 className={`w-5 h-5 shrink-0 ${bulkResults.failed === 0 ? "text-green-600" : "text-amber-600"}`} />
                        <div>
                          <p className="font-medium text-sm">{bulkResults.success} of {bulkResults.total} submitted successfully</p>
                          {bulkResults.failed > 0 && <p className="text-xs text-muted-foreground">{bulkResults.failed} failed — see details below</p>}
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50 border-b">
                              <th className="px-3 py-2 text-left font-medium">#</th>
                              <th className="px-3 py-2 text-left font-medium">Name</th>
                              <th className="px-3 py-2 text-left font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkResults.results.map((r, i) => (
                              <tr key={i} className={`border-b last:border-0 ${r.ok ? "" : "bg-red-50"}`}>
                                <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                                <td className="px-3 py-2 font-medium">{r.name}</td>
                                <td className="px-3 py-2">{r.ok ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Submitted</span> : <span className="text-destructive flex items-center gap-1"><XCircle className="w-3 h-3" /> {r.error}</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setBulkRows([]); setBulkResults(null); setBulkFileName(""); }} className="gap-1.5">
                        Upload Another File
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-white space-y-1">
        <p>© {new Date().getFullYear()} EduTrack. All rights reserved.</p>
        <p>App by <a href="https://qb2bsol.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-colors">Qb2bsol.com</a></p>
      </footer>
    </div>
  );
}
