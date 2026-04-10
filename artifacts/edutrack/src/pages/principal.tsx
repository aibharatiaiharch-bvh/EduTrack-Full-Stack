import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getFeatures, FEATURE_META as FEATURE_META_CONFIG, type FeatureKey } from "@/config/features";
import {
  ShieldCheck, BookOpen, Calendar, Clock, AlertTriangle, CheckCircle2,
  XCircle, Rocket, Lock, Mail, Download, RefreshCw, UserPlus, GraduationCap,
  UserCheck, UserX, Search, ChevronDown,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const FEATURE_META = (Object.keys(FEATURE_META_CONFIG) as FeatureKey[]).map(key => ({
  key,
  label: FEATURE_META_CONFIG[key].label,
  description: FEATURE_META_CONFIG[key].description,
}));

const SHEET_KEY = "edutrack_sheet_id";

interface UserRow {
  _row: number;
  userId: string;
  email: string;
  role: string;
  name: string;
  addedDate: string;
  status: string;
}
const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-purple-100 text-purple-700",
  principal: "bg-blue-100 text-blue-700",
  tutor:     "bg-green-100 text-green-700",
  parent:    "bg-orange-100 text-orange-700",
  student:   "bg-cyan-100 text-cyan-700",
};
const STATUS_COLORS: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  inactive: "bg-slate-100 text-slate-600",
  pending:  "bg-amber-100 text-amber-700",
};

type Enrollment = {
  _row: number;
  "Student Name": string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Parent Email": string;
  "Status": string;
  "Override Action": string;
};

type EnrollmentRequest = {
  _row: number;
  "Student Name": string;
  "Parent Name": string;
  "Parent Email": string;
  "Parent Phone": string;
  "Classes Interested": string;
  "Submission Date": string;
  "Status": string;
  "Current Grade": string;
  "Notes": string;
};

