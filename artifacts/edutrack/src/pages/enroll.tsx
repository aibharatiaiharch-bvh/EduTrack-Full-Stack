import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, Users, GraduationCap } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

type RequestType = "student" | "tutor";

export default function EnrollPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const sheetId = new URLSearchParams(window.location.search).get("sheetId") || "";

  const [requestType, setRequestType] = useState<RequestType | null>(null);

  const [studentForm, setStudentForm] = useState({
    studentName: "",
    dob: "",
    currentSchool: "",
    currentGrade: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    studentPhone: "",
    classesInterested: "",
    notes: "",
  });

  const [tutorForm, setTutorForm] = useState({
    applicantName: "",
    applicantEmail: "",
    applicantPhone: "",
    subjects: "",
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function setStudent(field: string, value: string) {
    setStudentForm((prev) => ({ ...prev, [field]: value }));
  }

  function setTutor(field: string, value: string) {
    setTutorForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!sheetId) {
      setError("Invalid enrolment link. Please contact your school for the correct link.");
      return;
    }

    setSubmitting(true);
    try {
      const userEmail = user?.primaryEmailAddress?.emailAddress || "";
      const userName = user?.fullName || "";

      let body: Record<string, string>;

      if (requestType === "tutor") {
        body = {
          requestType: "tutor",
          studentName: tutorForm.applicantName,
          parentEmail: tutorForm.applicantEmail || userEmail,
          parentPhone: tutorForm.applicantPhone,
          classesInterested: tutorForm.subjects,
          notes: tutorForm.notes,
          sheetId,
          userEmail,
          userName,
        };
      } else {
        body = {
          requestType: "student",
          ...studentForm,
          sheetId,
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

          {!sheetId && (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm">Invalid enrolment link. Please ask your school for the correct link.</p>
            </div>
          )}

          {/* Role selector */}
          {!requestType && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setRequestType("student")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Student / Family</p>
                  <p className="text-sm text-muted-foreground mt-1">Enrol a student and set up a parent account.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRequestType("tutor")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Tutor / Staff</p>
                  <p className="text-sm text-muted-foreground mt-1">Apply to join as a tutor or staff member.</p>
                </div>
              </button>
            </div>
          )}

          {/* Selected role badge + back link */}
          {requestType && (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${requestType === "tutor" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                {requestType === "tutor" ? <GraduationCap className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                {requestType === "tutor" ? "Tutor / Staff Application" : "Student Enrolment"}
              </div>
              <button type="button" onClick={() => setRequestType(null)} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                Change
              </button>
            </div>
          )}

          {/* Student / Family form */}
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
                      <Label htmlFor="dob">Date of Birth</Label>
                      <Input id="dob" type="date" value={studentForm.dob} onChange={e => setStudent("dob", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentSchool">Current School <span className="text-destructive">*</span></Label>
                      <Input id="currentSchool" value={studentForm.currentSchool} onChange={e => setStudent("currentSchool", e.target.value)} placeholder="e.g. Greenwood Primary" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currentGrade">Current Year / Grade <span className="text-destructive">*</span></Label>
                      <Input id="currentGrade" value={studentForm.currentGrade} onChange={e => setStudent("currentGrade", e.target.value)} placeholder="e.g. Year 5" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentPhone">Student Phone (optional)</Label>
                    <Input id="studentPhone" type="tel" value={studentForm.studentPhone} onChange={e => setStudent("studentPhone", e.target.value)} placeholder="e.g. 0412 345 678" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Parent / Guardian Information</CardTitle>
                  <CardDescription>Primary contact details for the parent or guardian.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="parentName">Parent / Guardian Name <span className="text-destructive">*</span></Label>
                      <Input id="parentName" value={studentForm.parentName} onChange={e => setStudent("parentName", e.target.value)} placeholder="e.g. Sarah Johnson" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parentEmail">Parent Email <span className="text-destructive">*</span></Label>
                      <Input id="parentEmail" type="email" value={studentForm.parentEmail} onChange={e => setStudent("parentEmail", e.target.value)} placeholder="e.g. sarah@email.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentPhone">Parent Phone <span className="text-destructive">*</span></Label>
                    <Input id="parentPhone" type="tel" value={studentForm.parentPhone} onChange={e => setStudent("parentPhone", e.target.value)} placeholder="e.g. 0412 345 678" required />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Classes & Additional Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="classesInterested">Classes Interested In <span className="text-destructive">*</span></Label>
                    <Input id="classesInterested" value={studentForm.classesInterested} onChange={e => setStudent("classesInterested", e.target.value)} placeholder="e.g. Mathematics, Science" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea id="notes" value={studentForm.notes} onChange={e => setStudent("notes", e.target.value)} placeholder="Any special requirements, learning needs, or questions for the principal…" rows={3} />
                  </div>
                </CardContent>
              </Card>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || !sheetId}>
                {submitting ? "Submitting…" : "Submit Enrolment Request"}
              </Button>
            </form>
          )}

          {/* Tutor / Staff form */}
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
                      <Input id="applicantEmail" type="email" value={tutorForm.applicantEmail || user?.primaryEmailAddress?.emailAddress || ""} onChange={e => setTutor("applicantEmail", e.target.value)} placeholder="e.g. james@email.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="applicantPhone">Phone Number</Label>
                    <Input id="applicantPhone" type="tel" value={tutorForm.applicantPhone} onChange={e => setTutor("applicantPhone", e.target.value)} placeholder="e.g. 0412 345 678" />
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

              <Button type="submit" className="w-full" disabled={submitting || !sheetId}>
                {submitting ? "Submitting…" : "Submit Application"}
              </Button>
            </form>
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
