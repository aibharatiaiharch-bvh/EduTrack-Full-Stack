import { useState, useEffect } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, LogOut, ClipboardList, Users, UserCheck,
  UserPlus, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle, Clock, DollarSign, Plus, CheckCircle2,
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
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", type: "Group", days: "", time: "", room: "", maxCapacity: "8", teacherId: "" });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

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

  useAutoRefresh(load);

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    setAddSubmitting(true); setAddError(""); setAddSuccess("");
    try {
      const data = await apiFetch("/subjects", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name,
          type: addForm.type,
          teacherId: addForm.teacherId,
          days: addForm.days,
          time: addForm.time,
          room: addForm.room,
          maxCapacity: addForm.maxCapacity,
        }),
      });
      if (data.ok) {
        setAddSuccess(`Class "${addForm.name}" created (${data.subjectId})`);
        setAddForm({ name: "", type: "Group", days: "", time: "", room: "", maxCapacity: "8", teacherId: "" });
        setShowAdd(false);
        await load();
      } else {
        setAddError(data.error || "Failed to create class.");
      }
    } catch { setAddError("Connection error."); }
    setAddSubmitting(false);
  }

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

      {/* Add Subject */}
      <div className="mb-4">
        {addSuccess && !showAdd && (
          <p className="text-xs text-green-600 flex items-center gap-1 mb-2"><CheckCircle2 className="w-3 h-3" />{addSuccess}</p>
        )}
        {!showAdd ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setShowAdd(true); setAddSuccess(""); }}>
            <Plus className="w-3.5 h-3.5" /> Add New Class
          </Button>
        ) : (
          <Card className="border-primary/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Add New Class</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <form onSubmit={handleAddSubject} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Class Name <span className="text-destructive">*</span></Label>
                    <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Maths Year 5" required className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type <span className="text-destructive">*</span></Label>
                    <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="Group">Group</option>
                      <option value="Individual">Individual</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Days</Label>
                    <Input value={addForm.days} onChange={e => setAddForm(f => ({ ...f, days: e.target.value }))} placeholder="e.g. Mon, Wed" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time</Label>
                    <Input value={addForm.time} onChange={e => setAddForm(f => ({ ...f, time: e.target.value }))} placeholder="e.g. 4:00 PM" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Room</Label>
                    <Input value={addForm.room} onChange={e => setAddForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 3" className="h-8 text-sm" />
                  </div>
                  {(addForm.type === "Group" || addForm.type === "Both") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Max Capacity</Label>
                      <Input type="number" min="1" value={addForm.maxCapacity} onChange={e => setAddForm(f => ({ ...f, maxCapacity: e.target.value }))} placeholder="8" className="h-8 text-sm" />
                    </div>
                  )}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Assign Teacher</Label>
                    <select value={addForm.teacherId} onChange={e => setAddForm(f => ({ ...f, teacherId: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Unassigned</option>
                      {tutors.map(t => <option key={t.UserID} value={t.UserID}>{t.Name}</option>)}
                    </select>
                  </div>
                </div>
                {addError && <p className="text-xs text-destructive">{addError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={addSubmitting} className="gap-1">
                    <Plus className="w-3.5 h-3.5" />{addSubmitting ? "Saving…" : "Create Class"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setShowAdd(false); setAddError(""); }}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

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

type Tab = "requests" | "students" | "tutors" | "users" | "classes" | "latecancels";

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

  useAutoRefresh(load);

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
  const [acting,          setActing]          = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentClasses,  setStudentClasses]  = useState<Record<string, any[]>>({});
  const [classLoading,    setClassLoading]    = useState<string | null>(null);
  const [cancellingRow,   setCancellingRow]   = useState<number | null>(null);

  async function toggleStatus(s: any) {
    setActing(s.userId);
    const endpoint = s.status?.toLowerCase() === "active" ? "/users/deactivate" : "/users/reactivate";
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ userId: s.userId }) });
      await load();
    } catch { /* ignore */ }
    setActing(null);
  }

  async function loadStudentClasses(userId: string) {
    setClassLoading(userId);
    try {
      const data = await apiFetch(`/enrollments?userId=${encodeURIComponent(userId)}&status=approved,active`);
      if (Array.isArray(data)) setStudentClasses(prev => ({ ...prev, [userId]: data }));
    } catch { /* ignore */ }
    setClassLoading(null);
  }

  async function cancelEnrollment(userId: string, rowNum: number) {
    setCancellingRow(rowNum);
    try {
      await apiFetch(`/enrollments/${rowNum}/cancel`, { method: "POST", body: JSON.stringify({}) });
      await loadStudentClasses(userId);
    } catch { /* ignore */ }
    setCancellingRow(null);
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

  useAutoRefresh(load);

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
        {students.map((s) => {
          const isExpanded = expandedStudent === s.userId;
          const classes    = studentClasses[s.userId] || [];
          return (
            <div key={s.userId} className="rounded-lg border text-sm">
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{s.name}</p>
                  {s.email && <p className="text-muted-foreground text-xs">{s.email}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={s.status} />
                  <button
                    className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                    onClick={() => {
                      if (!isExpanded) {
                        setExpandedStudent(s.userId);
                        if (!studentClasses[s.userId]) loadStudentClasses(s.userId);
                      } else {
                        setExpandedStudent(null);
                      }
                    }}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Classes
                  </button>
                  <Button
                    size="sm" variant="outline"
                    disabled={acting === s.userId}
                    onClick={() => toggleStatus(s)}
                    className="text-xs"
                  >
                    {s.status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-muted/30 px-3 py-2 space-y-2">
                  {classLoading === s.userId && (
                    <p className="text-xs text-muted-foreground">Loading classes…</p>
                  )}
                  {classLoading !== s.userId && classes.length === 0 && (
                    <p className="text-xs text-muted-foreground">No active enrollments.</p>
                  )}
                  {classes.map((enr: any) => (
                    <div key={enr.EnrollmentID || enr._row} className="flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-medium">{enr["Class Name"] || enr.ClassID}</span>
                        {(enr["Class Date"] && enr["Class Date"] !== "TBD") && (
                          <span className="text-muted-foreground ml-2">{enr["Class Date"]}</span>
                        )}
                      </div>
                      <Button
                        size="sm" variant="outline"
                        disabled={cancellingRow === enr._row}
                        onClick={() => cancelEnrollment(s.userId, enr._row)}
                        className="text-xs h-6 px-2 text-red-600 border-red-200 hover:bg-red-50"
                      >
                        {cancellingRow === enr._row ? "…" : "Cancel"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

  useAutoRefresh(load);

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

  useAutoRefresh(load);

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

function LateCancellationsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/enrollments?status=Late%20Cancellation");
      if (Array.isArray(data)) setRows(data);
      else setError("Could not load late cancellations.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useAutoRefresh(load);

  async function override(row: any, action: "Fee Waived" | "Fee Confirmed") {
    setActing(row._row);
    try {
      await apiFetch(`/enrollments/${row._row}/override`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
    } catch {}
    setActing(null);
  }

  const lateCancels = rows.filter(r => (r["Status"] || "").toLowerCase() === "late cancellation");
  const resolved = rows.filter(r => ["fee waived", "fee confirmed"].includes((r["Status"] || "").toLowerCase()));

  return (
    <div>
      <SectionHeader title={`Late Cancellations (${lateCancels.length} pending review)`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {lateCancels.length === 0 && !loading && (
        <div className="py-10 text-center text-muted-foreground text-sm">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No late cancellations pending review.
        </div>
      )}

      <div className="space-y-3">
        {lateCancels.map(r => {
          const notes = (() => { try { return JSON.parse(r["ClassID"] || "{}"); } catch { return {}; } })();
          return (
            <Card key={r._row} className="border-amber-200 bg-amber-50/40">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{r["Student Name"] || r["UserID"] || "Unknown student"}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium border border-amber-200">
                        Late Cancellation
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Class:</span> {r["Class Name"] || r["ClassID"] || "—"}
                    </p>
                    {r["Student Email"] && (
                      <p className="text-xs text-muted-foreground">{r["Student Email"]}</p>
                    )}
                    {r["EnrolledAt"] && (
                      <p className="text-xs text-muted-foreground">
                        Cancelled: {new Date(r["EnrolledAt"]).toLocaleDateString("en-AU")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-300 text-green-700 hover:bg-green-50"
                      disabled={acting === r._row}
                      onClick={() => override(r, "Fee Waived")}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Fee Waived
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={acting === r._row}
                      onClick={() => override(r, "Fee Confirmed")}
                    >
                      <DollarSign className="h-3.5 w-3.5 mr-1" />
                      Fee Confirmed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {resolved.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Resolved ({resolved.length})</h3>
          <div className="space-y-2">
            {resolved.map(r => (
              <div key={r._row} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                <div>
                  <span className="font-medium">{r["Student Name"] || r["UserID"] || "—"}</span>
                  <span className="text-muted-foreground mx-2">·</span>
                  <span className="text-muted-foreground">{r["Class Name"] || r["ClassID"] || "—"}</span>
                </div>
                <StatusBadge status={r["Status"]} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "requests",    label: "Requests",          icon: <ClipboardList className="w-4 h-4" /> },
  { id: "latecancels", label: "Late Cancellations", icon: <Clock className="w-4 h-4" /> },
  { id: "students",    label: "Students",           icon: <Users className="w-4 h-4" /> },
  { id: "tutors",      label: "Tutors",             icon: <UserCheck className="w-4 h-4" /> },
  { id: "classes",     label: "Classes",            icon: <BookOpen className="w-4 h-4" /> },
  { id: "users",       label: "All Users",          icon: <Users className="w-4 h-4" /> },
];

export default function PrincipalDashboard() {
  const signOut = useSignOut();
  const name = localStorage.getItem("edutrack_user_name") || "Principal";
  const [tab, setTab] = useState<Tab>("requests");

  useEffect(() => {
    localStorage.setItem("edutrack_user_role", "principal");
  }, []);

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
        {tab === "requests"    && <EnrollmentRequestsTab />}
        {tab === "latecancels" && <LateCancellationsTab />}
        {tab === "students"    && <StudentsTab />}
        {tab === "tutors"      && <TutorsTab />}
        {tab === "classes"     && <ClassesTab />}
        {tab === "users"       && <UsersTab />}
      </main>
    </div>
  );
}
