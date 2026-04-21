import { useState, useEffect, Fragment } from "react";
import { AppLayout } from "@/components/layout";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import { BulkUploadCard } from "@/components/BulkUploadCard";
import { CalendarContent } from "@/pages/class-calendar";
import { SettingsContent } from "@/pages/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, LogOut, ClipboardList, Users, UserCheck,
  UserPlus, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp,
  BookOpen, AlertTriangle, Plus, CheckCircle2, Upload,
  Search, ChevronLeft, ChevronRight, CalendarDays, BarChart2, Settings as SettingsIcon,
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
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", type: "Group", days: "", time: "", room: "", maxCapacity: "8", teacherId: "" });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reassignRow, setReassignRow] = useState<number | null>(null);
  const [reassignTeacherId, setReassignTeacherId] = useState("");
  const [reassignError, setReassignError] = useState("");
  const [reassignSaving, setReassignSaving] = useState(false);
  const role = (localStorage.getItem("edutrack_user_role") || "").toLowerCase();
  const canReassign = role === "principal" || role === "developer" || role === "admin" || role === "staff";

  async function load() {
    setLoading(true); setError("");
    try {
      const [subjectData, tutorData] = await Promise.all([
        apiFetch("/subjects/with-capacity?status=active"),
        apiFetch("/principals/teachers"),
      ]);
      if (Array.isArray(subjectData)) setSubjects(await scopeSubjectsForViewer(subjectData));
      else setError("Could not load classes.");
      if (Array.isArray(tutorData)) setTutors(await scopeTutorsForViewer(tutorData));
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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

  async function handleReassignSubject(rowNum: number) {
    if (!reassignTeacherId) return;
    setReassignSaving(true);
    setReassignError("");
    try {
      const data = await apiFetch(`/subjects/${rowNum}/reassign`, {
        method: "POST",
        body: JSON.stringify({ teacherId: reassignTeacherId }),
      });
      if (data.ok) {
        setReassignRow(null);
        setReassignTeacherId("");
        await load();
      } else {
        setReassignError(data.error || "Failed to reassign.");
      }
    } catch {
      setReassignError("Connection error.");
    }
    setReassignSaving(false);
  }

  return (
    <div>
      <SectionHeader title={`Classes (${subjects.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {/* Weekday × Type summary */}
      {!loading && subjects.length > 0 && (() => {
        const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const normDay = (d: string) => {
          const x = (d || "").trim().toLowerCase().slice(0, 3);
          return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
        };
        const types = Array.from(new Set(subjects.map(s => (s.Type || "").trim() || "—"))).sort();
        const grid: Record<string, Record<string, number>> = {};
        const dayTotals: Record<string, number> = {};
        const typeTotals: Record<string, number> = {};
        let grandTotal = 0;
        for (const s of subjects) {
          const raw = String(s.Days || "").split(/[,/;|]/).map(d => d.trim()).filter(Boolean);
          const days = raw.length ? raw.map(normDay).filter(Boolean) : ["?"];
          const type = (s.Type || "").trim() || "—";
          for (const d of days) {
            grid[d] = grid[d] || {};
            grid[d][type] = (grid[d][type] || 0) + 1;
            dayTotals[d] = (dayTotals[d] || 0) + 1;
            typeTotals[type] = (typeTotals[type] || 0) + 1;
            grandTotal++;
          }
        }
        const knownDays = DAY_ORDER.filter(d => grid[d]);
        const otherDays = Object.keys(grid).filter(d => !DAY_ORDER.includes(d)).sort();
        const activeDays = [...knownDays, ...otherDays];
        if (!activeDays.length) return null;
        return (
          <div className="mb-4 rounded-md border overflow-x-auto inline-block max-w-full">
            <table className="text-xs">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left font-medium px-2 py-1">Type</th>
                  {activeDays.map(d => (
                    <th key={d} className="text-right font-medium px-2 py-1">{d}</th>
                  ))}
                  <th className="text-right font-medium px-2 py-1">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {types.map(t => (
                  <tr key={t}>
                    <td className="px-2 py-1 font-medium">{t}</td>
                    {activeDays.map(d => (
                      <td key={d} className="px-2 py-1 text-right text-muted-foreground">{grid[d]?.[t] || 0}</td>
                    ))}
                    <td className="px-2 py-1 text-right font-medium">{typeTotals[t] || 0}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 border-t">
                  <td className="px-2 py-1 font-semibold">Total</td>
                  {activeDays.map(d => (
                    <td key={d} className="px-2 py-1 text-right font-semibold">{dayTotals[d] || 0}</td>
                  ))}
                  <td className="px-2 py-1 text-right font-semibold">{grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

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
                    <th className="text-left font-medium px-3 py-2.5">Type</th>
                    <th className="text-left font-medium px-3 py-2.5">Teacher</th>
                    <th className="text-left font-medium px-3 py-2.5">Schedule</th>
                    <th className="text-left font-medium px-3 py-2.5">Students</th>
                    <th className="text-left font-medium px-3 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => {
                    const subjectId = s["SubjectID"] || s.SubjectID || "";
                    const rowNum = s._row || s.row || null;
                    const currentTeacher = s.TeacherName || s.Teachers || "Unassigned";
                    return (
                      <Fragment key={subjectId}>
                        <tr className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">{s.Name || s["Name"]}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{s.Type || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{currentTeacher}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {[s.Days, s.Time].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">
                          {s.enrolledNames || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {canReassign ? (
                            <Button size="sm" variant="outline" onClick={() => { setReassignRow(rowNum); setReassignTeacherId(s.TeacherID || ""); setReassignError(""); }}>
                              Reassign
                            </Button>
                          ) : "—"}
                        </td>
                        </tr>
                        {reassignRow === rowNum && (
                          <tr className="bg-muted/20">
                            <td colSpan={6} className="px-3 pb-2">
                              <div className="flex justify-end">
                                <div className="relative w-full max-w-md -mt-1">
                                  <div className="absolute right-0 bottom-full mb-2 w-full rounded-md border bg-background shadow-lg z-20 p-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="text-xs font-medium text-muted-foreground">Reassign to</div>
                                      <select
                                        className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                                        value={reassignTeacherId}
                                        onChange={e => setReassignTeacherId(e.target.value)}
                                      >
                                        <option value="">Select teacher</option>
                                        {tutors.map(t => (
                                          <option key={t.UserID} value={t.UserID}>
                                            {t.Name}{t.Specialty ? ` — ${t.Specialty}` : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleReassignSubject(rowNum)} disabled={reassignSaving || !reassignTeacherId}>
                                          {reassignSaving ? "Saving…" : "Save"}
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => { setReassignRow(null); setReassignTeacherId(""); setReassignError(""); }}>
                                          Cancel
                                        </Button>
                                        {reassignError && <span className="text-xs text-red-500 self-center">{reassignError}</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
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

type Tab = "calendar" | "requests" | "students" | "tutors" | "users" | "classes" | "student-attendance" | "tutor-attendance" | "upload" | "analysis" | "settings";


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
    "New Enrollment":       "bg-blue-100 text-blue-800 border-blue-200",
    "Late Cancellation Fee": "bg-amber-100 text-amber-800 border-amber-200",
    "Completed":            "bg-gray-100 text-gray-600 border-gray-200",
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
  const [assigningRow, setAssigningRow]   = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [assignSaving, setAssignSaving]   = useState(false);
  const [assignError, setAssignError]     = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [enrollData, lateData, subjectData] = await Promise.all([
        apiFetch("/enrollment-requests"),
        apiFetch("/enrollments?status=inactive&fee=not+waived"),
        apiFetch("/subjects?status=active"),
      ]);
      if (Array.isArray(enrollData)) setEnrollRows(enrollData);
      else setError("Could not load enrollment requests.");
      if (Array.isArray(lateData)) setLateRows(lateData);
      if (Array.isArray(subjectData)) setSubjects(subjectData);
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function actEnroll(row: any, action: "approve" | "reject" | "mark-paid") {
    setActing(`e-${row._row}`);
    try {
      await apiFetch(`/enrollment-requests/${row._row}/${action}`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch {}
    setActing(null);
  }

  async function actLate(row: any) {
    setActing(`l-${row._row}`);
    try {
      await apiFetch(`/enrollments/${row._row}/waive-fee`, { method: "POST", body: JSON.stringify({}) });
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

  const allRows = [
    ...enrollRows.map(r => ({ ...r, _src: "enrollment" as const })),
    ...lateRows.map(r => ({ ...r, _src: "fee-waiver" as const })),
  ];

  function isRowDone(row: typeof allRows[0]): boolean {
    if (row._src === "enrollment") {
      const s = (row["Status"] || "").toLowerCase();
      return s === "active" || s === "rejected";
    }
    // fee-waiver rows: done when fee is waived
    return (row["Fee"] || "").toLowerCase() === "waived";
  }

  // Only show rows that still need action
  const filtered = allRows.filter(r => !isRowDone(r));

  const isEmpty = filtered.length === 0;

  return (
    <div>
      <SectionHeader title={`Requests (${filtered.length})`} onRefresh={load} loading={loading} />
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && isEmpty && <p className="text-sm text-muted-foreground">No pending requests — all caught up!</p>}

      {!loading && !isEmpty && (
        <>
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
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">
                    No pending requests — all caught up!
                  </td></tr>
                )}
                {filtered.map(row => {
                  const key = `${row._src}-${row._row}`;
                  const status = (row["Status"] || "").toLowerCase();
                  const isDone = isRowDone(row);
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
                          <RequestTypeBadge type={row._src === "enrollment" ? "New Enrollment" : "Late Cancellation Fee"} />
                        </td>
                        {/* Student — name only, no parent ID */}
                        <td className="px-3 py-2.5 align-middle">
                        <div className="font-medium leading-tight">{row["Student Name"] || row["Name"] || row["Full Name"] || row["UserID"] || "Unknown"}</div>
                          {/* Details inline on small screens */}
                          <div className="md:hidden mt-0.5">{details}</div>
                        </td>
                        {/* Details (desktop) */}
                        <td className="px-3 py-2.5 align-middle hidden md:table-cell">{details}</td>
                        {/* Status */}
                        <td className="px-3 py-2.5 align-top">
                          {row._src === "enrollment" ? (
                            <StatusBadge status={row["Status"] || "Pending"} />
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status="Inactive" />
                              <span className="text-xs text-amber-700 font-medium">Fee: Not Waived</span>
                            </div>
                          )}
                        </td>
                        {/* Actions — stacked vertically on mobile, horizontal on sm+ */}
                        <td className="px-3 py-3 align-middle">
                          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                            {row._src === "enrollment" && !isDone && (
                              <>
                                {noClass && (
                                  <button
                                    onClick={() => { setAssigningRow(isAssigning ? null : row._row); setSelectedClass(""); setAssignError(""); }}
                                    className="text-xs px-3 py-2 rounded-md border border-orange-300 text-orange-700 hover:bg-orange-50 font-medium flex items-center justify-center gap-1 min-h-[36px] w-full sm:w-auto">
                                    <Plus className="w-3.5 h-3.5" /> Assign Class
                                  </button>
                                )}
                                {status !== "active" && status !== "rejected" && (
                                  <Button size="sm" className="h-9 sm:h-8 text-sm sm:text-xs gap-1 w-full sm:w-auto" disabled={isActingNow} onClick={() => actEnroll(row, "mark-paid")}>
                                    <CheckCircle className="w-3.5 h-3.5" /> App Fee / App Paid
                                  </Button>
                                )}
                              </>
                            )}
                            {row._src === "fee-waiver" && !isDone && (
                              <Button size="sm" variant="outline" className="h-9 sm:h-8 text-sm sm:text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50 w-full sm:w-auto" disabled={isActingNow} onClick={() => actLate(row)}>
                                <CheckCircle className="w-3.5 h-3.5" /> Waive Fee
                              </Button>
                            )}
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
                                {subjects.map(s => {
                                  const day = s["Days"] ? ` — ${s["Days"]}` : "";
                                  const time = s["Time"] ? ` ${s["Time"]}` : "";
                                  return (
                                    <option key={s["SubjectID"]} value={s["SubjectID"]}>
                                      {s["Name"]}{day}{time} ({s["Type"]})
                                    </option>
                                  );
                                })}
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

      {/* Contact Directory — moved here from the public Calendar page so only
          the principal sees everyone's email addresses. */}
      <ContactDirectorySection />
    </div>
  );
}

// ─── Contact Directory (Principal-only) ────────────────────────────────────
function ContactDirectorySection() {
  const [data, setData] = useState<{ days: any[]; principalEmail: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch("/schedule/calendar?weeks=2");
      setData(d);
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // One row per (className, day, time) — dedupe across the date range.
  const rows: Array<{ className: string; day: string; time: string; teacherName: string; teacherEmail: string; students: { name: string; email: string }[] }> = [];
  const seen = new Set<string>();
  const SHORT: Record<string, string> = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
  for (const day of (data?.days || [])) {
    const short = SHORT[day.dayName] || day.dayName.slice(0, 3);
    for (const slot of (day.slots || [])) {
      const key = `${slot.className}||${short}||${slot.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        className: slot.className, day: short, time: slot.time,
        teacherName: slot.teacherName, teacherEmail: slot.teacherEmail,
        students: slot.students || [],
      });
    }
  }
  const DAY_ORDER: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  rows.sort((a, b) => a.className.localeCompare(b.className) || (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99));
  const principalEmail = data?.principalEmail || "";

  return (
    <div className="mt-8">
      <SectionHeader title="Contact Directory" onRefresh={load} loading={loading} />
      <p className="text-xs text-muted-foreground mb-3">
        Only visible to you. Click any email to open your mail client. Use <strong>Email All</strong> to message the tutor, principal and every enrolled student in one click.
      </p>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No active classes scheduled in the next 2 weeks.</p>}
      {!loading && rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Class</th>
                <th className="text-left px-2 py-2 font-medium">Day</th>
                <th className="text-left px-2 py-2 font-medium">Time</th>
                <th className="text-left px-2 py-2 font-medium">Tutor</th>
                <th className="text-left px-2 py-2 font-medium">Students</th>
                <th className="text-left px-2 py-2 font-medium">Email All</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => {
                const subject = encodeURIComponent(`Re: ${r.className} class (${r.day})`);
                const teacherMailto = r.teacherEmail ? `mailto:${r.teacherEmail}?subject=${subject}` : null;
                const all = [r.teacherEmail, principalEmail, ...r.students.map(s => s.email).filter(Boolean)].filter(Boolean);
                const uniq = [...new Set(all)];
                const to = uniq[0] || ""; const cc = uniq.slice(1).join(",");
                const allHref = to ? `mailto:${to}${cc ? `?cc=${encodeURIComponent(cc)}` : ""}&subject=${subject}` : null;
                return (
                  <tr key={i} className="align-top hover:bg-muted/30">
                    <td className="px-2 py-2 font-medium">{r.className}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.day}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.time || "—"}</td>
                    <td className="px-2 py-2">
                      {teacherMailto
                        ? <a href={teacherMailto} className="text-blue-600 hover:underline">{r.teacherName || "Tutor"}</a>
                        : <span className="text-muted-foreground">{r.teacherName || "—"}</span>}
                    </td>
                    <td className="px-2 py-2">
                      {r.students.length === 0
                        ? <span className="text-muted-foreground">—</span>
                        : <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {r.students.map((s, j) => s.email
                              ? <a key={j} href={`mailto:${s.email}?subject=${subject}`} className="text-blue-600 hover:underline">{s.name}</a>
                              : <span key={j} className="text-muted-foreground">{s.name}</span>
                            )}
                          </div>}
                    </td>
                    <td className="px-2 py-2">
                      {allHref
                        ? <a href={allHref} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700">Email All</a>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  const [studentClasses, setStudentClasses] = useState<Record<string, string>>({});
  const [subjectObjects,  setSubjectObjects]  = useState<any[]>([]);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page,         setPage]         = useState(1);

  // Build "Subject (Day)" label from an enrollment row. The new schema has one
  // Subject row per (Class, Day), with ClassID like "SUB-ENG-TUE" — the day
  // suffix is the source of truth for which weekday the enrolment belongs to.
  function enrollmentLabel(enr: any): string {
    const name = enr["Class Name"] || enr.ClassID || enr["ClassID"] || "";
    const id = String(enr.ClassID || enr["ClassID"] || "");
    const dayMap: Record<string, string> = {
      MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
    };
    const m = id.match(/-([A-Z]{3})$/);
    const day = m ? dayMap[m[1]] : "";
    return day ? `${name} (${day})` : name;
  }

  async function loadStudentClasses(userId: string) {
    try {
      const data = await apiFetch(`/enrollments?userId=${encodeURIComponent(userId)}&status=active`);
      if (Array.isArray(data)) {
        const classNames = data.map(enrollmentLabel).filter(Boolean).join(", ");
        setStudentClasses(prev => ({ ...prev, [userId]: classNames || "—" }));
      }
    } catch { /* ignore */ }
  }

  async function loadAllStudentClasses() {
    try {
      const data = await apiFetch("/enrollments");
      if (!Array.isArray(data)) return;
      const grouped = data.reduce((acc: Record<string, string[]>, enr: any) => {
        const userId = enr.UserID || enr["UserID"];
        if (!userId) return acc;
        const status = String(enr.Status || "").toLowerCase();
        if (status && status !== "active") return acc;
        const label = enrollmentLabel(enr);
        if (!label) return acc;
        if (!acc[userId]) acc[userId] = [];
        acc[userId].push(label);
        return acc;
      }, {});
      const mapped = Object.fromEntries(
        Object.entries(grouped).map(([userId, names]) => [userId, names.join(", ")])
      );
      setStudentClasses(mapped);
    } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [userData, subjectData] = await Promise.all([
        apiFetch("/principals/students"),
        apiFetch("/subjects?status=active"),
      ]);
      if (Array.isArray(userData)) {
        const scoped = await scopeStudentsForViewer(userData);
        setStudents(scoped);
      }
      else setError("Could not load students.");
      if (Array.isArray(subjectData)) {
        // Build labels that include Day + Time so each (Class, Day) row is
        // distinguishable in the Add-Student multiselect (the new schema has
        // one Subject row per day).
        const labels = subjectData.map((s: any) => {
          const name = s["Name"] || s.Name;
          if (!name) return "";
          const day = s["Days"] ? ` — ${s["Days"]}` : "";
          const time = s["Time"] ? ` ${s["Time"]}` : "";
          const type = s["Type"] ? ` (${s["Type"]})` : "";
          return `${name}${day}${time}${type}`;
        }).filter(Boolean);
        setSubjects(labels);
        setSubjectObjects(subjectData);
      }
      await loadAllStudentClasses();
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
                {field("Parent Email", <Input type="email" placeholder="parent@email.com" value={form.parentEmail} onChange={e => setForm({ ...form, parentEmail: e.target.value })} />)}
                {field("Parent Name", <Input placeholder="Full name" value={form.parentName} onChange={e => setForm({ ...form, parentName: e.target.value })} />)}
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
          const matchesSearch = !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.currentSchool?.toLowerCase().includes(q) || s.parentEmail?.toLowerCase().includes(q);
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
                      <th className="text-left font-medium px-3 py-2.5">Email</th>
                      <th className="text-left font-medium px-3 py-2.5">Grade</th>
                      <th className="text-left font-medium px-3 py-2.5">School</th>
                      <th className="text-left font-medium px-3 py-2.5">Parent Email</th>
                      <th className="text-left font-medium px-3 py-2.5">Classes</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paged.map((s) => {
                      const classes = studentClasses[s.userId] || s.ClassID || s.classId || s.classes || s.subjects || s.enrolledClasses || "—";
                      return (
                        <Fragment key={s.userId}>
                          <tr className="hover:bg-muted/20">
                            <td className="px-3 py-2.5 font-medium">{s.name || s.displayName || s.email || "Unknown"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{s.email || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{s.currentGrade ? s.currentGrade.toString().replace(/[^\d]/g, "") || s.currentGrade : "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{s.currentSchool || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{s.parentEmail || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{classes}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                          </tr>
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
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "tutor", subjects: "", specialty: "", zoomLink: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [addedInfo, setAddedInfo] = useState<{ name: string; teacherId: string; userId: string } | null>(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page,         setPage]         = useState(1);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [tutorData, subjData] = await Promise.all([
        apiFetch("/principals/teachers"),
        apiFetch("/subjects/with-capacity?status=active"),
      ]);
      if (Array.isArray(tutorData)) setTutors(await scopeTutorsForViewer(tutorData));
      else setError("Could not load tutors.");
      if (Array.isArray(subjData)) setSubjects(await scopeSubjectsForViewer(subjData));
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const normDay = (d: string) => {
    const x = (d || "").trim().toLowerCase().slice(0, 3);
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
  };
  function tutorSchedule(tutor: any) {
    const tid = tutor.UserID || tutor.TeacherID || "";
    const mine = subjects.filter(s => (s.TeacherID || "") === tid);
    const days = new Set<string>();
    const types = new Set<string>();
    const names = new Set<string>();
    for (const s of mine) {
      String(s.Days || "").split(/[,/;|]/).map(normDay).filter(Boolean).forEach(d => days.add(d));
      const t = (s.Type || "").trim();
      if (t) types.add(t);
      const n = (s.Name || "").trim();
      if (n) names.add(n);
    }
    const orderedDays = DAY_ORDER.filter(d => days.has(d));
    const otherDays = Array.from(days).filter(d => !DAY_ORDER.includes(d)).sort();
    return {
      days: [...orderedDays, ...otherDays].join(", ") || "—",
      types: Array.from(types).sort().join(", ") || "—",
      classes: Array.from(names).sort().join(", ") || "—",
    };
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true);
    setFormError("");
    try {
      const data = await apiFetch("/principals/add-teacher", { method: "POST", body: JSON.stringify(form) });
      if (data.ok) {
        setAddedInfo({ name: form.name.trim(), teacherId: data.teacherId || "", userId: data.userId || "" });
        setForm({ name: "", email: "", role: "tutor", subjects: "", specialty: "", zoomLink: "" });
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

      {addedInfo && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong>{addedInfo.name}</strong> added.
              {addedInfo.teacherId && <> TeacherID: <code className="text-xs bg-white px-1.5 py-0.5 rounded border">{addedInfo.teacherId}</code></>}
              <div className="mt-1 text-green-800 text-xs">
                Next step: open the <strong>Classes</strong> tab and use the <strong>Reassign</strong> button to move existing classes to this new tutor. You can then deactivate any sample tutors.
              </div>
            </div>
            <button onClick={() => setAddedInfo(null)} className="text-green-700 hover:text-green-900 font-medium shrink-0 text-xs">Dismiss</button>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Add New Tutor</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium mb-1 block">Name *</label>
                  <Input placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="text-xs font-medium mb-1 block">Email</label>
                  <Input type="email" placeholder="staff@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="text-xs font-medium mb-1 block">Role *</label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="tutor">Tutor</option>
                    <option value="principal">Principal</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
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
                      <th className="text-left font-medium px-3 py-2.5">Email</th>
                      <th className="text-left font-medium px-3 py-2.5">Classes Taught</th>
                      <th className="text-left font-medium px-3 py-2.5">Type</th>
                      <th className="text-left font-medium px-3 py-2.5">Days</th>
                      <th className="text-left font-medium px-3 py-2.5">Zoom Link</th>
                      <th className="text-left font-medium px-3 py-2.5">Specialty</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paged.map((t) => {
                      const sched = tutorSchedule(t);
                      return (
                      <tr key={t.UserID} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">{t.Name || t.name || t.Email || "Unknown"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.Email || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{sched.classes}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{sched.types}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{sched.days}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {t["Zoom Link"] ? (
                            <a href={t["Zoom Link"]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Zoom</a>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.Specialty || "—"}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={t.Status} /></td>
                      </tr>
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
      {!loading && tutors.length === 0 && <p className="text-sm text-muted-foreground">No tutors yet.</p>}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ userId: string; message: string; classes?: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/users");
      if (Array.isArray(data)) setUsers(await scopeUsersForViewer(data));
      else setError("Could not load users.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(user: any) {
    setActing(user.userId);
    setActionError(null);
    const endpoint = user.status?.toLowerCase() === "active" ? "/users/deactivate" : "/users/reactivate";
    try {
      const result = await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ userId: user.userId }) });
      if (result?.error) {
        setActionError({ userId: user.userId, message: result.error, classes: result.classes });
      } else {
        await load();
      }
    } catch { setActionError({ userId: user.userId, message: "Connection error." }); }
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
                <th className="text-left font-medium px-3 py-2.5">Email</th>
                <th className="text-left font-medium px-3 py-2.5">Role</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((u) => (
                <Fragment key={u.userId}>
                  <tr className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{u.name || u.displayName || u.email || "Unknown"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{u.email || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground capitalize">{u.role}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={u.status} /></td>
                    <td className="px-3 py-2.5">
                      {isElevatedRole(getViewerRole()) && u.status?.toLowerCase() === "active" && (
                        <Button
                          size="sm" variant="outline"
                          disabled={acting === u.userId}
                          onClick={() => toggleStatus(u)}
                          className="text-xs h-7 px-2 bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                        >
                          {acting === u.userId ? "…" : "Deactivate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {actionError?.userId === u.userId && (
                    <tr className="bg-amber-50">
                      <td colSpan={5} className="px-3 py-2 text-xs text-amber-900">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong>Cannot deactivate.</strong> {actionError.message}
                            {actionError.classes && actionError.classes.length > 0 && (
                              <div className="mt-1 text-amber-800">Classes: {actionError.classes.join(", ")}</div>
                            )}
                          </div>
                          <button onClick={() => setActionError(null)} className="text-amber-700 hover:text-amber-900 font-medium shrink-0">Dismiss</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Attendance Tabs ──────────────────────────────────────────────────────────
function MonthPicker({ month, onChange, label, monthLabel, loading, onRefresh }: {
  month: string; onChange: (m: string) => void; label: string;
  monthLabel: string; loading: boolean; onRefresh: () => void;
}) {
  return (
    <>
      <SectionHeader title={label} onRefresh={onRefresh} loading={loading} />
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Month</span>
        <input
          type="month" value={month} onChange={e => onChange(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
        />
        {monthLabel && <span className="text-sm text-muted-foreground">{monthLabel}</span>}
      </div>
    </>
  );
}

// ─── Student Attendance Tab ────────────────────────────────────────────────────
function StudentAttendanceTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth]   = useState(defaultMonth);
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  async function load(m: string) {
    setLoading(true); setError("");
    try {
      const result = await apiFetch(`/attendance/summary?month=${encodeURIComponent(m)}`);
      if (result.error) setError(result.error);
      else setData(await scopeAttendanceSummary(result));
    } catch { setError("Connection error."); }
    setLoading(false);
  }
  useEffect(() => { load(month); }, [month]);

  const monthLabel = month ? new Date(`${month}-01`).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

  const [cancellations, setCancellations] = useState<any[]>([]);
  useEffect(() => { if (data?.cancellations) setCancellations(data.cancellations); }, [data]);

  async function toggleWithin24hrs(attendanceId: string, current: string) {
    const next = current.toLowerCase() === "no" ? "Yes" : "No";
    setCancellations(prev => prev.map(c => c.attendanceId === attendanceId ? { ...c, within24Hrs: next } : c));
    try {
      await apiFetch("/attendance/within24hrs", { method: "PATCH", body: JSON.stringify({ attendanceId, within24Hrs: next }) });
    } catch {
      setCancellations(prev => prev.map(c => c.attendanceId === attendanceId ? { ...c, within24Hrs: current } : c));
    }
  }

  function toggleStudent(id: string) {
    setExpandedStudents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const students: any[]  = data?.students ?? [];
  const cancelCount      = cancellations.length;
  const within24Yes      = cancellations.filter(c => c.within24Hrs?.toLowerCase() !== "no").length;
  const within24No       = cancellations.filter(c => c.within24Hrs?.toLowerCase() === "no").length;
  const totalPresent     = students.reduce((n: number, s: any) => n + s.classes.reduce((m: number, c: any) => m + c.present, 0), 0);
  const totalAbsent      = students.reduce((n: number, s: any) => n + s.classes.reduce((m: number, c: any) => m + c.absent, 0), 0);
  const totalAttended    = students.reduce((n: number, s: any) => n + s.totalAttended, 0);

  return (
    <div>
      <MonthPicker month={month} onChange={m => { setMonth(m); }} label="Student Attendance" monthLabel={monthLabel} loading={loading} onRefresh={() => load(month)} />
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      {!loading && data && students.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No student attendance records for {monthLabel}.</p>
      )}

      {/* ── Student Billing Summary ── */}
      {students.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Student Billing Summary
            <span className="ml-2 text-xs font-normal normal-case">(click a row to see class breakdown)</span>
          </h3>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5 w-6" />
                  <th className="text-left font-medium px-3 py-2.5 w-32">Student</th>
                  <th className="text-center font-medium px-3 py-2.5 text-green-700 w-20">Present</th>
                  <th className="text-center font-medium px-3 py-2.5 text-red-700 w-20">Absent</th>
                  <th className="text-center font-medium px-3 py-2.5 text-amber-700 w-24">Cancelled</th>
                  <th className="text-center font-medium px-3 py-2.5 bg-primary/5 w-28">Sessions Attended</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any) => {
                  const isOpen     = expandedStudents.has(s.studentId);
                  const sPresent   = s.classes.reduce((n: number, c: any) => n + c.present, 0);
                  const sAbsent    = s.classes.reduce((n: number, c: any) => n + c.absent, 0);
                  const sCancelled = cancellations.filter((c: any) => c.userId === s.studentId);
                  return (
                    <Fragment key={s.studentId}>
                      <tr className="border-t hover:bg-muted/40 cursor-pointer select-none" onClick={() => toggleStudent(s.studentId)}>
                        <td className="px-2 py-2.5 text-muted-foreground text-center">
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{s.studentName}</td>
                        <td className="px-3 py-2.5 text-center text-green-700 font-medium">{sPresent}</td>
                        <td className="px-3 py-2.5 text-center text-red-700">{sAbsent}</td>
                        <td className="px-3 py-2.5 text-center text-amber-700 font-medium">{sCancelled.length || "—"}</td>
                        <td className="px-3 py-2.5 text-center font-bold bg-primary/5">
                          {s.totalAttended}
                          <span className="text-xs font-normal text-muted-foreground"> / {s.classes.reduce((n: number, c: any) => n + c.totalSessions, 0)}</span>
                        </td>
                      </tr>
                      {isOpen && s.classes.map((c: any) => {
                        const classCancelled = cancellations.filter((x: any) => x.userId === s.studentId && x.classId === c.classId);
                        const w24 = classCancelled.filter((x: any) => x.within24Hrs?.toLowerCase() !== "no").length;
                        return (
                          <tr key={`${s.studentId}-${c.classId}`} className="border-t bg-muted/20 text-xs">
                            <td className="px-2 py-1.5" />
                            <td className="px-3 py-1.5 pl-7 text-muted-foreground">
                              <span className="font-medium text-foreground">{c.className}</span>
                              <span className="ml-1.5 text-muted-foreground hidden sm:inline">— {c.teacherName}</span>
                            </td>
                            <td className="px-3 py-1.5 text-center text-green-700">{c.present}</td>
                            <td className="px-3 py-1.5 text-center text-red-700">{c.absent}</td>
                            <td className="px-3 py-1.5 text-center text-amber-700">
                              {classCancelled.length > 0 ? (
                                <span>{classCancelled.length}{w24 > 0 && <span className="ml-1 text-amber-500">({w24} &lt;24h)</span>}</span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center font-semibold bg-primary/5">
                              {c.attended}<span className="text-xs font-normal text-muted-foreground"> / {c.totalSessions}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2">
                <tr>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Total</td>
                  <td className="px-3 py-2 text-center font-semibold text-green-700">{totalPresent}</td>
                  <td className="px-3 py-2 text-center font-semibold text-red-700">{totalAbsent}</td>
                  <td className="px-3 py-2 text-center font-semibold text-amber-700">{cancelCount || "—"}</td>
                  <td className="px-3 py-2 text-center font-bold bg-primary/10">{totalAttended}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Cancellations ── */}
      {data && (
        <div className="mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cancellations</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-muted/40 text-sm">
              <span className="font-semibold">{cancelCount}</span>
              <span className="text-muted-foreground">total cancelled</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-amber-50 text-sm">
              <span className="font-semibold text-amber-700">{within24Yes}</span>
              <span className="text-amber-700">within 24 hrs</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-blue-50 text-sm">
              <span className="font-semibold text-blue-700">{within24No}</span>
              <span className="text-blue-700">not within 24 hrs</span>
            </div>
          </div>
          {cancellations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cancellations recorded for {monthLabel}.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5">Student</th>
                    <th className="text-left font-medium px-3 py-2.5">Class</th>
                    <th className="text-left font-medium px-3 py-2.5">Teacher</th>
                    <th className="text-left font-medium px-3 py-2.5">Date</th>
                    <th className="text-center font-medium px-3 py-2.5 w-32">Within 24 hrs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cancellations.map((c: any) => (
                    <tr key={c.attendanceId} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-medium">{c.studentName || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.className || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.teacherName || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.sessionDate || "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleWithin24hrs(c.attendanceId, c.within24Hrs)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            c.within24Hrs?.toLowerCase() === "no"
                              ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                              : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          }`}
                        >
                          {c.within24Hrs?.toLowerCase() === "no" ? "No" : "Yes"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tutor Attendance Tab ──────────────────────────────────────────────────────
function TutorAttendanceTab() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth]   = useState(defaultMonth);
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [expandedTutors, setExpandedTutors] = useState<Set<string>>(new Set());

  async function load(m: string) {
    setLoading(true); setError("");
    try {
      const result = await apiFetch(`/attendance/summary?month=${encodeURIComponent(m)}`);
      if (result.error) setError(result.error);
      else setData(await scopeAttendanceSummary(result));
    } catch { setError("Connection error."); }
    setLoading(false);
  }
  useEffect(() => { load(month); }, [month]);

  const monthLabel = month ? new Date(`${month}-01`).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : "";

  const [tutorAttendance, setTutorAttendance] = useState<any[]>([]);
  useEffect(() => { if (data?.tutorAttendance) setTutorAttendance(data.tutorAttendance); }, [data]);

  async function toggleTutorStatus(attendanceId: string, current: string) {
    const next = current.toLowerCase() === "absent" ? "Present" : "Absent";
    setTutorAttendance(prev => prev.map(r => r.attendanceId === attendanceId ? { ...r, status: next } : r));
    try {
      await apiFetch("/attendance/tutor-status", { method: "PATCH", body: JSON.stringify({ attendanceId, status: next }) });
    } catch {
      setTutorAttendance(prev => prev.map(r => r.attendanceId === attendanceId ? { ...r, status: current } : r));
    }
  }

  function toggleTutor(id: string) {
    setExpandedTutors(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const tutors: any[] = data?.tutors ?? [];
  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const summarySubjects = Array.from(
    new Set(
      tutorAttendance
        .map((r: any) => String(r.className || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const summaryBySubject = summarySubjects.map(subject => {
    const byDay: Record<string, number> = {};
    for (const d of DAY_ORDER) byDay[d] = 0;
    for (const r of tutorAttendance) {
      if (String(r.className || "").trim() !== subject) continue;
      const dayIdx = r.sessionDate ? new Date(`${r.sessionDate}T00:00:00`).getDay() : NaN;
      if (Number.isNaN(dayIdx)) continue;
      const day = DAY_ORDER[(dayIdx + 6) % 7];
      byDay[day] = (byDay[day] || 0) + 1;
    }
    return { label: subject, byDay };
  });

  return (
    <div>
      <MonthPicker month={month} onChange={m => { setMonth(m); }} label="Tutor Attendance" monthLabel={monthLabel} loading={loading} onRefresh={() => load(month)} />
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      {!loading && data && tutors.length === 0 && tutorAttendance.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No tutor records for {monthLabel}.</p>
      )}

      {/* ── Tutor Payment Summary (top) ── */}
      {tutors.length > 0 && (() => {
        // Build teacherId → weekday → count from individual session rows
        const byDay: Record<string, Record<string, number>> = {};
        for (const r of tutorAttendance) {
          if (!r.teacherName) continue;
          const [yr, mo, dy] = r.sessionDate.split("-").map(Number);
          const day = DAY_ORDER[new Date(yr, mo - 1, dy).getDay() === 0 ? 6 : new Date(yr, mo - 1, dy).getDay() - 1];
          const key = r.teacherName;
          byDay[key] ??= {};
          byDay[key][day] = (byDay[key][day] ?? 0) + 1;
        }
        return (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Tutor Payment Summary
            <span className="ml-2 text-xs font-normal normal-case">(click a row to see day breakdown)</span>
          </h3>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[300px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5 w-6" />
                  <th className="text-left font-medium px-3 py-2.5">Tutor</th>
                  <th className="text-center font-medium px-3 py-2.5 bg-primary/5 w-32">Sessions Taught</th>
                </tr>
              </thead>
              <tbody>
                {tutors.map((t: any) => {
                  const isOpen = expandedTutors.has(t.teacherId);
                  const days = DAY_ORDER.filter(d => byDay[t.teacherName]?.[d]);
                  return (
                    <Fragment key={t.teacherId}>
                      <tr className="border-t hover:bg-muted/40 cursor-pointer select-none" onClick={() => toggleTutor(t.teacherId)}>
                        <td className="px-2 py-2.5 text-muted-foreground text-center">
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{t.teacherName}</td>
                        <td className="px-3 py-2.5 text-center font-bold bg-primary/5">{t.totalSessions}</td>
                      </tr>
                      {isOpen && days.map(day => (
                        <tr key={`${t.teacherId}-${day}`} className="border-t bg-muted/20 text-xs">
                          <td className="px-2 py-1.5" />
                          <td className="px-3 py-1.5 pl-7 font-medium text-foreground">{day}</td>
                          <td className="px-3 py-1.5 text-center font-semibold bg-primary/5">{byDay[t.teacherName][day]}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2">
                <tr>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Total</td>
                  <td className="px-3 py-2 text-center font-bold bg-primary/10">
                    {tutors.reduce((n: number, t: any) => n + t.totalSessions, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        );
      })()}

      {tutorAttendance.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Attendance Summary by Subject
          </h3>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5">Subject</th>
                  {DAY_ORDER.map(day => (
                    <th key={day} className="text-center font-medium px-3 py-2.5">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryBySubject.map(row => (
                  <tr key={row.label} className="border-t">
                    <td className="px-3 py-2.5 font-semibold">{row.label}</td>
                    {DAY_ORDER.map(day => (
                      <td key={day} className="px-3 py-2.5 text-center font-medium">{row.byDay[day] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tutor Attendance Detail ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Session Detail</h3>
        {tutorAttendance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No session records for {monthLabel}.</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5">Tutor</th>
                  <th className="text-left font-medium px-3 py-2.5">Class</th>
                  <th className="text-left font-medium px-3 py-2.5">Date</th>
                  <th className="text-center font-medium px-3 py-2.5 w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tutorAttendance.map((r: any) => (
                  <tr key={r.attendanceId} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{r.teacherName || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.className || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.sessionDate || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => toggleTutorStatus(r.attendanceId, r.status)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          r.status?.toLowerCase() === "absent"
                            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        }`}
                      >
                        {r.status?.toLowerCase() === "absent" ? "Absent" : "Present"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analysis Tab ─────────────────────────────────────────────────────────────

type AnalysisData = {
  totals: { subjects: number; teachers: number; students: number; hoursPerWeek: number };
  periodTotals: { sessions: number; attendances: number; absences: number; attendancePct: number | null };
  bySubject: { subjectId: string; name: string; type: string; teacherName: string; days: string[]; sessionsPerWeek: number; durationHours: number; hoursPerWeek: number; students: number; maxCapacity: number; fillPct: number }[];
  byTeacher: { teacherName: string; classCount: number; students: number; hoursPerWeek: number; classes: string[]; classBreakdown: { name: string; day: string; students: number }[] }[];
  byWeekday: { day: string; classCount: number; students: number; hoursTotal: number }[];
  byMonth: { yyyyMM: string; label: string; sessions: number; studentAttendances: number; absences: number }[];
};

function MiniBar({ pct, color = "bg-primary" }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

const DAY_COLORS: Record<string, { bg: string; text: string; chip: string }> = {
  Monday:    { bg: "bg-blue-500",    text: "text-blue-700",    chip: "bg-blue-50 text-blue-700 border-blue-200" },
  Tuesday:   { bg: "bg-violet-500",  text: "text-violet-700",  chip: "bg-violet-50 text-violet-700 border-violet-200" },
  Wednesday: { bg: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Thursday:  { bg: "bg-amber-500",   text: "text-amber-700",   chip: "bg-amber-50 text-amber-700 border-amber-200" },
  Friday:    { bg: "bg-pink-500",    text: "text-pink-700",    chip: "bg-pink-50 text-pink-700 border-pink-200" },
  Saturday:  { bg: "bg-cyan-500",    text: "text-cyan-700",    chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  Sunday:    { bg: "bg-gray-500",    text: "text-gray-700",    chip: "bg-gray-50 text-gray-700 border-gray-200" },
};
const DAY_ORDER_LOAD = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function StackedDayBar({ items, total }: {
  items: { name: string; day: string; students: number }[];
  total: number;
}) {
  const filtered = items.filter(it => it.students > 0);
  const sorted = [...filtered].sort((a, b) =>
    DAY_ORDER_LOAD.indexOf(a.day) - DAY_ORDER_LOAD.indexOf(b.day)
  );
  if (sorted.length === 0 || total === 0) {
    return <div className="w-full bg-muted rounded-full h-2 mt-1" />;
  }
  const usedDays = Array.from(new Set(sorted.map(s => s.day)));
  return (
    <div>
      <div className="w-full flex h-2 rounded-full overflow-hidden bg-muted mt-1">
        {sorted.map((it, i) => {
          const pct = (it.students / total) * 100;
          const c = DAY_COLORS[it.day] || DAY_COLORS.Sunday;
          return (
            <div
              key={`${it.name}-${it.day}-${i}`}
              className={`${c.bg} h-2 hover:opacity-80 transition-opacity cursor-help`}
              style={{ width: `${pct}%` }}
              title={`${it.name} — ${it.day.slice(0,3)}: ${it.students} student${it.students === 1 ? "" : "s"}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {usedDays.map(day => {
          const c = DAY_COLORS[day] || DAY_COLORS.Sunday;
          const dayItems = sorted.filter(s => s.day === day);
          const dayTotal = dayItems.reduce((n, s) => n + s.students, 0);
          const tip = dayItems.map(s => `${s.name}: ${s.students}`).join("\n");
          return (
            <span
              key={day}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${c.chip} cursor-help`}
              title={tip}
            >
              {day.slice(0,3)} {dayTotal}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AnalysisTab() {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const janThisYear = `${now.getFullYear()}-01`;

  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(janThisYear);
  const [to, setTo] = useState(thisMonth);

  async function load(f = from, t = to) {
    const sid = sheetId();
    if (!sid) { setError("No sheet linked."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ sheetId: sid });
      if (f) params.set("from", f);
      if (t) params.set("to", t);
      const res = await fetch(apiUrl(`/analysis?${params.toString()}`));
      const json = await res.json();
      if (json.error) { setError(json.error); } else { setData(await scopeAnalysisForViewer(json)); }
    } catch { setError("Could not load analysis data."); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading analysis…
    </div>
  );
  if (error) return <p className="text-red-500 text-sm py-6">{error}</p>;
  if (!data) return null;

  const { totals, periodTotals, bySubject, byTeacher, byWeekday, byMonth } = data;
  const maxStudents        = Math.max(...bySubject.map(s => s.students), 1);
  const maxTeacherStudents = Math.max(...byTeacher.map(t => t.students), 1);
  const maxDayStudents     = Math.max(...byWeekday.map(d => d.students), 1);
  const maxMonthAttend     = Math.max(...(byMonth || []).map(m => m.studentAttendances), 1);
  const subjectSummary = bySubject.reduce<Record<string, { sessions: number; students: number; hoursPerWeek: number }>>((acc, s) => {
    acc[s.name] = acc[s.name] || { sessions: 0, students: 0, hoursPerWeek: 0 };
    acc[s.name].sessions += s.sessionsPerWeek;
    acc[s.name].students += s.students;
    acc[s.name].hoursPerWeek += s.hoursPerWeek;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Business Analysis</h2>
        <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Subject Summary</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(subjectSummary).map(([name, stats]) => (
            <div key={name} className="rounded-md border bg-background px-3 py-2 text-sm">
              <div className="font-semibold">{name}</div>
              <div className="text-xs text-muted-foreground">{stats.students} students · {stats.sessions} sessions · {stats.hoursPerWeek} hrs/wk</div>
            </div>
          ))}
        </div>
      </div>

      {/* Period filter */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attendance Period</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="month"
              value={from}
              onChange={e => { setFrom(e.target.value); load(e.target.value, to); }}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="month"
              value={to}
              onChange={e => { setTo(e.target.value); load(from, e.target.value); }}
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
            />
          </div>
        </div>
        {/* Period totals */}
        {periodTotals && (
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-background text-sm">
              <span className="font-semibold">{periodTotals.sessions}</span>
              <span className="text-muted-foreground">sessions held</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-green-50 text-sm">
              <span className="font-semibold text-green-700">{periodTotals.attendances}</span>
              <span className="text-green-700">attendances</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-red-50 text-sm">
              <span className="font-semibold text-red-700">{periodTotals.absences}</span>
              <span className="text-red-700">absences</span>
            </div>
            {periodTotals.attendancePct !== null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-primary/5 text-sm">
                <span className="font-semibold text-primary">{periodTotals.attendancePct}%</span>
                <span className="text-muted-foreground">attendance rate</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Classes",  value: totals.subjects,     color: "text-blue-700",   bg: "bg-blue-50" },
          { label: "Teachers",        value: totals.teachers,     color: "text-violet-700", bg: "bg-violet-50" },
          { label: "Total Students",  value: totals.students,     color: "text-green-700",  bg: "bg-green-50" },
          { label: "Hrs / Week",      value: totals.hoursPerWeek, color: "text-amber-700",  bg: "bg-amber-50" },
        ].map(c => (
          <Card key={c.label} className={`${c.bg} border-0`}>
            <CardContent className="pt-4 pb-3">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* By Teacher */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By Teacher</h3>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Teacher</th>
                <th className="px-3 py-2.5 text-center">Classes</th>
                <th className="px-3 py-2.5 text-center">Students</th>
                <th className="px-3 py-2.5 text-center">Hrs/Wk</th>
                <th className="px-3 py-2.5 text-left min-w-[120px]">Load</th>
              </tr>
            </thead>
            <tbody>
              {byTeacher.map((t, i) => (
                <tr key={t.teacherName} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 font-medium">{t.teacherName}</td>
                  <td className="px-3 py-2.5 text-center">{t.classCount}</td>
                  <td className="px-3 py-2.5 text-center font-bold">{t.students}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{t.hoursPerWeek}</td>
                  <td className="px-3 py-2.5">
                    <StackedDayBar items={t.classBreakdown || []} total={t.students} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Month */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By Month</h3>
        {(!byMonth || byMonth.length === 0) ? (
          <div className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No attendance records yet — sessions will appear here once attendance is marked.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left">Month</th>
                  <th className="px-3 py-2.5 text-center">Sessions Held</th>
                  <th className="px-3 py-2.5 text-center">Attendances</th>
                  <th className="px-3 py-2.5 text-center">Absences</th>
                  <th className="px-3 py-2.5 text-left min-w-[140px]">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map((m, i) => {
                  const total = m.studentAttendances + m.absences;
                  const attendPct = total > 0 ? Math.round((m.studentAttendances / total) * 100) : 0;
                  return (
                    <tr key={m.yyyyMM} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                      <td className="px-3 py-2.5 font-semibold">{m.label}</td>
                      <td className="px-3 py-2.5 text-center">{m.sessions}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-green-700">{m.studentAttendances}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-red-600">{m.absences}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <MiniBar pct={(m.studentAttendances / maxMonthAttend) * 100} color="bg-green-500" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{attendPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Weekday */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By Weekday</h3>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Day</th>
                <th className="px-3 py-2.5 text-center">Classes</th>
                <th className="px-3 py-2.5 text-center">Students</th>
                <th className="px-3 py-2.5 text-center">Hrs</th>
                <th className="px-3 py-2.5 text-left min-w-[140px]">Activity</th>
              </tr>
            </thead>
            <tbody>
              {byWeekday.map((d, i) => (
                <tr key={d.day} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 font-semibold">{d.day}</td>
                  <td className="px-3 py-2.5 text-center">{d.classCount}</td>
                  <td className="px-3 py-2.5 text-center font-bold">{d.students}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{d.hoursTotal}</td>
                  <td className="px-3 py-2.5">
                    <MiniBar pct={(d.students / maxDayStudents) * 100} color="bg-amber-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Subject */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">By Subject</h3>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Subject</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Teacher</th>
                <th className="px-3 py-2.5 text-center">Days/Wk</th>
                <th className="px-3 py-2.5 text-center">Hrs/Wk</th>
                <th className="px-3 py-2.5 text-center">Students</th>
                <th className="px-3 py-2.5 text-left min-w-[100px]">Fill</th>
              </tr>
            </thead>
            <tbody>
              {bySubject.map((s, i) => (
                <tr key={s.subjectId} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type.toLowerCase() === "group" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.teacherName}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{s.sessionsPerWeek}</td>
                  <td className="px-3 py-2.5 text-center font-semibold">{s.hoursPerWeek}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-bold">{s.students}</span>
                      <MiniBar pct={(s.students / maxStudents) * 100} color="bg-green-500" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {s.maxCapacity > 0 ? (
                      <div>
                        <span className="text-xs text-muted-foreground">{s.students}/{s.maxCapacity} ({s.fillPct}%)</span>
                        <MiniBar pct={s.fillPct} color={s.fillPct >= 90 ? "bg-red-500" : s.fillPct >= 70 ? "bg-amber-500" : "bg-green-500"} />
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const ELEVATED_ONLY: Tab[] = ["upload", "settings"];

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "calendar",    label: "Calendar",           icon: <CalendarDays className="w-4 h-4" /> },
  { id: "requests",    label: "Requests",           icon: <ClipboardList className="w-4 h-4" /> },
  { id: "students",    label: "Students",            icon: <Users className="w-4 h-4" /> },
  { id: "tutors",      label: "Tutors",             icon: <UserCheck className="w-4 h-4" /> },
  { id: "classes",     label: "Classes",            icon: <BookOpen className="w-4 h-4" /> },
  { id: "student-attendance", label: "Student Attendance", icon: <CalendarDays className="w-4 h-4" /> },
  { id: "tutor-attendance",  label: "Tutor Attendance",   icon: <CalendarDays className="w-4 h-4" /> },
  { id: "analysis",   label: "Analysis",           icon: <BarChart2 className="w-4 h-4" /> },
  { id: "users",       label: "All Users",          icon: null },
  { id: "upload",      label: "Mass Upload",        icon: <Upload className="w-4 h-4" /> },
  { id: "settings",    label: "Settings",           icon: <SettingsIcon className="w-4 h-4" /> },
];

function getViewerRole(): string {
  return (localStorage.getItem("edutrack_dev_role_override")
       || localStorage.getItem("edutrack_user_role")
       || "").toLowerCase();
}

function isElevatedRole(role: string): boolean {
  return role === "principal" || role === "developer" || role === "admin" || role === "staff";
}

function getViewerId(): string {
  return (localStorage.getItem("edutrack_user_id") || "").trim();
}

function getViewerEmail(): string {
  return (localStorage.getItem("edutrack_user_email") || "").toLowerCase().trim();
}

// ─── Viewer Scope ──────────────────────────────────────────────────────────────
// Computes the set of student IDs, class IDs, tutor IDs and tutor names visible
// to the current viewer. Results are cached for the session to avoid repeated
// fetches across tabs. Elevated roles get ALL ids (effectively unscoped).
type ViewerScope = {
  role: string;
  elevated: boolean;
  viewerId: string;
  viewerEmail: string;
  studentIds: Set<string>;
  classIds: Set<string>;
  tutorIds: Set<string>;
  tutorNames: Set<string>;
};

let _scopeCache: Promise<ViewerScope> | null = null;
function resetViewerScope() { _scopeCache = null; }

function getViewerScope(): Promise<ViewerScope> {
  if (_scopeCache) return _scopeCache;
  _scopeCache = (async () => {
    const role = getViewerRole();
    const elevated = isElevatedRole(role);
    const viewerId = getViewerId();
    const viewerEmail = getViewerEmail();

    const empty: ViewerScope = {
      role, elevated, viewerId, viewerEmail,
      studentIds: new Set(), classIds: new Set(),
      tutorIds: new Set(), tutorNames: new Set(),
    };
    if (elevated) return empty; // elevated callers should bypass filtering

    try {
      const [students, subjects, enrollments] = await Promise.all([
        apiFetch("/principals/students"),
        apiFetch("/subjects"),
        apiFetch("/enrollments"),
      ]);
      const subjArr = Array.isArray(subjects) ? subjects : [];
      const enrArr = Array.isArray(enrollments) ? enrollments : [];
      const stuArr = Array.isArray(students) ? students : [];

      const studentIds = new Set<string>();
      const classIds = new Set<string>();
      const tutorIds = new Set<string>();
      const tutorNames = new Set<string>();

      if (role === "student") {
        const me = stuArr.find(s =>
          (s.userId && s.userId === viewerId) ||
          (s.email && String(s.email).toLowerCase() === viewerEmail)
        );
        if (me?.userId) studentIds.add(me.userId);
      } else if (role === "parent") {
        for (const s of stuArr) {
          if ((s.parentId && s.parentId === viewerId) ||
              (s.parentEmail && String(s.parentEmail).toLowerCase() === viewerEmail)) {
            if (s.userId) studentIds.add(s.userId);
          }
        }
      }

      // Helper: subjects use `SubjectID` (sometimes also `ClassID`); /subjects
      // OVERWRITES TeacherID with the teacher's NAME, so prefer name matching.
      const subClassId = (s: any) => s.SubjectID || s.ClassID || s.subjectId || s.classId || "";
      const subTeacherName = (s: any) =>
        String(s.TeacherName || s.Teachers || s.TeacherID || s["Teacher Name"] || s.teacherName || "").trim();

      if (role === "tutor") {
        for (const sub of subjArr) {
          const tname = subTeacherName(sub).toLowerCase();
          const temail = String(sub["Teacher Email"] || "").toLowerCase();
          if ((temail && temail === viewerEmail) || (tname && tname === viewerEmail)) {
            const cid = subClassId(sub);
            if (cid) classIds.add(cid);
          }
        }
        for (const e of enrArr) {
          const cid = e.ClassID || e.classId;
          if (cid && classIds.has(cid)) {
            const uid = e.UserID || e.userId;
            if (uid) studentIds.add(uid);
          }
        }
        if (viewerId) tutorIds.add(viewerId);
      }

      // For student/parent: derive class IDs from their student IDs.
      if (role === "student" || role === "parent") {
        for (const e of enrArr) {
          const uid = e.UserID || e.userId;
          if (uid && studentIds.has(uid)) {
            const cid = e.ClassID || e.classId;
            if (cid) classIds.add(cid);
          }
        }
        // Tutors = teachers of those classes (matched by NAME since /subjects
        // returns TeacherID overwritten with the teacher's display name).
        for (const sub of subjArr) {
          const cid = subClassId(sub);
          if (cid && classIds.has(cid)) {
            const tname = subTeacherName(sub);
            if (tname) tutorNames.add(tname);
          }
        }
      }

      return { role, elevated, viewerId, viewerEmail, studentIds, classIds, tutorIds, tutorNames };
    } catch {
      return empty;
    }
  })();
  return _scopeCache;
}

// Convenience filters used by tab loaders.
async function scopeStudentsForViewer(students: any[]): Promise<any[]> {
  const sc = await getViewerScope();
  if (sc.elevated) return students;
  return students.filter(s => sc.studentIds.has(s.userId) || sc.studentIds.has(s.id) || sc.studentIds.has(s.UserID));
}
async function scopeTutorsForViewer(tutors: any[]): Promise<any[]> {
  const sc = await getViewerScope();
  if (sc.elevated) return tutors;
  return tutors.filter(t => {
    const id = t.UserID || t.userId || t.TeacherID;
    if (id && sc.tutorIds.has(id)) return true;
    const name = String(t.Name || t.name || "").trim();
    if (name && sc.tutorNames.has(name)) return true;
    return false;
  });
}
async function scopeSubjectsForViewer(subjects: any[]): Promise<any[]> {
  const sc = await getViewerScope();
  if (sc.elevated) return subjects;
  return subjects.filter(s => sc.classIds.has(s.SubjectID || s.ClassID || s.subjectId || s.classId));
}
async function scopeUsersForViewer(users: any[]): Promise<any[]> {
  const sc = await getViewerScope();
  if (sc.elevated) return users;
  // Show: self + related students + related tutors.
  return users.filter(u => {
    const uid = u.userId;
    if (!uid) return false;
    if (uid === sc.viewerId) return true;
    if (sc.studentIds.has(uid)) return true;
    if (sc.tutorIds.has(uid)) return true;
    return false;
  });
}
async function scopeAttendanceSummary(data: any): Promise<any> {
  const sc = await getViewerScope();
  if (sc.elevated || !data) return data;
  const out = { ...data };
  if (Array.isArray(data.students)) {
    out.students = data.students.filter((s: any) => sc.studentIds.has(s.studentId));
  }
  if (Array.isArray(data.cancellations)) {
    out.cancellations = data.cancellations.filter((c: any) =>
      sc.studentIds.has(c.userId) &&
      (sc.classIds.size === 0 || sc.classIds.has(c.classId))
    );
  }
  if (Array.isArray(data.tutors)) {
    out.tutors = data.tutors.filter((t: any) => sc.tutorIds.has(t.teacherId));
  }
  if (Array.isArray(data.tutorAttendance)) {
    out.tutorAttendance = data.tutorAttendance.filter((r: any) => sc.tutorIds.has(r.teacherId));
  }
  return out;
}
async function scopeAnalysisForViewer(data: any): Promise<any> {
  const sc = await getViewerScope();
  if (sc.elevated || !data) return data;
  const out = { ...data };
  if (Array.isArray(data.bySubject)) {
    out.bySubject = data.bySubject.filter((s: any) => sc.classIds.has(s.subjectId));
  }
  if (Array.isArray(data.byTeacher)) {
    out.byTeacher = data.byTeacher.filter((t: any) => sc.tutorIds.has(t.teacherId));
  }
  // Recompute coarse totals from the scoped slices.
  const teachers = out.byTeacher?.length ?? 0;
  const subjectsCount = out.bySubject?.length ?? 0;
  const studentsCount = sc.studentIds.size;
  const hoursPerWeek = (out.bySubject || []).reduce((n: number, s: any) => n + (s.hoursPerWeek || 0), 0);
  out.totals = { subjects: subjectsCount, teachers, students: studentsCount, hoursPerWeek };
  return out;
}

export default function PrincipalDashboard() {
  const [tab, setTab] = useState<Tab>("calendar");
  const role = getViewerRole();
  const isElevated = isElevatedRole(role);
  const TABS = ALL_TABS.filter(t => isElevated || !["requests", "users", "upload", "settings"].includes(t.id));
  const requestCount = 0;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <NotificationPrompt />
        <div className="border-b bg-card px-6 rounded-t-lg">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : t.id === "requests"
                      ? "border-transparent text-[#dc2626] font-bold hover:text-[#b91c1c]"
                      : t.id === "users"
                        ? "border-transparent text-[#dc2626] font-bold hover:text-[#b91c1c]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.id === "requests" ? `${t.label} (${requestCount})` : t.label}
              </button>
            ))}
          </div>
        </div>

        <main className="bg-background rounded-b-lg border border-t-0 px-6 py-8">
          {tab === "calendar"    && <CalendarContent />}
          {tab === "classes"     && <ClassesTab />}
          {tab === "requests"    && <RequestsTab />}
          {tab === "students"    && <StudentsTab />}
          {tab === "tutors"      && <TutorsTab />}
          {tab === "student-attendance" && <StudentAttendanceTab />}
          {tab === "tutor-attendance"  && <TutorAttendanceTab />}
          {tab === "analysis"    && <AnalysisTab />}
          {tab === "users"       && <UsersTab />}
          {tab === "upload"      && <BulkUploadCard />}
          {tab === "settings"    && <SettingsContent />}
        </main>
      </div>
    </AppLayout>
  );
}
