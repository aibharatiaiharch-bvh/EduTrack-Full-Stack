import { useEffect, useState, useMemo } from "react";
import { Link } from "wouter";
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
  UserCheck, UserX, Search, ChevronDown, Video, Users2, LinkIcon, Layers, PlusCircle,
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
  "Teacher": string;
  "Teacher Email": string;
  "Zoom Link": string;
};

type TeacherRow = {
  _row: number;
  "UserID": string;
  "Name": string;
  "Email": string;
  "Subjects": string;
  "Status": string;
  "Zoom Link": string;
};

type EnrollmentRequest = {
  _row: number;
  "Student Name": string;
  "Student Email": string;
  "Previously Enrolled": string;
  "Current School": string;
  "Current Grade": string;
  "Age": string;
  "Classes Interested": string;
  "Parent Email": string;
  "Parent Phone": string;
  "Reference": string;
  "Promo Code": string;
  "Notes": string;
  "Submission Date": string;
  "Status": string;
  "Request Type": string;
};

export default function PrincipalDashboard() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const { toast } = useToast();
  const qc = useQueryClient();
  const isPrivileged = true;

  // Late cancellations
  const { data: requests, isLoading } = useQuery<Enrollment[]>({
    queryKey: ["enrollments", "late-cancellations", sheetId],
    enabled: isPrivileged || !!sheetId,
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
    enabled: isPrivileged || !!sheetId,
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

  const pendingRequests = (enrollmentRequests ?? []).filter(r =>
    r["Status"]?.toLowerCase() === "pending" &&
    (r["Request Type"] || "student").toLowerCase() !== "new-class"
  );

  const pendingClassRequests = (enrollmentRequests ?? []).filter(r =>
    r["Status"]?.toLowerCase() === "pending" &&
    (r["Request Type"] || "").toLowerCase() === "new-class"
  );

  const approveClassRequestMutation = useMutation({
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
      toast({ title: "Class request approved", description: "The request has been marked as approved." });
    },
    onError: (err: any) => toast({ title: "Approval failed", description: err.message, variant: "destructive" }),
  });

  const rejectClassRequestMutation = useMutation({
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
      toast({ title: "Class request rejected" });
    },
    onError: (err: any) => toast({ title: "Rejection failed", description: err.message, variant: "destructive" }),
  });

  // ── Class Assignments ────────────────────────────────────────────────
  const { data: allEnrollments, isLoading: loadingAllEnrollments } = useQuery<Enrollment[]>({
    queryKey: ["enrollments", "all", sheetId],
    enabled: isPrivileged || !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/enrollments?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: activeTeachers } = useQuery<TeacherRow[]>({
    queryKey: ["principal-teachers", sheetId],
    enabled: isPrivileged || !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/principals/teachers?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const [assignDialog, setAssignDialog] = useState<{ open: boolean; enrollment: Enrollment | null }>({
    open: false,
    enrollment: null,
  });
  const [assignSearch, setAssignSearch] = useState("");

  const assignTeacherMutation = useMutation({
    mutationFn: async ({ row, teacherEmail }: { row: number; teacherEmail: string }) => {
      const res = await fetch(apiUrl(`/enrollments/${row}/assign-teacher`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setAssignDialog({ open: false, enrollment: null });
      setAssignSearch("");
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      toast({ title: "Teacher assigned", description: `${data.teacher} assigned successfully.` });
    },
    onError: (err: any) => toast({ title: "Assignment failed", description: err.message, variant: "destructive" }),
  });

  const assignableEnrollments = (allEnrollments ?? []).filter(
    e => !["cancelled", "late cancellation", "rejected"].includes((e["Status"] || "").toLowerCase())
  );

  // ── Teacher Schedule ─────────────────────────────────────────────────
  const [teacherScheduleFilter, setTeacherScheduleFilter] = useState("__all__");

  const teacherNames = useMemo(() => {
    const names = new Set<string>();
    (allEnrollments ?? []).forEach(e => { if (e["Teacher"]) names.add(e["Teacher"]); });
    return Array.from(names).sort();
  }, [allEnrollments]);

  const scheduleEnrollments = useMemo(() => {
    const enrs = (allEnrollments ?? [])
      .filter(e => !["cancelled", "late cancellation", "rejected"].includes((e["Status"] || "").toLowerCase()))
      .filter(e => teacherScheduleFilter === "__all__" || e["Teacher"] === teacherScheduleFilter)
      .slice()
      .sort((a, b) => {
        const da = `${a["Class Date"]} ${a["Class Time"]}`;
        const db = `${b["Class Date"]} ${b["Class Time"]}`;
        return da.localeCompare(db);
      });
    // Group by teacher
    const grouped: Record<string, Enrollment[]> = {};
    for (const e of enrs) {
      const key = e["Teacher"] || "Unassigned";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }
    return grouped;
  }, [allEnrollments, teacherScheduleFilter]);

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
  const [studentForm, setStudentForm] = useState({ name: "", email: "", phone: "", parentEmail: "", parentName: "", parentPhone: "" });
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
      setStudentForm({ name: "", email: "", phone: "", parentEmail: "", parentName: "", parentPhone: "" });
      qc.invalidateQueries({ queryKey: ["pending-students", sheetId] });
      loadUsers();
      toast({ title: "Student added", description: "Student is Inactive — activate them here once payment is confirmed." });
    },
    onError: (err: any) => toast({ title: "Failed to add student", description: err.message, variant: "destructive" }),
  });

  // Pending Activation — students awaiting principal activation (e.g. after payment)
  const { data: pendingStudents } = useQuery<{ UserID: string; Name: string; Email: string; "Added Date": string }[]>({
    queryKey: ["pending-students", sheetId],
    enabled: isPrivileged || !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/principals/pending-students?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error("Failed to load pending students");
      return res.json();
    },
  });
  const activateStudentMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(apiUrl(`/principals/sync-user-status?sheetId=${encodeURIComponent(sheetId!)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status: "Active" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-students", sheetId] });
      loadUsers();
      toast({ title: "Student activated" });
    },
    onError: (err: any) => toast({ title: "Activation failed", description: err.message, variant: "destructive" }),
  });
  // Add Subject dialog
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: "", type: "Individual", teachers: "", room: "", days: "" });
  const addSubjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/subjects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subjectForm, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setShowAddSubject(false);
      setSubjectForm({ name: "", type: "Individual", teachers: "", room: "", days: "" });
      toast({ title: "Subject created", description: `${subjectForm.name} added with ID ${data.subjectId}.` });
    },
    onError: (err: any) => toast({ title: "Failed to add subject", description: err.message, variant: "destructive" }),
  });

  // ── User Management ─────────────────────────────────────────────────
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [actioningUser, setActioningUser] = useState<string | null>(null);

  function loadUsers() {
    if (!sheetId && !isPrivileged) return;
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
      loadUsers();
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
      loadUsers();
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
    if (!sheetId && !isPrivileged) return;
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

  // Reconcile Job
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  async function runReconcile() {
    if (!sheetId && !isPrivileged) return;
    setReconciling(true);
    try {
      const res = await fetch(apiUrl("/principals/reconcile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconcile failed");
      setReconcileResult(data);
      setShowReconcileDialog(true);
    } catch (err: any) {
      toast({ title: "Reconcile failed", description: err.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  }

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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={runReconcile}
              disabled={reconciling && !isPrivileged || (!sheetId && !isPrivileged)}
              title="Run data integrity check on all tabs"
            >
              {reconciling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span className="hidden sm:inline">{reconciling ? "Reconciling…" : "Reconcile"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={downloadBackup}
              disabled={backingUp && !isPrivileged || (!sheetId && !isPrivileged)}
            >
              {backingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">{backingUp ? "Downloading…" : "Download Backup"}</span>
            </Button>
          </div>
        </header>

        {!sheetId && !isPrivileged && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings to link your data source first.</p>
          </div>
        )}

        {/* Quick Actions: Add Teacher / Student / Subject */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Add</CardTitle>
            <CardDescription>Add a teacher, student, or subject directly without going through the enrolment form.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              className="gap-2"
              onClick={() => setShowAddTeacher(true)}
              disabled={!sheetId && !isPrivileged}
            >
              <UserPlus className="w-4 h-4" />
              Add Teacher
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowAddStudent(true)}
              disabled={!sheetId && !isPrivileged}
            >
              <GraduationCap className="w-4 h-4" />
              Add Student
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowAddSubject(true)}
              disabled={!sheetId && !isPrivileged}
            >
              <BookOpen className="w-4 h-4" />
              Add Subject
            </Button>
            <Link href="/housekeeping">
              <Button variant="outline" className="gap-2">
                Housekeeping
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Pending Student Activation */}
        {(pendingStudents ?? []).length > 0 && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-amber-900 dark:text-amber-100">Pending Activation</CardTitle>
                  <Badge className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100">
                    {pendingStudents!.length}
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-amber-700 dark:text-amber-300">
                These students are waiting for you to confirm payment and activate their account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingStudents!.map(s => (
                <div key={s.UserID} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-white dark:bg-amber-900/20">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                        {(s.Name || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{s.Name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.Email || "No email"} · Added {s["Added Date"] || "—"}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => activateStudentMutation.mutate(s.UserID)}
                    disabled={activateStudentMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
                        {req["Parent Email"] && <span>{req["Parent Email"]}</span>}
                        {req["Parent Phone"] && <> · {req["Parent Phone"]}</>}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {req["Age"] && <p className="text-xs text-muted-foreground">Age: {req["Age"]}</p>}
                        {req["Current Grade"] && <p className="text-xs text-muted-foreground">Grade: {req["Current Grade"]}</p>}
                        {req["Current School"] && <p className="text-xs text-muted-foreground">School: {req["Current School"]}</p>}
                        {req["Previously Enrolled"] && <p className="text-xs text-muted-foreground">Prev. enrolled: {req["Previously Enrolled"]}</p>}
                      </div>
                      {req["Classes Interested"] && (
                        <p className="text-xs text-muted-foreground">Interested in: <strong>{req["Classes Interested"]}</strong></p>
                      )}
                      {(req["Reference"] || req["Promo Code"]) && (
                        <p className="text-xs text-muted-foreground">
                          {req["Reference"] && <>Ref: {req["Reference"]}</>}
                          {req["Reference"] && req["Promo Code"] && " · "}
                          {req["Promo Code"] && <>Promo: {req["Promo Code"]}</>}
                        </p>
                      )}
                      {req["Notes"] && (
                        <p className="text-xs text-muted-foreground italic">Notes: {req["Notes"]}</p>
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

        {/* Class Requests */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-primary" />
                  Class Requests
                </CardTitle>
                <CardDescription className="mt-1">
                  Students and parents requesting a new class to be created. Approve to confirm, or reject to decline.
                </CardDescription>
              </div>
              {!loadingRequests && (
                <Badge
                  variant={pendingClassRequests.length > 0 ? "destructive" : "secondary"}
                  className="text-sm px-3 py-1 self-start shrink-0"
                >
                  {pendingClassRequests.length} pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingRequests ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
            ) : pendingClassRequests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="font-medium">No pending class requests</p>
                <p className="text-sm">When students or parents request a new class it will appear here.</p>
              </div>
            ) : (
              pendingClassRequests.map((req) => {
                const classWanted = req["Classes Interested"] || req["Student Email"] || "—";
                const requesterName = req["Student Name"] || "Unknown";
                const requesterEmail = req["Parent Email"] || req["Student Email"] || "";
                const notes = req["Notes"] || "";
                return (
                  <div
                    key={req._row}
                    className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <p className="font-semibold text-foreground">{classWanted}</p>
                        <p className="text-sm text-muted-foreground">Requested by: {requesterName}{requesterEmail ? ` · ${requesterEmail}` : ""}</p>
                        {notes && (
                          <p className="text-xs text-muted-foreground italic">{notes}</p>
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
                        onClick={() => approveClassRequestMutation.mutate(req._row)}
                        disabled={approveClassRequestMutation.isPending || rejectClassRequestMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => rejectClassRequestMutation.mutate(req._row)}
                        disabled={approveClassRequestMutation.isPending || rejectClassRequestMutation.isPending}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
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

        {/* Class Assignments */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users2 className="h-5 w-5 text-primary" />
                  Class Assignments
                </CardTitle>
                <CardDescription className="mt-1">
                  Assign or reassign a teacher to any active class. The teacher's Zoom link and details are auto-populated.
                </CardDescription>
              </div>
              {!loadingAllEnrollments && (
                <Badge variant="secondary" className="text-sm px-3 py-1 self-start shrink-0">
                  {assignableEnrollments.length} active
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAllEnrollments ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : assignableEnrollments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium">No active enrollments</p>
                <p className="text-sm">Enrollments will appear here once added.</p>
              </div>
            ) : (
              assignableEnrollments.map((enrollment) => {
                const hasTeacher = !!enrollment["Teacher"];
                return (
                  <div
                    key={enrollment._row}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${hasTeacher ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-600"}`}>
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold text-foreground text-sm">{enrollment["Student Name"]}</p>
                        <p className="text-sm text-muted-foreground">{enrollment["Class Name"]}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                          {enrollment["Class Date"] && (
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{enrollment["Class Date"]}</span>
                          )}
                          {enrollment["Class Time"] && (
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{enrollment["Class Time"]}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1">
                          {hasTeacher ? (
                            <>
                              <span className="flex items-center gap-1 text-green-700 font-medium">
                                <UserCheck className="h-3 w-3" />
                                {enrollment["Teacher"]}
                              </span>
                              {enrollment["Zoom Link"] && (
                                <a
                                  href={enrollment["Zoom Link"]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <Video className="h-3 w-3" />
                                  Zoom Link
                                </a>
                              )}
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 font-medium">
                              <AlertTriangle className="h-3 w-3" />
                              No teacher assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={hasTeacher ? "outline" : "default"}
                      className="shrink-0 gap-1.5"
                      onClick={() => { setAssignDialog({ open: true, enrollment }); setAssignSearch(""); }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {hasTeacher ? "Reassign" : "Assign Teacher"}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Teacher Schedules */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Teacher Schedules
                </CardTitle>
                <CardDescription className="mt-1">
                  All classes grouped by teacher. Click Reassign to move a class to a different teacher.
                </CardDescription>
              </div>
              {/* Teacher filter */}
              <div className="relative shrink-0">
                <select
                  className="h-8 pl-2 pr-7 text-xs rounded-md border bg-background appearance-none cursor-pointer"
                  value={teacherScheduleFilter}
                  onChange={e => setTeacherScheduleFilter(e.target.value)}
                >
                  <option value="__all__">All Teachers</option>
                  <option value="Unassigned">Unassigned</option>
                  {teacherNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingAllEnrollments ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
            ) : Object.keys(scheduleEnrollments).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <Calendar className="h-8 w-8 opacity-40" />
                <p className="font-medium">No classes to display</p>
              </div>
            ) : (
              Object.entries(scheduleEnrollments).map(([teacherName, enrs]) => (
                <div key={teacherName} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold
                      ${teacherName === "Unassigned" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                      {teacherName === "Unassigned" ? "?" : teacherName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{teacherName}</p>
                      <p className="text-xs text-muted-foreground">{enrs.length} {enrs.length === 1 ? "class" : "classes"}</p>
                    </div>
                  </div>
                  <div className="ml-10 space-y-2">
                    {enrs.map(enr => (
                      <div
                        key={enr._row}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-sm">{enr["Class Name"] || "—"}</p>
                          <p className="text-xs text-muted-foreground">Student: {enr["Student Name"]}</p>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {enr["Class Date"] && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{enr["Class Date"]}</span>
                            )}
                            {enr["Class Time"] && (
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{enr["Class Time"]}</span>
                            )}
                            {enr["Zoom Link"] && (
                              <a href={enr["Zoom Link"]} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline">
                                <Video className="h-3 w-3" />Zoom
                              </a>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1.5 self-start sm:self-auto"
                          onClick={() => { setAssignDialog({ open: true, enrollment: enr }); setAssignSearch(""); }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Reassign
                        </Button>
                      </div>
                    ))}
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
                        <div className="shrink-0" />
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

      {/* Assign Teacher Dialog */}
      <Dialog
        open={assignDialog.open}
        onOpenChange={(open) => { if (!open) { setAssignDialog({ open: false, enrollment: null }); setAssignSearch(""); } }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {assignDialog.enrollment?.["Teacher"] ? "Reassign Teacher" : "Assign Teacher"}
            </DialogTitle>
          </DialogHeader>

          {assignDialog.enrollment && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-1 text-sm">
              <p className="font-semibold">{assignDialog.enrollment["Student Name"]}</p>
              <p className="text-muted-foreground">{assignDialog.enrollment["Class Name"]}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                {assignDialog.enrollment["Class Date"] && (
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{assignDialog.enrollment["Class Date"]}</span>
                )}
                {assignDialog.enrollment["Class Time"] && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{assignDialog.enrollment["Class Time"]}</span>
                )}
              </div>
              {assignDialog.enrollment["Teacher"] && (
                <p className="text-xs text-amber-600 mt-1">
                  Currently: <strong>{assignDialog.enrollment["Teacher"]}</strong> — selecting a new teacher will replace this assignment.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Select a Teacher</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or subject..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {(activeTeachers ?? [])
              .filter(t => {
                if (!assignSearch) return true;
                const q = assignSearch.toLowerCase();
                return (t["Name"] || "").toLowerCase().includes(q) ||
                       (t["Subjects"] || "").toLowerCase().includes(q);
              })
              .map((teacher) => (
                <button
                  key={teacher._row}
                  disabled={assignTeacherMutation.isPending}
                  onClick={() => assignDialog.enrollment && assignTeacherMutation.mutate({
                    row: assignDialog.enrollment._row,
                    teacherEmail: teacher["Email"],
                  })}
                  className="w-full text-left rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors p-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{teacher["Name"]}</p>
                      {teacher["Subjects"] && (
                        <p className="text-xs text-muted-foreground">{teacher["Subjects"]}</p>
                      )}
                      {teacher["Zoom Link"] && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                          <Video className="h-3 w-3" />
                          Zoom link available
                        </p>
                      )}
                    </div>
                    {assignTeacherMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin shrink-0 mt-0.5" />
                    ) : (
                      <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}
            {(activeTeachers ?? []).length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Users2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                No active teachers found. Add a teacher first.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog({ open: false, enrollment: null })}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200">
              <Clock className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">Student will be added as <strong>Inactive</strong>. You'll see them in the Pending Activation section — activate once payment is confirmed.</p>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Student Details</p>
            <div className="space-y-2">
              <Label htmlFor="s-name">Full Name <span className="text-destructive">*</span></Label>
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
              <Label htmlFor="s-phone">Student Phone</Label>
              <Input
                id="s-phone"
                placeholder="e.g. 0412 345 678"
                value={studentForm.phone}
                onChange={e => setStudentForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="border-t pt-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent / Guardian</p>
            <p className="text-xs text-muted-foreground -mt-2">If the parent already exists, they'll be looked up by email and linked automatically.</p>
            <div className="space-y-2">
              <Label htmlFor="s-parent-email">Parent Email</Label>
              <Input
                id="s-parent-email"
                type="email"
                placeholder="parent@email.com"
                value={studentForm.parentEmail}
                onChange={e => setStudentForm(f => ({ ...f, parentEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-parent-name">Parent Name</Label>
              <Input
                id="s-parent-name"
                placeholder="e.g. Sarah Johnson"
                value={studentForm.parentName}
                onChange={e => setStudentForm(f => ({ ...f, parentName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-parent-phone">Parent Phone</Label>
              <Input
                id="s-parent-phone"
                placeholder="e.g. 0412 000 111"
                value={studentForm.parentPhone}
                onChange={e => setStudentForm(f => ({ ...f, parentPhone: e.target.value }))}
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

      {/* Add Subject Dialog */}
      <Dialog open={showAddSubject} onOpenChange={setShowAddSubject}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Add Subject
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sub-name">Subject Name <span className="text-destructive">*</span></Label>
              <Input
                id="sub-name"
                placeholder="e.g. Mathematics"
                value={subjectForm.name}
                onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Class Type <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                {["Individual", "Group", "Both"].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSubjectForm(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      subjectForm.type === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {subjectForm.type === "Individual" && "1-on-1 sessions with a single teacher."}
                {subjectForm.type === "Group" && "Shared class with multiple students."}
                {subjectForm.type === "Both" && "Students can choose Individual or Group when enrolling."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-teachers">Teacher(s)</Label>
              <Input
                id="sub-teachers"
                placeholder="e.g. Dr. Sarah Chen, Mr. James Taylor"
                value={subjectForm.teachers}
                onChange={e => setSubjectForm(f => ({ ...f, teachers: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Comma-separated for multiple teachers.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sub-room">Room / Location</Label>
                <Input
                  id="sub-room"
                  placeholder="e.g. Room 101"
                  value={subjectForm.room}
                  onChange={e => setSubjectForm(f => ({ ...f, room: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-days">Days</Label>
                <Input
                  id="sub-days"
                  placeholder="e.g. Mon, Wed, Fri"
                  value={subjectForm.days}
                  onChange={e => setSubjectForm(f => ({ ...f, days: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSubject(false)}>Cancel</Button>
            <Button
              onClick={() => addSubjectMutation.mutate()}
              disabled={!subjectForm.name.trim() || addSubjectMutation.isPending}
            >
              {addSubjectMutation.isPending ? "Creating…" : "Create Subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconcile Results Dialog */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Data Reconcile Report
            </DialogTitle>
          </DialogHeader>
          {reconcileResult && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">{reconcileResult.message}</p>
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${reconcileResult.summary.orphans > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                  {reconcileResult.summary.orphans} orphaned ID{reconcileResult.summary.orphans !== 1 ? "s" : ""}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${reconcileResult.summary.missingExtensions > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                  {reconcileResult.summary.missingExtensions} missing extension row{reconcileResult.summary.missingExtensions !== 1 ? "s" : ""}
                </span>
                {reconcileResult.summary.fixedUpdatedAt > 0 && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                    {reconcileResult.summary.fixedUpdatedAt} UpdatedAt fields backfilled
                  </span>
                )}
              </div>
              {/* Orphan details */}
              {reconcileResult.details?.orphans?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Orphaned IDs</p>
                  <div className="rounded border divide-y text-xs">
                    {reconcileResult.details.orphans.map((o: any, i: number) => (
                      <div key={i} className="px-3 py-2 flex gap-2 text-muted-foreground">
                        <span className="font-mono text-foreground">{o.id}</span>
                        <span>in <strong>{o.tab}</strong> ({o.field})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Missing extensions */}
              {reconcileResult.details?.missingExtensions?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Missing Extension Rows</p>
                  <div className="rounded border divide-y text-xs">
                    {reconcileResult.details.missingExtensions.map((m: any, i: number) => (
                      <div key={i} className="px-3 py-2 text-muted-foreground">
                        <span className="font-mono text-foreground">{m.userId}</span> — no {m.role} extension row
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {reconcileResult.summary.orphans === 0 && reconcileResult.summary.missingExtensions === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All data integrity checks passed.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowReconcileDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