export default function PrincipalDashboard() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Late cancellations
  const { data: requests, isLoading } = useQuery<Enrollment[]>({
    queryKey: ["enrollments", "late-cancellations", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ status: "Late Cancellation", ...(sheetId ? { sheetId } : {}) });
      const res = await fetch(apiUrl(`/enrollments?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ row, action }: { row: number; action: "Fee Waived" | "Fee Confirmed" }) => {
      const res = await fetch(apiUrl(`/enrollments/${row}/override`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      toast({ title: data.action === "Fee Waived" ? "Fee waived" : "Fee confirmed" });
    },
    onError: (err: any) => toast({ title: "Override failed", description: err.message, variant: "destructive" }),
  });

  // Enrollment requests
  const { data: enrollmentRequests, isLoading: loadingRequests } = useQuery<EnrollmentRequest[]>({
    queryKey: ["enrollment-requests", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/enrollment-requests?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (row: number) => {
      const res = await fetch(apiUrl(`/enrollment-requests/${row}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollment-requests"] });
      toast({ title: "Enrolment approved", description: "Student and parent have been activated." });
    },
    onError: (err: any) => toast({ title: "Approval failed", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (row: number) => {
      const res = await fetch(apiUrl(`/enrollment-requests/${row}/reject`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollment-requests"] });
      toast({ title: "Enrolment rejected" });
    },
    onError: (err: any) => toast({ title: "Rejection failed", description: err.message, variant: "destructive" }),
  });

  const pendingRequests = (enrollmentRequests ?? []).filter(r => r["Status"]?.toLowerCase() === "pending");

  // Add Teacher dialog
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", subjects: "" });
  const addTeacherMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/principals/add-teacher"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...teacherForm, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setShowAddTeacher(false);
      setTeacherForm({ name: "", email: "", subjects: "" });
      toast({ title: "Teacher added", description: "Added to the Teachers tab and can now log in." });
    },
    onError: (err: any) => toast({ title: "Failed to add teacher", description: err.message, variant: "destructive" }),
  });

  // Add Student dialog
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: "", email: "", phone: "", parentEmail: "" });
  const addStudentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/principals/add-student"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...studentForm, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setShowAddStudent(false);
      setStudentForm({ name: "", email: "", phone: "", parentEmail: "" });
      toast({ title: "Student added", description: "Student is now active in the Students tab." });
    },
    onError: (err: any) => toast({ title: "Failed to add student", description: err.message, variant: "destructive" }),
  });

  // ── User Management ─────────────────────────────────────────────────
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [actioningUser, setActioningUser] = useState<string | null>(null);

  function loadUsers() {
    if (!sheetId) return;
    setLoadingUsers(true);
    fetch(apiUrl(`/users?sheetId=${encodeURIComponent(sheetId)}`))
      .then(r => r.json())
      .then(d => Array.isArray(d) ? setUserList(d) : setUserList([]))
      .catch(() => setUserList([]))
      .finally(() => setLoadingUsers(false));
  }
  useEffect(() => { loadUsers(); }, [sheetId]);

  async function deactivateUser(userId: string) {
    setActioningUser(userId);
    try {
      const res = await fetch(apiUrl(`/users/deactivate?sheetId=${encodeURIComponent(sheetId!)}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUserList(prev => prev.map(u => u.userId === userId ? { ...u, status: "Inactive" } : u));
      toast({ title: "User deactivated", description: "Access revoked. Record saved to Archive tab." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setActioningUser(null); }
  }

  async function reactivateUser(userId: string) {
    setActioningUser(userId);
    try {
      const res = await fetch(apiUrl(`/users/reactivate?sheetId=${encodeURIComponent(sheetId!)}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUserList(prev => prev.map(u => u.userId === userId ? { ...u, status: "Active" } : u));
      toast({ title: "User reactivated", description: "Access restored." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setActioningUser(null); }
  }

  const filteredUsers = userList.filter(u => {
    const matchesRole = userRoleFilter === "all" || u.role.toLowerCase() === userRoleFilter;
    const matchesStatus = userStatusFilter === "all" || u.status.toLowerCase() === userStatusFilter;
    const matchesSearch = !userSearch || [u.name, u.email, u.userId].some(
      v => v.toLowerCase().includes(userSearch.toLowerCase())
    );
    return matchesRole && matchesStatus && matchesSearch;
  });

  // Backup
  const [backingUp, setBackingUp] = useState(false);
  async function downloadBackup() {
    if (!sheetId) return;
    setBackingUp(true);
    const tabs = [
      { key: "students", label: "Students" }, { key: "teachers", label: "Teachers" },
      { key: "subjects", label: "Subjects" }, { key: "enrollments", label: "Enrollments" },
      { key: "parents", label: "Parents" }, { key: "users", label: "Users" },
    ];
    function toCSV(rows: any[]): string {
      if (!rows.length) return "";
      const headers = Object.keys(rows[0]).filter(k => k !== "_row");
      const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [headers.map(escape).join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
    }
    try {
      const parts: string[] = [];
      for (const { key, label } of tabs) {
        const res = await fetch(apiUrl(`/sheets/${key}?sheetId=${encodeURIComponent(sheetId)}`));
        const rows = await res.json();
        if (Array.isArray(rows)) parts.push(`### ${label}\n${toCSV(rows)}`);
      }
      const blob = new Blob([parts.join("\n\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edutrack-backup-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Backup failed", description: err.message, variant: "destructive" });
    } finally {
      setBackingUp(false);
    }
  }

  const [devEmail, setDevEmail] = useState<string | null>(null);
  useEffect(() => {
    const qs = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
    fetch(apiUrl(`/admin/contact${qs}`))
      .then((r) => r.json())
      .then((d) => { if (d.email) setDevEmail(d.email); })
      .catch(() => {});
  }, [sheetId]);

  const pending = requests ?? [];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-4xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Principal Dashboard</h1>
              <p className="text-muted-foreground mt-1">Manage enrolments, staff, and students.</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={downloadBackup}
            disabled={backingUp || !sheetId}
          >
            {backingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{backingUp ? "Downloading…" : "Download Backup"}</span>
          </Button>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings to link your data source first.</p>
          </div>
        )}

        {/* Quick Actions: Add Teacher / Student */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Add</CardTitle>
            <CardDescription>Add a teacher or student directly without going through the enrolment form.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              className="gap-2"
              onClick={() => setShowAddTeacher(true)}
              disabled={!sheetId}
            >
              <UserPlus className="w-4 h-4" />
              Add Teacher
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowAddStudent(true)}
              disabled={!sheetId}
            >
              <GraduationCap className="w-4 h-4" />
              Add Student
            </Button>
          </CardContent>
        </Card>

        {/* Pending Enrolment Requests */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <CardTitle>Enrolment Requests</CardTitle>
                <CardDescription className="mt-1">
                  Review submissions from the enrolment form. Approving will activate the student and parent.
                </CardDescription>
              </div>
              {!loadingRequests && (
                <Badge
                  variant={pendingRequests.length > 0 ? "destructive" : "secondary"}
                  className="text-sm px-3 py-1 self-start shrink-0"
                >
                  {pendingRequests.length} pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingRequests ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : pendingRequests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="font-medium">No pending requests</p>
                <p className="text-sm">All enrolment requests have been processed.</p>
              </div>
            ) : (
              pendingRequests.map((req) => (
                <div
                  key={req._row}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-foreground">{req["Student Name"]}</p>
                      <p className="text-sm text-muted-foreground">
                        Parent: <span className="text-foreground">{req["Parent Name"]}</span>
                        {req["Parent Email"] && <> · {req["Parent Email"]}</>}
                      </p>
                      {req["Classes Interested"] && (
                        <p className="text-xs text-muted-foreground">Interested in: {req["Classes Interested"]}</p>
                      )}
                      {req["Submission Date"] && (
                        <p className="text-xs text-muted-foreground">Submitted: {req["Submission Date"]}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => approveMutation.mutate(req._row)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => rejectMutation.mutate(req._row)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Late Cancellation Requests (God Mode) */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <CardTitle>Late Cancellation Requests</CardTitle>
                <CardDescription className="mt-1">
                  Cancellations within 24 hours of class. Use "God Mode" to waive or confirm the fee.
                </CardDescription>
              </div>
              {!isLoading && (
                <Badge variant={pending.length > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1 self-start shrink-0">
                  {pending.length} pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : pending.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="font-medium">No pending requests</p>
                <p className="text-sm">All late cancellations have been resolved.</p>
              </div>
            ) : (
              pending.map((enrollment) => (
                <div
                  key={enrollment._row}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-11 h-11 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{enrollment["Student Name"]}</p>
                      <p className="font-medium text-sm">{enrollment["Class Name"]}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {enrollment["Class Date"] && (
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{enrollment["Class Date"]}</span>
                        )}
                        {enrollment["Class Time"] && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{enrollment["Class Time"]}</span>
                        )}
                        {enrollment["Parent Email"] && <span>{enrollment["Parent Email"]}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => overrideMutation.mutate({ row: enrollment._row, action: "Fee Waived" })}
                      disabled={overrideMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Waive Fee
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => overrideMutation.mutate({ row: enrollment._row, action: "Fee Confirmed" })}
                      disabled={overrideMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Confirm Charge
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Feature Upgrades */}
        <Card>
          <CardHeader>
            <CardTitle>Features & Upgrades</CardTitle>
            <CardDescription>See which features are active on your plan.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {FEATURE_META.map((feat, i) => {
              const active = getFeatures()[feat.key];
              return (
                <div key={feat.key} className={`flex items-center justify-between gap-4 py-3 ${i === 0 ? "pt-0" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {active ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{feat.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{feat.description}</p>
                    </div>
                  </div>
                  {active ? (
                    <Badge variant="secondary" className="text-xs shrink-0 text-green-700 bg-green-100">Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 text-primary border-primary/40 hover:bg-primary/5"
                      onClick={() => toast({ title: "Upgrade request sent", description: `Your interest in ${feat.label} has been noted.` })}
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      Request Upgrade
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* User Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription className="mt-1">
                  All users in the Users tab. Role controls which portal they access.
                  Deactivating revokes access immediately and archives the record.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={loadUsers} disabled={loadingUsers}>
                <RefreshCw className={`w-3 h-3 ${loadingUsers ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  className="w-full h-8 pl-8 pr-3 text-sm rounded-md border bg-background outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Search name, email or ID…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    className="h-8 pl-2 pr-6 text-xs rounded-md border bg-background appearance-none cursor-pointer"
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                  >
                    <option value="all">All Roles</option>
                    <option value="developer">Developer</option>
                    <option value="principal">Principal</option>
                    <option value="tutor">Tutor</option>
                    <option value="parent">Parent</option>
                    <option value="student">Student</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    className="h-8 pl-2 pr-6 text-xs rounded-md border bg-background appearance-none cursor-pointer"
                    value={userStatusFilter}
                    onChange={e => setUserStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* User list */}
            {loadingUsers ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Loading users…</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                {userList.length === 0 ? "No users found in the Users tab." : "No users match the current filters."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filteredUsers.map(u => {
                  const statusKey = u.status.toLowerCase();
                  const roleKey = u.role.toLowerCase();
                  const isActioning = actioningUser === u.userId;
                  return (
                    <div key={u.userId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{u.name || u.email}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[roleKey] || "bg-muted text-muted-foreground"}`}>
                              {u.role || "—"}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[statusKey] || "bg-muted text-muted-foreground"}`}>
                              {u.status || "—"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{u.userId || "—"}</span>
                            <span>·</span><span>{u.email}</span>
                            {u.addedDate && <><span>·</span><span>{u.addedDate}</span></>}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {statusKey !== "inactive" ? (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-700 border-amber-200 hover:bg-amber-50" onClick={() => deactivateUser(u.userId)} disabled={isActioning}>
                              {isActioning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                              Deactivate
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => reactivateUser(u.userId)} disabled={isActioning}>
                              {isActioning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {filteredUsers.length} of {userList.length} user{userList.length !== 1 ? "s" : ""} shown
            </p>
          </CardContent>
        </Card>

        {/* Contact Developer */}
        {devEmail && (
          <Card className="border-purple-200 bg-purple-50/30">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm text-foreground">Need help or want a new feature?</p>
                <p className="text-xs text-muted-foreground">Contact your app developer directly.</p>
              </div>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 gap-2 shrink-0"
                onClick={() => window.open(`mailto:${devEmail}?subject=EduTrack Support&body=Hi,%0A%0A`, "_blank")}
              >
                <Mail className="w-3 h-3" />
                Contact Developer
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Teacher Dialog */}
      <Dialog open={showAddTeacher} onOpenChange={setShowAddTeacher}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Teacher</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="t-name">Full Name *</Label>
              <Input
                id="t-name"
                placeholder="e.g. Jane Smith"
                value={teacherForm.name}
                onChange={e => setTeacherForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-email">Email (for login)</Label>
              <Input
                id="t-email"
                type="email"
                placeholder="jane@school.edu"
                value={teacherForm.email}
                onChange={e => setTeacherForm(f => ({ ...f, email: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                If provided, this teacher will be added to the Users tab so they can log in.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-subjects">Subjects</Label>
              <Input
                id="t-subjects"
                placeholder="e.g. Maths, Science"
                value={teacherForm.subjects}
                onChange={e => setTeacherForm(f => ({ ...f, subjects: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTeacher(false)}>Cancel</Button>
            <Button
              onClick={() => addTeacherMutation.mutate()}
              disabled={!teacherForm.name.trim() || addTeacherMutation.isPending}
            >
              {addTeacherMutation.isPending ? "Adding…" : "Add Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Dialog */}
      <Dialog open={showAddStudent} onOpenChange={setShowAddStudent}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="s-name">Full Name *</Label>
              <Input
                id="s-name"
                placeholder="e.g. Alex Johnson"
                value={studentForm.name}
                onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-email">Student Email</Label>
              <Input
                id="s-email"
                type="email"
                placeholder="alex@email.com"
                value={studentForm.email}
                onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-phone">Phone</Label>
              <Input
                id="s-phone"
                placeholder="e.g. 0412 345 678"
                value={studentForm.phone}
                onChange={e => setStudentForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-parent">Parent Email</Label>
              <Input
                id="s-parent"
                type="email"
                placeholder="parent@email.com"
                value={studentForm.parentEmail}
                onChange={e => setStudentForm(f => ({ ...f, parentEmail: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStudent(false)}>Cancel</Button>
            <Button
              onClick={() => addStudentMutation.mutate()}
              disabled={!studentForm.name.trim() || addStudentMutation.isPending}
            >
              {addStudentMutation.isPending ? "Adding…" : "Add Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
