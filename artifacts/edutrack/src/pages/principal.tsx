import { useState, useEffect, Fragment } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { BulkUploadCard } from "@/components/BulkUploadCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, LogOut, ClipboardList, Users, UserCheck,
  UserPlus, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle, DollarSign, Plus, CheckCircle2, Upload,
  Search, ChevronLeft, ChevronRight,
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

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

      {!loading && subjects.length > 0 && (() => {
        const types = ["all", ...Array.from(new Set(subjects.map(s => s.Type).filter(Boolean))).sort()];
        const q = search.toLowerCase();
        const filtered = subjects.filter(s => {
          const matchSearch = !q ||
            (s.Name || "").toLowerCase().includes(q) ||
            (s.TeacherName || s.Teachers || "").toLowerCase().includes(q) ||
            (s.Days || "").toLowerCase().includes(q);
          const matchType = typeFilter === "all" || s.Type === typeFilter;
          return matchSearch && matchType;
        });
        return (
          <>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, teacher or day…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="flex gap-1 flex-wrap shrink-0">
                {types.map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      typeFilter === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {t === "all" ? "All types" : t}
                  </button>
                ))}
              </div>
              {(search || typeFilter !== "all") && (
                <p className="text-xs text-muted-foreground self-center shrink-0">{filtered.length} of {subjects.length}</p>
              )}
            </div>

            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No classes match your search.</p>
            )}

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5">Class</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Type</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Teacher</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Schedule</th>
                    <th className="text-left font-medium px-3 py-2.5">Enrolled</th>
                    <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Students</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => {
                    const subjectId = s["SubjectID"] || s.SubjectID || "";
                    const isOpen = reassigning === subjectId;
                    const isSaving = saving === subjectId;
                    const didSucceed = success === subjectId;
                    const currentTeacher = s.TeacherName || s.Teachers || "Unassigned";
                    const currentEnrolled = s.currentEnrolled ?? 0;
                    return (
                      <Fragment key={subjectId}>
                        <tr className={`hover:bg-muted/20 ${isOpen ? "bg-amber-50/60" : ""}`}>
                          <td className="px-3 py-2.5 font-medium">
                            <span>{s.Name || s["Name"]}</span>
                            {didSucceed && !isOpen && (
                              <span className="ml-2 text-xs text-green-600 font-normal inline-flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Reassigned
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{s.Type || "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{currentTeacher}</td>
                          <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                            {[s.Days, s.Time].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{currentEnrolled}</td>
                          <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell text-xs">
                            {s.enrolledNames || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {!isOpen ? (
                              <Button
                                size="sm" variant="outline"
                                className="text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50 h-7"
                                onClick={() => { setReassigning(subjectId); setSuccess(null); }}
                              >
                                <AlertTriangle className="w-3 h-3" /> Reassign
                              </Button>
                            ) : (
                              <Button
                                size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => { setReassigning(null); setSelected(sv => { const n = { ...sv }; delete n[subjectId]; return n; }); }}
                              >
                                Cancel
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-amber-50/30">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 shrink-0">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Updates class and all active enrollments immediately.
                                </div>
                                <select
                                  className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
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
                                <Button
                                  size="sm"
                                  disabled={!selected[subjectId] || isSaving}
                                  onClick={() => doReassign(subjectId)}
                                  className="gap-1 shrink-0"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  {isSaving ? "Saving…" : `Confirm (${currentEnrolled} enrolment${currentEnrolled !== 1 ? "s" : ""})`}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </div>
  );
}

type Tab = "requests" | "students" | "tutors" | "users" | "classes" | "upload";

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const color =
    s === "active"   ? "bg-green-100 text-green-800" :
    s === "paid"     ? "bg-green-100 text-green-800" :
    s === "pending"  ? "bg-amber-100 text-amber-800" :
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

// ─── Type badge for request type ───────────────────────────────────────────
function RequestTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    "New Enrollment": "bg-blue-100 text-blue-800 border-blue-200",
    "Fee Waiver":     "bg-amber-100 text-amber-800 border-amber-200",
    "Completed":      "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${map[type] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {type}
    </span>
  );
}

function RequestsTab() {
  const [enrollRows, setEnrollRows] = useState<any[]>([]);
  const [lateRows, setLateRows]     = useState<any[]>([]);
  const [subjects, setSubjects]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [acting, setActing]         = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "enrollment" | "fee-waiver">("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [assigningRow, setAssigningRow]   = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [assignSaving, setAssignSaving]   = useState(false);
  const [assignError, setAssignError]     = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [enrollData, lateData, subjectData] = await Promise.all([
        apiFetch("/enrollment-requests"),
        apiFetch("/enrollments?status=Late%20Cancellation"),
        apiFetch("/subjects?status=active"),
      ]);
      if (Array.isArray(enrollData)) setEnrollRows(enrollData);
      else setError("Could not load enrollment requests.");
      if (Array.isArray(lateData)) setLateRows(lateData);
      if (Array.isArray(subjectData)) setSubjects(subjectData);
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useAutoRefresh(load);

  async function actEnroll(row: any, action: "approve" | "reject" | "mark-paid") {
    setActing(`e-${row._row}`);
    try {
      await apiFetch(`/enrollment-requests/${row._row}/${action}`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch {}
    setActing(null);
  }

  async function actLate(row: any, action: "Fee Waived" | "Fee Confirmed") {
    setActing(`l-${row._row}`);
    try {
      await apiFetch(`/enrollments/${row._row}/override`, { method: "POST", body: JSON.stringify({ action }) });
      await load();
    } catch {}
    setActing(null);
  }

  async function assignClass(rowNum: number) {
    if (!selectedClass) return;
    setAssignSaving(true); setAssignError("");
    try {
      const data = await apiFetch(`/enrollment-requests/${rowNum}/assign-class`, {
        method: "PATCH", body: JSON.stringify({ classId: selectedClass }),
      });
      if (data.ok) { setAssigningRow(null); setSelectedClass(""); await load(); }
      else setAssignError(data.error || "Failed to assign class.");
    } catch { setAssignError("Connection error."); }
    setAssignSaving(false);
  }

  // Tag every row with _src and _type for unified table
  const DONE_STATUSES = ["paid", "rejected", "fee waived", "fee confirmed"];
  const allRows = [
    ...enrollRows.map(r => ({ ...r, _src: "enrollment" as const })),
    ...lateRows.map(r => ({ ...r, _src: "fee-waiver" as const })),
  ];

  const filtered = allRows.filter(r => {
    const status = (r["Status"] || "").toLowerCase();
    const isDone = DONE_STATUSES.includes(status);
    if (!showCompleted && isDone) return false;
    if (typeFilter !== "all" && r._src !== typeFilter) return false;
    return true;
  });

  const activeCount = allRows.filter(r => !DONE_STATUSES.includes((r["Status"] || "").toLowerCase())).length;
  const completedCount = allRows.filter(r => DONE_STATUSES.includes((r["Status"] || "").toLowerCase())).length;

  const isEmpty = allRows.length === 0;

  return (
    <div>
      <SectionHeader title={`Requests (${activeCount} need action)`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && isEmpty && <p className="text-sm text-muted-foreground">No requests found.</p>}

      {!loading && !isEmpty && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
            <div className="flex gap-1">
              {([
                { id: "all",          label: "All types" },
                { id: "enrollment",   label: "New Enrollment" },
                { id: "fee-waiver",   label: "Fee Waiver" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTypeFilter(t.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    typeFilter === t.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCompleted(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                showCompleted
                  ? "bg-muted text-foreground border-border"
                  : "text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {showCompleted ? "Hide" : "Show"} completed ({completedCount})
            </button>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Student</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Details</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">No requests match this filter.</td></tr>
                )}
                {filtered.map(row => {
                  const key = `${row._src}-${row._row}`;
                  const status = (row["Status"] || "").toLowerCase();
                  const isDone = DONE_STATUSES.includes(status);
                  const isActingNow = acting === (row._src === "enrollment" ? `e-${row._row}` : `l-${row._row}`);
                  const noClass = row._src === "enrollment" && !(row["ClassID"] || "").trim();
                  const isAssigning = assigningRow === row._row && row._src === "enrollment";

                  let details: React.ReactNode = null;
                  // Resolve a SubjectID → display name using loaded subjects
                  const subjectName = (id: string) => {
                    const s = subjects.find(s => s["SubjectID"] === id);
                    return s ? s["Name"] : id;
                  };
                  // Resolve Classes Interested: may be a name or an ID
                  const classDisplay = (() => {
                    const ci = row["Classes Interested"];
                    if (!ci) return "";
                    // If it looks like a SubjectID, look it up; otherwise use as-is
                    const resolved = subjects.find(s => s["SubjectID"] === ci);
                    return resolved ? resolved["Name"] : ci;
                  })();
                  // Assigned class name (from ClassID column)
                  const assignedClass = row["ClassID"] ? subjectName(row["ClassID"]) : "";

                  if (row._src === "enrollment") {
                    const chips: string[] = [];
                    if (classDisplay || assignedClass) chips.push(classDisplay || assignedClass);
                    if (row["Grade"])  chips.push(`Yr ${row["Grade"]}`);
                    if (row["School"]) chips.push(row["School"]);
                    details = (
                      <div className="text-xs text-muted-foreground">
                        <span>{chips.join(" · ") || "—"}</span>
                        {row["Requested On"] && (
                          <span className="ml-2 text-muted-foreground/70">{row["Requested On"]}</span>
                        )}
                        {noClass && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-orange-600 font-medium">
                            <AlertTriangle className="w-3 h-3" /> No class
                          </span>
                        )}
                      </div>
                    );
                  } else {
                    const classLabel = row["Class Name"] || (row["ClassID"] ? subjectName(row["ClassID"]) : "");
                    let cancelDate = "";
                    if (row["EnrolledAt"]) {
                      try { cancelDate = new Date(row["EnrolledAt"]).toLocaleDateString("en-AU"); } catch {}
                    }
                    const chips: string[] = [];
                    if (classLabel)  chips.push(classLabel);
                    if (cancelDate)  chips.push(`Cancelled ${cancelDate}`);
                    details = (
                      <div className="text-xs text-muted-foreground">{chips.join(" · ") || "—"}</div>
                    );
                  }

                  return (
                    <Fragment key={key}>
                      <tr className={`hover:bg-muted/20 ${isDone ? "opacity-60" : ""}`}>
                        {/* Type */}
                        <td className="px-3 py-2.5 align-middle">
                          <RequestTypeBadge type={row._src === "enrollment" ? "New Enrollment" : "Fee Waiver"} />
                        </td>
                        {/* Student — name only, no parent ID */}
                        <td className="px-3 py-2.5 align-middle">
                          <div className="font-medium leading-tight">{row["Student Name"] || row["Name"] || row["UserID"] || "Unknown"}</div>
                          {/* Details inline on small screens */}
                          <div className="md:hidden mt-0.5">{details}</div>
                        </td>
                        {/* Details (desktop) */}
                        <td className="px-3 py-2.5 align-middle hidden md:table-cell">{details}</td>
                        {/* Status */}
                        <td className="px-3 py-2.5 align-top">
                          <StatusBadge status={row["Status"] || (row._src === "enrollment" ? "Pending" : "Late Cancellation")} />
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {row._src === "enrollment" && !isDone && (
                              <>
                                {noClass && (
                                  <button
                                    onClick={() => { setAssigningRow(isAssigning ? null : row._row); setSelectedClass(""); setAssignError(""); setExpandedRow(isAssigning ? null : key); }}
                                    className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 font-medium flex items-center gap-0.5">
                                    <Plus className="w-3 h-3" /> Assign Class
                                  </button>
                                )}
                                {status === "pending" && (
                                  <>
                                    <Button size="sm" className="h-7 text-xs gap-1" disabled={isActingNow} onClick={() => actEnroll(row, "approve")}>
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" disabled={isActingNow} onClick={() => actEnroll(row, "reject")}>
                                      <XCircle className="w-3 h-3" /> Reject
                                    </Button>
                                  </>
                                )}
                                {status === "approved" && (
                                  <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" disabled={isActingNow} onClick={() => actEnroll(row, "mark-paid")}>
                                    <CheckCircle2 className="w-3 h-3" /> Mark Paid
                                  </Button>
                                )}
                              </>
                            )}
                            {row._src === "fee-waiver" && !isDone && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50" disabled={isActingNow} onClick={() => actLate(row, "Fee Waived")}>
                                  <CheckCircle className="w-3 h-3" /> Waive
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50" disabled={isActingNow} onClick={() => actLate(row, "Fee Confirmed")}>
                                  <DollarSign className="w-3 h-3" /> Confirm Fee
                                </Button>
                              </>
                            )}
                            {isDone && <span className="text-xs text-muted-foreground italic">—</span>}
                          </div>
                        </td>
                      </tr>

                      {/* Assign-class sub-row */}
                      {isAssigning && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 bg-orange-50/60 border-t border-orange-100">
                            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                              <span className="text-xs font-medium text-orange-700 shrink-0">Assign a class:</span>
                              <select
                                value={selectedClass}
                                onChange={e => setSelectedClass(e.target.value)}
                                className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-background min-w-0"
                              >
                                <option value="">Select a class…</option>
                                {subjects.map(s => (
                                  <option key={s["SubjectID"]} value={s["SubjectID"]}>
                                    {s["Name"]} ({s["Type"]})
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-2 shrink-0">
                                <Button size="sm" className="h-7 text-xs gap-1" disabled={!selectedClass || assignSaving} onClick={() => assignClass(row._row)}>
                                  <CheckCircle className="w-3 h-3" />{assignSaving ? "Saving…" : "Assign"}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssigningRow(null); setSelectedClass(""); setAssignError(""); }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                            {assignError && <p className="text-xs text-red-500 mt-1">{assignError}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
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

const PAGE_SIZE = 15;

function ListControls({
  search, onSearch,
  statusFilter, onStatusFilter,
  total, filtered,
}: {
  search: string; onSearch: (v: string) => void;
  statusFilter: string; onStatusFilter: (v: string) => void;
  total: number; filtered: number;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-8 h-8 text-sm"
        />
      </div>
      <div className="flex gap-1 shrink-0">
        {(["all", "active", "inactive"] as const).map(f => (
          <button
            key={f}
            onClick={() => onStatusFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
              statusFilter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {search || statusFilter !== "all" ? (
        <p className="text-xs text-muted-foreground self-center shrink-0">
          {filtered} of {total}
        </p>
      ) : null}
    </div>
  );
}

function PaginationBar({
  page, totalPages, onPage,
}: {
  page: number; totalPages: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="p-1 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
            p === page
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="p-1 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
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
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page,         setPage]         = useState(1);

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
      {!loading && students.length > 0 && (() => {
        const q = search.toLowerCase();
        const filtered = students.filter(s => {
          const matchesSearch = !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
          const matchesStatus = statusFilter === "all" || (s.status?.toLowerCase() ?? "") === statusFilter;
          return matchesSearch && matchesStatus;
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
        return (
          <>
            <ListControls
              search={search} onSearch={v => { setSearch(v); setPage(1); }}
              statusFilter={statusFilter} onStatusFilter={v => { setStatusFilter(v); setPage(1); }}
              total={students.length} filtered={filtered.length}
            />
            {paged.length === 0 && <p className="text-sm text-muted-foreground">No students match your search.</p>}
            {paged.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-medium px-3 py-2.5">Name</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Email</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Grade</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                      <th className="text-left font-medium px-3 py-2.5">Classes</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paged.map((s) => {
                      const isExpanded = expandedStudent === s.userId;
                      const classes    = studentClasses[s.userId] || [];
                      return (
                        <Fragment key={s.userId}>
                          <tr className="hover:bg-muted/20">
                            <td className="px-3 py-2.5 font-medium">{s.name}</td>
                            <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{s.email || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{s.currentGrade || "—"}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                            <td className="px-3 py-2.5">
                              <button
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
                                View
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <Button
                                size="sm" variant="outline"
                                disabled={acting === s.userId}
                                onClick={() => toggleStatus(s)}
                                className="text-xs h-7"
                              >
                                {s.status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/30">
                              <td colSpan={6} className="px-4 py-3">
                                {classLoading === s.userId && (
                                  <p className="text-xs text-muted-foreground">Loading classes…</p>
                                )}
                                {classLoading !== s.userId && classes.length === 0 && (
                                  <p className="text-xs text-muted-foreground">No active enrollments.</p>
                                )}
                                {classes.length > 0 && (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-muted-foreground border-b">
                                        <th className="text-left font-medium pb-1.5">Class</th>
                                        <th className="text-left font-medium pb-1.5 hidden sm:table-cell">Date</th>
                                        <th className="pb-1.5" />
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {classes.map((enr: any) => (
                                        <tr key={enr.EnrollmentID || enr._row}>
                                          <td className="py-1.5 font-medium">{enr["Class Name"] || enr.ClassID}</td>
                                          <td className="py-1.5 text-muted-foreground hidden sm:table-cell">
                                            {(enr["Class Date"] && enr["Class Date"] !== "TBD") ? enr["Class Date"] : "—"}
                                          </td>
                                          <td className="py-1.5 text-right">
                                            <Button
                                              size="sm" variant="outline"
                                              disabled={cancellingRow === enr._row}
                                              onClick={() => cancelEnrollment(s.userId, enr._row)}
                                              className="h-6 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                            >
                                              {cancellingRow === enr._row ? "…" : "Cancel"}
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar page={safePage} totalPages={totalPages} onPage={setPage} />
          </>
        );
      })()}
      {!loading && students.length === 0 && <p className="text-sm text-muted-foreground">No students yet.</p>}
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
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page,         setPage]         = useState(1);

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
      {!loading && tutors.length > 0 && (() => {
        const q = search.toLowerCase();
        const filtered = tutors.filter(t => {
          const matchesSearch = !q || t.Name?.toLowerCase().includes(q) || t.Email?.toLowerCase().includes(q) || t.Subjects?.toLowerCase().includes(q);
          const matchesStatus = statusFilter === "all" || (t.Status?.toLowerCase() ?? "") === statusFilter;
          return matchesSearch && matchesStatus;
        });
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
        return (
          <>
            <ListControls
              search={search} onSearch={v => { setSearch(v); setPage(1); }}
              statusFilter={statusFilter} onStatusFilter={v => { setStatusFilter(v); setPage(1); }}
              total={tutors.length} filtered={filtered.length}
            />
            {paged.length === 0 && <p className="text-sm text-muted-foreground">No tutors match your search.</p>}
            {paged.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-medium px-3 py-2.5">Name</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Email</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Subjects</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Specialty</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paged.map((t) => (
                      <tr key={t.UserID} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">{t.Name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{t.Email || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{t.Subjects || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">{t.Specialty || "—"}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={t.Status} /></td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            size="sm" variant="outline"
                            disabled={acting === t.UserID}
                            onClick={() => toggleStatus(t)}
                            className="text-xs h-7"
                          >
                            {t.Status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar page={safePage} totalPages={totalPages} onPage={setPage} />
          </>
        );
      })()}
      {!loading && tutors.length === 0 && <p className="text-sm text-muted-foreground">No tutors yet.</p>}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

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

  const q = search.toLowerCase();
  const filtered = users.filter(u => {
    const matchSearch = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || (u.status?.toLowerCase() ?? "") === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <SectionHeader title={`All Users (${users.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or role…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1 shrink-0">
          {["active", "all", "inactive"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors capitalize ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {(search || statusFilter !== "active") && (
          <p className="text-xs text-muted-foreground self-center shrink-0">{filtered.length} of {users.length}</p>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No users match your search.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left font-medium px-3 py-2.5">Name</th>
                <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Email</th>
                <th className="text-left font-medium px-3 py-2.5">Role</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u) => (
                <tr key={u.userId} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.name}</span>
                      <Button
                        size="sm" variant="outline"
                        disabled={acting === u.userId}
                        onClick={() => toggleStatus(u)}
                        className="text-xs h-6 px-2 shrink-0"
                      >
                        {u.status?.toLowerCase() === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{u.email || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground capitalize">{u.role}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={u.status} /></td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "requests",    label: "Requests",           icon: <ClipboardList className="w-4 h-4" /> },
  { id: "students",    label: "Students",            icon: <Users className="w-4 h-4" /> },
  { id: "tutors",      label: "Tutors",             icon: <UserCheck className="w-4 h-4" /> },
  { id: "classes",     label: "Classes",            icon: <BookOpen className="w-4 h-4" /> },
  { id: "users",       label: "All Users",          icon: <Users className="w-4 h-4" /> },
  { id: "upload",      label: "Mass Upload",        icon: <Upload className="w-4 h-4" /> },
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
        {tab === "requests"    && <RequestsTab />}
        {tab === "students"    && <StudentsTab />}
        {tab === "tutors"      && <TutorsTab />}
        {tab === "classes"     && <ClassesTab />}
        {tab === "users"       && <UsersTab />}
        {tab === "upload"      && <BulkUploadCard />}
      </main>
    </div>
  );
}
