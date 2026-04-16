import { useState, useEffect } from "react";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GraduationCap, LogOut, ClipboardList, Users, UserCheck,
  UserPlus, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle,
} from "lucide-react";

const sheetId = () => localStorage.getItem("edutrack_sheet_id") || "";

function apiQ(path: string) {
  const sid = sheetId();
  return apiUrl(`${path}${path.includes("?") ? "&" : "?"}sheetId=${encodeURIComponent(sid)}`);
}

async function apiFetch(path: string, opts?: RequestInit) {
  const sid = sheetId();
  const isGet = !opts?.method || opts.method === "GET";
  const url = isGet ? apiQ(path) : apiUrl(path);
  const body = opts?.body ? JSON.parse(opts.body as string) : {};
  const finalBody = isGet ? undefined : JSON.stringify({ ...body, sheetId: sid });
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body: finalBody,
  });
  return res.json();
}

function ClassesTab() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [tutors, setTutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const [subjectData, tutorData] = await Promise.all([
        apiFetch("/subjects/with-capacity?status=active"),
        apiFetch("/principals/teachers"),
      ]);
      if (Array.isArray(subjectData)) setSubjects(subjectData);
      else setError("Could not load classes.");
      if (Array.isArray(tutorData)) setTutors(tutorData);
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function doReassign(classId: string) {
    const newTeacherId = selected[classId];
    if (!newTeacherId) return;
    setSaving(classId);
    setSuccess(null);
    try {
      const data = await apiFetch("/principals/reassign-teacher", {
        method: "POST",
        body: JSON.stringify({ classId, newTeacherId }),
      });
      if (data.ok) {
        setSuccess(classId);
        setReassigning(null);
        setSelected(s => { const n = { ...s }; delete n[classId]; return n; });
        await load();
      } else {
        setError(data.error || "Reassignment failed.");
      }
    } catch { setError("Connection error."); }
    setSaving(null);
  }

  return (
    <div>
      <SectionHeader title={`Classes (${subjects.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && subjects.length === 0 && (
        <p className="text-sm text-muted-foreground">No active classes found.</p>
      )}

      <div className="space-y-3">
        {subjects.map((s) => {
          const subjectId = s["SubjectID"] || s.SubjectID || "";
          const isOpen    = reassigning === subjectId;
          const isSaving  = saving === subjectId;
          const didSucceed = success === subjectId;
          const currentTeacher = s.TeacherName || s.Teachers || "Unassigned";
          const currentEnrolled = s.currentEnrolled ?? 0;

          return (
            <Card key={subjectId} className={isOpen ? "border-amber-400" : ""}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.Name || s["Name"]}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.Type} · {currentEnrolled} enrolled
                    </p>
                    {(s.Days || s.Time) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[s.Days, s.Time].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Teacher: <span className="font-medium text-foreground">{currentTeacher}</span>
                    </p>
                  </div>
                  {didSucceed && !isOpen && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Reassigned
                    </span>
                  )}
                </div>

                {!isOpen && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => { setReassigning(subjectId); setSuccess(null); }}
                  >
                    <AlertTriangle className="w-3 h-3" /> Emergency Reassign
                  </Button>
                )}

                {isOpen && (
                  <div className="space-y-3 pt-1 border-t">
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      This will update the class and all active enrollments immediately.
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1 block">Assign new teacher</label>
                      <select
                        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        value={selected[subjectId] || ""}
                        onChange={e => setSelected(sv => ({ ...sv, [subjectId]: e.target.value }))}
                      >
                        <option value="">Select a tutor…</option>
                        {tutors.map(t => (
                          <option key={t.UserID} value={t.UserID} disabled={t.UserID === s["TeacherID"]}>
                            {t.Name}{t.UserID === s["TeacherID"] ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!selected[subjectId] || isSaving}
                        onClick={() => doReassign(subjectId)}
                        className="gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {isSaving ? "Saving…" : `Confirm — reassign ${currentEnrolled} enrolment${currentEnrolled !== 1 ? "s" : ""}`}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => { setReassigning(null); setSelected(sv => { const n = { ...sv }; delete n[subjectId]; return n; }); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

type Tab = "requests" | "students" | "tutors" | "users" | "classes";

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const color =
    s === "active" ? "bg-green-100 text-green-800" :
    s === "pending" ? "bg-amber-100 text-amber-800" :
    s === "approved" ? "bg-blue-100 text-blue-800" :
    s === "rejected" ? "bg-red-100 text-red-800" :
    "bg-gray-100 text-gray-700";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{status || "—"}</span>;
}

function SectionHeader({ title, onRefresh, loading }: { title: string; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}

function EnrollmentRequestsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/enrollment-requests");
      if (Array.isArray(data)) setRows(data);
      else setError("Could not load requests.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function act(row: any, action: "approve" | "reject") {
    setActing(row._row);
    try {
      await apiFetch(`/enrollment-requests/${row._row}/${action}`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch { /* ignore */ }
    setActing(null);
  }

  const pending = rows.filter(r => (r["Status"] || "").toLowerCase() === "pending");
  const done = rows.filter(r => (r["Status"] || "").toLowerCase() !== "pending");

  return (
    <div>
      <SectionHeader title={`Enrollment Requests (${pending.length} pending)`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No enrollment requests found.</p>}

      {pending.length > 0 && (
        <div className="space-y-3 mb-6">
          {pending.map((row) => (
            <Card key={row._row}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row["Student Name"] || row["Name"] || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">{row["Parent Email"] || row["Email"] || ""}</p>
                    {row["Classes Interested"] && (
                      <p className="text-sm mt-1">Interested in: <span className="font-medium">{row["Classes Interested"]}</span></p>
                    )}
                  </div>
                  <StatusBadge status={row["Status"] || "Pending"} />
                </div>
                <button
                  className="text-xs text-muted-foreground flex items-center gap-1"
                  onClick={() => setExpanded(expanded === row._row ? null : row._row)}
                >
                  {expanded === row._row ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded === row._row ? "Hide details" : "Show details"}
                </button>
                {expanded === row._row && (
                  <div className="text-sm text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2">
                    {Object.entries(row)
                      .filter(([k]) => !["_row", "Status"].includes(k) && row[k])
                      .map(([k, v]) => (
                        <div key={k}><span className="font-medium text-foreground">{k}:</span> {String(v)}</div>
                      ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="gap-1" disabled={acting === row._row} onClick={() => act(row, "approve")}>
                    <CheckCircle className="w-3 h-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50" disabled={acting === row._row} onClick={() => act(row, "reject")}>
                    <XCircle className="w-3 h-3" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Previously actioned</p>
          <div className="space-y-2">
            {done.map((row) => (
              <div key={row._row} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 text-sm">
                <span>{row["Student Name"] || row["Name"] || "Unknown"}</span>
                <StatusBadge status={row["Status"]} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BLANK_STUDENT = {
  name: "", email: "", parentName: "", parentEmail: "",
  phone: "", parentPhone: "", currentGrade: "", currentSchool: "",
  previousStudent: false, subjectsInterested: [] as string[], notes: "",
};

function SubjectMultiSelect({ selected, onChange, subjects }: {
  selected: string[]; onChange: (v: string[]) => void; subjects: string[];
}) {
  const [open, setOpen] = useState(false);
  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background text-left min-h-[38px]"
      >
        <span className={selected.length ? "text-foreground" : "text-muted-foreground"}>
          {selected.length ? selected.join(", ") : "Select subjects…"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full border rounded-md bg-popover shadow-md max-h-52 overflow-y-auto">
          {subjects.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">No active subjects found.</p>
          )}
          {subjects.map(s => (
            <label key={s} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(s)}
                onChange={() => toggle(s)}
                className="accent-primary"
              />
              {s}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentsTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_STUDENT });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function toggleStatus(s: any) {
    setActing(s.userId);
    const endpoint = s.status?.toLowerCase() === "active" ? "/users/deactivate" : "/users/reactivate";
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ userId: s.userId }) });
      await load();
    } catch { /* ignore */ }
    setActing(null);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [userData, subjectData] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/subjects?status=active"),
      ]);
      if (Array.isArray(userData)) setStudents(userData.filter((u: any) => u.role === "student"));
      else setError("Could not load students.");
      if (Array.isArray(subjectData)) setSubjects(subjectData.map((s: any) => s["Name"] || s.Name).filter(Boolean));
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openForm() { setForm({ ...BLANK_STUDENT }); setFormError(""); setShowForm(true); }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Student name is required."); return; }
    setSaving(true);
    setFormError("");
    try {
      const data = await apiFetch("/principals/add-student", { method: "POST", body: JSON.stringify(form) });
      if (data.ok) {
        setShowForm(false);
        await load();
      } else {
        setFormError(data.error || "Failed to add student.");
      }
    } catch { setFormError("Connection error."); }
    setSaving(false);
  }

  function field(label: string, input: React.ReactNode, required = false) {
    return (
      <div>
        <label className="text-xs font-medium mb-1 block">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {input}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title={`Students (${students.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <Button size="sm" className="mb-4 gap-1" onClick={openForm}>
        <UserPlus className="w-4 h-4" /> Add Student
      </Button>

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Add New Student</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field("Student Name", <Input placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />, true)}
                {field("Student Email", <Input type="email" placeholder="student@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />)}
                {field("Parent Name", <Input placeholder="Full name" value={form.parentName} onChange={e => setForm({ ...form, parentName: e.target.value })} />)}
                {field("Parent Email", <Input type="email" placeholder="parent@email.com" value={form.parentEmail} onChange={e => setForm({ ...form, parentEmail: e.target.value })} />)}
                {field("Student Contact Phone", <Input placeholder="e.g. 0412 345 678" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />)}
                {field("Parent Contact Phone", <Input placeholder="e.g. 0412 345 678" value={form.parentPhone} onChange={e => setForm({ ...form, parentPhone: e.target.value })} />)}
                {field("Current Grade / Year", <Input placeholder="e.g. Year 10" value={form.currentGrade} onChange={e => setForm({ ...form, currentGrade: e.target.value })} />)}
                {field("Current School", <Input placeholder="e.g. Sydney Grammar School" value={form.currentSchool} onChange={e => setForm({ ...form, currentSchool: e.target.value })} />)}
              </div>

              <div className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  id="prevStudent"
                  checked={form.previousStudent}
                  onChange={e => setForm({ ...form, previousStudent: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 accent-primary"
                />
                <label htmlFor="prevStudent" className="text-sm font-medium cursor-pointer">
                  Previously enrolled (re-enrolment)
                </label>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Subjects Interested In</label>
                <SubjectMultiSelect
                  selected={form.subjectsInterested}
                  onChange={v => setForm({ ...form, subjectsInterested: v })}
                  subjects={subjects}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Notes</label>
                <textarea
                  placeholder="Any additional notes…"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Add Student"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setFormError(""); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && students.length === 0 && <p className="text-sm text-muted-foreground">No students yet.</p>}
      <div className="space-y-2">
        {students.map((s) => (
          <div key={s.userId} className="p-3 rounded-lg border text-sm space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{s.name}</p>
                {s.email && <p className="text-muted-foreground">{s.email}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={s.status} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting === s.userId}
                  onClick={() => toggleStatus(s)}
                  className="text-xs"
                >
                  {s.status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorsTab() {
  const [tutors, setTutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subjects: "", specialty: "", zoomLink: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function toggleStatus(t: any) {
    setActing(t.UserID);
    const endpoint = t.Status?.toLowerCase() === "active" ? "/users/deactivate" : "/users/reactivate";
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ userId: t.UserID }) });
      await load();
    } catch { /* ignore */ }
    setActing(null);
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/principals/teachers");
      if (Array.isArray(data)) setTutors(data);
      else setError("Could not load tutors.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true);
    setFormError("");
    try {
      const data = await apiFetch("/principals/add-teacher", { method: "POST", body: JSON.stringify(form) });
      if (data.ok) {
        setForm({ name: "", email: "", subjects: "", specialty: "", zoomLink: "" });
        setShowForm(false);
        await load();
      } else {
        setFormError(data.error || "Failed to add tutor.");
      }
    } catch { setFormError("Connection error."); }
    setSaving(false);
  }

  return (
    <div>
      <SectionHeader title={`Tutors (${tutors.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <Button size="sm" className="mb-4 gap-1" onClick={() => setShowForm(!showForm)}>
        <UserPlus className="w-4 h-4" /> Add Tutor
      </Button>

      {showForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Add New Tutor</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium mb-1 block">Name *</label>
                  <Input placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="text-xs font-medium mb-1 block">Email</label>
                  <Input type="email" placeholder="tutor@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="text-xs font-medium mb-1 block">Subjects</label>
                  <Input placeholder="e.g. Maths, English" value={form.subjects} onChange={e => setForm({ ...form, subjects: e.target.value })} /></div>
                <div><label className="text-xs font-medium mb-1 block">Specialty</label>
                  <Input placeholder="e.g. HSC, Primary" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="text-xs font-medium mb-1 block">Zoom Link</label>
                  <Input placeholder="https://zoom.us/j/…" value={form.zoomLink} onChange={e => setForm({ ...form, zoomLink: e.target.value })} /></div>
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Add Tutor"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setFormError(""); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && tutors.length === 0 && <p className="text-sm text-muted-foreground">No tutors yet.</p>}
      <div className="space-y-2">
        {tutors.map((t) => (
          <div key={t.UserID} className="p-3 rounded-lg border text-sm space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t.Name}</p>
                <p className="text-muted-foreground">{t.Email}</p>
                {t.Subjects && <p className="text-xs">Subjects: {t.Subjects}</p>}
                {t.Specialty && <p className="text-xs">Specialty: {t.Specialty}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={t.Status} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting === t.UserID}
                  onClick={() => toggleStatus(t)}
                  className="text-xs"
                >
                  {t.Status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/users");
      if (Array.isArray(data)) setUsers(data);
      else setError("Could not load users.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleStatus(user: any) {
    setActing(user.userId);
    const endpoint = user.status?.toLowerCase() === "active" ? "/users/deactivate" : "/users/reactivate";
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ userId: user.userId }) });
      await load();
    } catch { /* ignore */ }
    setActing(null);
  }

  const filtered = users.filter(u =>
    !filter || u.name?.toLowerCase().includes(filter.toLowerCase()) || u.email?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <SectionHeader title={`All Users (${users.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <Input
        placeholder="Search by name or email…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="mb-4"
      />

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
      <div className="space-y-2">
        {filtered.map((u) => (
          <div key={u.userId} className="flex items-center justify-between p-3 rounded-lg border text-sm">
            <div>
              <p className="font-medium">{u.name}</p>
              <p className="text-muted-foreground">{u.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={u.status} />
              <Button
                size="sm"
                variant="outline"
                disabled={acting === u.userId}
                onClick={() => toggleStatus(u)}
                className="text-xs"
              >
                {u.status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "requests", label: "Requests",  icon: <ClipboardList className="w-4 h-4" /> },
  { id: "students", label: "Students",  icon: <Users className="w-4 h-4" /> },
  { id: "tutors",   label: "Tutors",    icon: <UserCheck className="w-4 h-4" /> },
  { id: "classes",  label: "Classes",   icon: <BookOpen className="w-4 h-4" /> },
  { id: "users",    label: "All Users", icon: <Users className="w-4 h-4" /> },
];

export default function PrincipalDashboard() {
  const signOut = useSignOut();
  const name = localStorage.getItem("edutrack_user_name") || "Principal";
  const [tab, setTab] = useState<Tab>("requests");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">EduTrack</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Principal</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{name}</span>
          <Button variant="ghost" size="sm" className="gap-2" onClick={signOut}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="border-b bg-card px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <NotificationPrompt />
        {tab === "requests" && <EnrollmentRequestsTab />}
        {tab === "students" && <StudentsTab />}
        {tab === "tutors"   && <TutorsTab />}
        {tab === "classes"  && <ClassesTab />}
        {tab === "users"    && <UsersTab />}
      </main>
    </div>
  );
}
