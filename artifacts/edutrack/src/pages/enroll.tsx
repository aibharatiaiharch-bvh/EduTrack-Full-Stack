import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

export default function EnrollPage() {
  const [, setLocation] = useLocation();
  const sheetId = new URLSearchParams(window.location.search).get("sheetId") || "";

  const [form, setForm] = useState({
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

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      const res = await fetch(apiUrl("/roles/enroll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sheetId }),
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
            <h1 className="text-2xl font-bold text-foreground">Enrolment Submitted!</h1>
            <p className="text-muted-foreground">
              Thank you. Your enrolment request has been received and will be reviewed by the principal. You will be contacted shortly.
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
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">New Student Enrolment</h1>
            <p className="text-muted-foreground mt-1">
              Fill in the details below to submit your enrolment request. The principal will review and be in touch.
            </p>
          </div>

          {!sheetId && (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm">Invalid enrolment link. Please ask your school for the correct link.</p>
            </div>
          )}

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
                    <Input id="studentName" value={form.studentName} onChange={e => set("studentName", e.target.value)} placeholder="e.g. Emma Johnson" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input id="dob" type="date" value={form.dob} onChange={e => set("dob", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentSchool">Current School <span className="text-destructive">*</span></Label>
                    <Input id="currentSchool" value={form.currentSchool} onChange={e => set("currentSchool", e.target.value)} placeholder="e.g. Greenwood Primary" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentGrade">Current Year / Grade <span className="text-destructive">*</span></Label>
                    <Input id="currentGrade" value={form.currentGrade} onChange={e => set("currentGrade", e.target.value)} placeholder="e.g. Year 5" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentPhone">Student Phone (optional)</Label>
                  <Input id="studentPhone" type="tel" value={form.studentPhone} onChange={e => set("studentPhone", e.target.value)} placeholder="e.g. 0412 345 678" />
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
                    <Input id="parentName" value={form.parentName} onChange={e => set("parentName", e.target.value)} placeholder="e.g. Sarah Johnson" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parentEmail">Parent Email <span className="text-destructive">*</span></Label>
                    <Input id="parentEmail" type="email" value={form.parentEmail} onChange={e => set("parentEmail", e.target.value)} placeholder="e.g. sarah@email.com" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parentPhone">Parent Phone <span className="text-destructive">*</span></Label>
                  <Input id="parentPhone" type="tel" value={form.parentPhone} onChange={e => set("parentPhone", e.target.value)} placeholder="e.g. 0412 345 678" required />
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
                  <Input id="classesInterested" value={form.classesInterested} onChange={e => set("classesInterested", e.target.value)} placeholder="e.g. Mathematics, Science" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea id="notes" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any special requirements, learning needs, or questions for the principal…" rows={3} />
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
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-white space-y-1">
        <p>© {new Date().getFullYear()} EduTrack. All rights reserved.</p>
        <p>App by <a href="https://qb2bsol.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-colors">Qb2bsol.com</a></p>
      </footer>
    </div>
  );
}
