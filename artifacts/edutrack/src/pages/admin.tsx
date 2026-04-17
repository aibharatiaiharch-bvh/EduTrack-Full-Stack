import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { BulkUploadCard } from "@/components/BulkUploadCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, LogOut, Users, Shield, Database, Wrench,
  CheckCircle2, XCircle, RefreshCw, ExternalLink, ChevronRight,
  BookOpen, UserCheck, ClipboardList, UserPlus, Eye, Loader2,
  AlertTriangle, Activity, GitBranch, Plus, Upload, Bell, BellOff, Send,
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

type Tab = "overview" | "navigate" | "data" | "tools" | "upload";

const SHEET_TABS = [
  { key: "users",       label: "Users" },
  { key: "students",    label: "Students" },
  { key: "teachers",    label: "Teachers" },
  { key: "subjects",    label: "Subjects" },
  { key: "enrollments", label: "Enrollments" },
  { key: "attendance",  label: "Attendance" },
  { key: "parents",     label: "Parents" },
  { key: "announcements", label: "Announcements" },
  { key: "pushSubscriptions", label: "Push Subscriptions" },
];

// ─── Overview Tab ────────────────────────────────────────────────────────────

type SyncStatus = { lastSyncedAt: string | null; branch: string | null; commitHash: string | null; commitMessage: string | null };

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type GithubSyncStatus = {
  status: "ok" | "failed" | "no_token" | "unknown";
  message: string;
  failureCount: number;
  lastAttemptAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
};

function OverviewTab() {
  const [health, setHealth] = useState<"loading" | "ok" | "error">("loading");
  const [config, setConfig] = useState<{ sheetId?: string } | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(true);
  const [githubSync, setGithubSync] = useState<GithubSyncStatus | null>(null);

  async function checkHealth() {
    setHealth("loading");
    try {
      const res = await fetch(apiUrl("/healthz"));
      setHealth(res.ok ? "ok" : "error");
    } catch { setHealth("error"); }
  }

  async function fetchSync() {
    setSyncLoading(true);
    try {
      const res = await fetch(apiUrl("/admin/github-sync"));
      const data = await res.json();
      setSync(data);
    } catch { setSync({ lastSyncedAt: null, branch: null, commitHash: null, commitMessage: null }); }
    setSyncLoading(false);
  }

  async function fetchGithubSyncStatus() {
    try {
      const res = await fetch(apiUrl("/github-sync-status"));
      if (res.ok) setGithubSync(await res.json());
    } catch { /* silently ignore */ }
  }

  useEffect(() => {
    checkHealth();
    fetch(apiUrl("/config")).then(r => r.json()).then(setConfig).catch(() => {});
    fetchSync();
    fetchGithubSyncStatus();
    const interval = setInterval(fetchSync, 60_000);
    return () => clearInterval(interval);
  }, []);

  const sid = sheetId();
  const sheetUrl = sid ? `https://docs.google.com/spreadsheets/d/${sid}` : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Health */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">API Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {health === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {health === "ok"      && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              {health === "error"   && <XCircle className="h-5 w-5 text-red-500" />}
              <span className={`font-semibold text-sm ${health === "ok" ? "text-green-700" : health === "error" ? "text-red-600" : "text-muted-foreground"}`}>
                {health === "loading" ? "Checking…" : health === "ok" ? "Online" : "Offline"}
              </span>
            </div>
            <button onClick={checkHealth} className="text-xs text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Recheck
            </button>
          </CardContent>
        </Card>

        {/* Sheet ID */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Google Sheet</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {sid ? (
              <>
                <p className="text-xs font-mono text-muted-foreground truncate">{sid}</p>
                <a href={sheetUrl!} target="_blank" rel="noreferrer"
                  className="text-xs text-primary hover:underline mt-2 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Open Sheet
                </a>
              </>
            ) : (
              <p className="text-xs text-amber-600">No Sheet ID linked</p>
            )}
          </CardContent>
        </Card>

        {/* Session */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Session</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{localStorage.getItem("edutrack_user_name") || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{localStorage.getItem("edutrack_user_email") || "—"}</p>
            <Badge variant="secondary" className="mt-1.5 text-xs">developer</Badge>
          </CardContent>
        </Card>

        {/* GitHub Sync */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">GitHub Sync</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {syncLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Checking…</span>
              </div>
            ) : sync?.lastSyncedAt ? (
              <>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span
                    className="text-sm font-semibold text-green-700 cursor-default"
                    title={new Date(sync.lastSyncedAt).toLocaleString()}
                  >
                    {timeAgo(sync.lastSyncedAt)}
                  </span>
                </div>
                {sync.branch && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate">branch: {sync.branch}</p>
                )}
                {sync.commitHash && (
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate" title={sync.commitMessage ?? undefined}>
                    <span className="text-foreground/70">{sync.commitHash}</span>
                    {sync.commitMessage && <span className="text-muted-foreground"> {sync.commitMessage}</span>}
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm text-amber-600">No sync recorded</span>
              </div>
            )}
            <button onClick={fetchSync} className="text-xs text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Recheck
            </button>
          </CardContent>
        </Card>
      </div>

      {/* GitHub Sync Status Alert */}
      {githubSync && (githubSync.status === "failed" || githubSync.status === "no_token") && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              GitHub sync failed
              {githubSync.failureCount > 1 ? ` (${githubSync.failureCount} consecutive failures)` : ""}
            </p>
            <p className="text-xs text-red-600 mt-0.5">{githubSync.message}</p>
            {githubSync.lastFailedAt && (
              <p className="text-xs text-red-500 mt-1">
                Last failed: {new Date(githubSync.lastFailedAt).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-red-500 mt-0.5">
              Check that <code className="font-mono">GITHUB_TOKEN</code> is valid and the repository allows pushes.
            </p>
          </div>
          <button
            onClick={fetchGithubSyncStatus}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 shrink-0"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      )}

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "Public Enrollment Form", path: "/enroll", icon: <UserPlus className="h-4 w-4" />, desc: "Shareable link for new students & tutors" },
            { label: "Principal Dashboard",    path: "/principal", icon: <ClipboardList className="h-4 w-4" />, desc: "Enrollment requests, students, tutors" },
            { label: "Tutor Portal",           path: "/tutor", icon: <UserCheck className="h-4 w-4" />, desc: "Class schedule & attendance marking" },
            { label: "Student Portal",         path: "/student", icon: <BookOpen className="h-4 w-4" />, desc: "Enrolled classes & cancellation" },
          ].map(link => (
            <a key={link.path} href={link.path}
              className="flex items-start gap-3 p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors">
              <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {link.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 mt-0.5" />
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Navigate As Role ─────────────────────────────────────────────────────────

function NavigateTab() {
  const [, setLocation] = useLocation();
  const [sheetOverride, setSheetOverride] = useState(sheetId());

  function goAs(path: string) {
    if (sheetOverride && sheetOverride !== sheetId()) {
      localStorage.setItem("edutrack_sheet_id", sheetOverride);
    }
    setLocation(path);
  }

  const portals = [
    {
      label: "Principal Dashboard",
      path: "/principal",
      icon: <ClipboardList className="h-8 w-8" />,
      color: "bg-violet-100 text-violet-700",
      desc: "6 tabs — enrollment requests, late cancellations, students, tutors, classes, users",
    },
    {
      label: "Tutor Portal",
      path: "/tutor",
      icon: <UserCheck className="h-8 w-8" />,
      color: "bg-blue-100 text-blue-700",
      desc: "Class schedule, per-class student lists, attendance marking",
    },
    {
      label: "Student Portal",
      path: "/student",
      icon: <BookOpen className="h-8 w-8" />,
      color: "bg-green-100 text-green-700",
      desc: "Enrolled classes, Zoom links, cancellation with late-cancel detection",
    },
    {
      label: "Enrollment Form",
      path: "/enroll",
      icon: <UserPlus className="h-8 w-8" />,
      color: "bg-amber-100 text-amber-700",
      desc: "Public form — no login required. Student & tutor application flow",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          As a developer your session bypasses all role checks — you can navigate to any portal directly.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">Sheet ID to use when navigating</label>
        <div className="flex gap-2">
          <Input
            value={sheetOverride}
            onChange={e => setSheetOverride(e.target.value)}
            placeholder="Google Sheet ID"
            className="font-mono text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => setSheetOverride(sheetId())}>Reset</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {portals.map(p => (
          <button key={p.path} onClick={() => goAs(p.path)}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${p.color}`}>
              {p.icon}
            </div>
            <div className="w-full">
              <p className="font-semibold text-foreground text-center">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-1 text-center">{p.desc}</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-primary font-medium">
              <Eye className="h-3.5 w-3.5" /> View as this role
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Data Browser ─────────────────────────────────────────────────────────────

function DataTab() {
  const [activeTab, setActiveTab] = useState("users");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTab = useCallback(async (tabKey: string) => {
    const sid = sheetId();
    if (!sid) { setError("No Sheet ID set."); return; }
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await apiFetch(`/sheets/${tabKey}`);
      if (Array.isArray(data)) setRows(data);
      else if (data?.error) setError(data.error);
      else setError("Unexpected response.");
    } catch { setError("Connection error."); }
    setLoading(false);
  }, []);

  useEffect(() => { loadTab(activeTab); }, [activeTab]);

  const columns = rows.length > 0
    ? Object.keys(rows[0]).filter(k => k !== "_row")
    : [];

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-1.5 flex-wrap">
        {SHEET_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => loadTab(activeTab)}
          className="px-3 py-1.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {activeTab}…
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-10">#</th>
                {columns.map(col => (
                  <th key={col} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <tr key={row._row ?? i} className="hover:bg-muted/40 transition-colors">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row._row ?? i + 1}</td>
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2 max-w-[220px]">
                      <span className="truncate block text-xs" title={String(row[col] ?? "")}>
                        {String(row[col] ?? "")}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t bg-muted/40 text-xs text-muted-foreground">
            {rows.length} row{rows.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="py-10 text-center text-muted-foreground text-sm border rounded-lg">
          No rows found in the {SHEET_TABS.find(t => t.key === activeTab)?.label} tab.
        </div>
      )}
    </div>
  );
}

// ─── Tools Tab ────────────────────────────────────────────────────────────────

type ToolStatus = "idle" | "running" | "ok" | "error";

function ToolButton({
  label, desc, action, variant = "default",
}: {
  label: string;
  desc: string;
  action: () => Promise<string>;
  variant?: "default" | "destructive";
}) {
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [result, setResult] = useState("");

  async function run() {
    setStatus("running");
    setResult("");
    try {
      const msg = await action();
      setResult(msg);
      setStatus("ok");
    } catch (e: any) {
      setResult(e.message || "Failed");
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 8000);
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
        {result && (
          <p className={`text-xs mt-1 ${status === "ok" ? "text-green-600" : "text-red-600"}`}>
            {result}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant={variant === "destructive" ? "destructive" : "outline"}
        onClick={run}
        disabled={status === "running"}
        className="shrink-0 gap-1.5"
      >
        {status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
         status === "ok"      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> :
         status === "error"   ? <XCircle className="h-3.5 w-3.5 text-red-500" /> :
                                <Wrench className="h-3.5 w-3.5" />}
        {status === "running" ? "Running…" : "Run"}
      </Button>
    </div>
  );
}

type NewSheetResult = { spreadsheetId: string; spreadsheetUrl: string; tabs: string[] };

const SHEET_PREVIEW = [
  {
    tab: "Users",
    headers: ["UserID", "Email", "Role", "Name", "Status", "CreatedAt", "UpdatedAt"],
    samples: [
      ["PRN-001", "p.anderson@edutrack.edu", "principal", "Principal Anderson", "Active"],
      ["TCH-001", "s.chen@edutrack.edu",     "tutor",     "Dr. Sarah Chen",     "Active"],
      ["STU-001", "emma.j@student.com",      "student",   "Emma Johnson",       "Active"],
      ["PAR-001", "sarah.johnson@gmail.com", "parent",    "Sarah Johnson",      "Active"],
    ],
  },
  {
    tab: "Students",
    headers: ["StudentID", "UserID", "Name", "ParentID", "Classes", "Phone", "Notes", "CurrentSchool", "CurrentGrade", "PreviousStudent"],
    samples: [
      ["STU-001", "STU-001", "Emma Johnson", "PAR-001", "SUB-001; SUB-005", "555-0101", "", "Riverside High",    "Year 10", "No"],
      ["STU-002", "STU-002", "Liam Smith",   "PAR-002", "SUB-001; SUB-004", "555-0102", "", "Northside College", "Year 9",  "Yes"],
      ["STU-003", "STU-003", "Olivia Brown", "PAR-003", "SUB-005; SUB-007", "555-0103", "", "Westview Academy",  "Year 11", "No"],
    ],
  },
  {
    tab: "Teachers",
    headers: ["TeacherID", "UserID", "Name", "Subjects", "Zoom Link", "Specialty", "Notes"],
    samples: [
      ["TCH-001", "TCH-001", "Dr. Sarah Chen",   "Mathematics, Science",    "https://zoom.us/j/555001", "STEM",          ""],
      ["TCH-002", "TCH-002", "Mr. James Taylor", "English",                 "https://zoom.us/j/555002", "Literacy",      ""],
      ["TCH-003", "TCH-003", "Ms. Rachel Kim",   "Art, Physical Education", "https://zoom.us/j/555003", "Creative Arts", ""],
    ],
  },
  {
    tab: "Subjects",
    headers: ["SubjectID", "Name", "Type", "TeacherID", "Room", "Days", "Time", "Status", "MaxCapacity"],
    samples: [
      ["SUB-001", "Mathematics",        "Individual", "TCH-001", "Room 101", "Mon, Wed",      "10:00 AM", "Active", "1"],
      ["SUB-002", "Mathematics",        "Group",      "TCH-001", "Room 101", "Tue, Thu",      "09:00 AM", "Active", "8"],
      ["SUB-004", "English",            "Group",      "TCH-002", "Room 201", "Tue, Thu, Fri", "11:00 AM", "Active", "8"],
      ["SUB-008", "Physical Education", "Group",      "TCH-003", "Gym",      "Mon, Fri",      "09:00 AM", "Active", "8"],
    ],
  },
  {
    tab: "Enrollments",
    headers: ["EnrollmentID", "UserID", "Student Name", "ClassID", "ParentID", "Status", "EnrolledAt", "TeacherID", "Teacher Name", "TeacherEmail", "Zoom Link", "Class Type", "ClassDate", "ClassTime"],
    samples: [
      ["ENR-001", "STU-001", "Emma Johnson", "SUB-001", "PAR-001", "Active",            "…", "TCH-001", "Dr. Sarah Chen",   "s.chen@edutrack.edu",   "…", "Individual", "+7 days", "10:00 AM"],
      ["ENR-006", "STU-003", "Olivia Brown", "SUB-007", "PAR-003", "Pending",           "…", "TCH-003", "Ms. Rachel Kim",   "r.kim@edutrack.edu",    "…", "Group",      "+10 days","03:00 PM"],
      ["ENR-014", "STU-001", "Emma Johnson", "SUB-002", "PAR-001", "Late Cancellation", "…", "TCH-001", "Dr. Sarah Chen",   "s.chen@edutrack.edu",   "…", "Group",      "-1 day",  "09:00 AM"],
    ],
  },
  {
    tab: "Attendance",
    headers: ["AttendanceID", "ClassID", "UserID", "SessionDate", "Status", "Notes", "MarkedBy", "MarkedAt"],
    samples: [
      ["ATT-001", "SUB-001", "STU-001", "yesterday", "Present", "",                     "TCH-001", "…"],
      ["ATT-002", "SUB-001", "STU-002", "yesterday", "Absent",  "Sick - parent called", "TCH-001", "…"],
      ["ATT-004", "SUB-004", "STU-004", "yesterday", "Late",    "Arrived 10 min late",  "TCH-002", "…"],
    ],
  },
  {
    tab: "Parents",
    headers: ["ParentID", "UserID", "Name", "Children", "Phone", "Notes"],
    samples: [
      ["PAR-001", "PAR-001", "Sarah Johnson", "STU-001; STU-005", "555-0201", ""],
      ["PAR-002", "PAR-002", "Mike Smith",    "STU-002",          "555-0202", ""],
    ],
  },
  {
    tab: "Announcements",
    headers: ["AnnouncementID", "Title", "Message", "Priority", "IsActive", "CreatedAt"],
    samples: [
      ["ANN-001", "Term 2 Enrolments Open", "Term 2 enrolments are now open…", "Standard", "true", "today"],
      ["ANN-002", "Public Holiday Closure",  "EduTrack will be closed 22 April…", "Urgent", "true", "today"],
    ],
  },
  {
    tab: "PushSubscriptions",
    headers: ["SubscriptionID", "UserID", "Endpoint", "Keys", "CreatedAt"],
    samples: [],
  },
];

function SheetPreview() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Eye className="w-3.5 h-3.5" />
          Preview: {SHEET_PREVIEW.length} tabs · headers · sample rows
        </span>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="border-t">
          {/* Tab pills */}
          <div className="flex gap-1 p-2 flex-wrap border-b bg-muted/30">
            {SHEET_PREVIEW.map((t, i) => (
              <button
                key={t.tab}
                onClick={() => setActiveTab(i)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border hover:border-primary hover:text-primary"
                }`}
              >
                {t.tab}
              </button>
            ))}
          </div>

          {/* Selected tab detail */}
          {(() => {
            const t = SHEET_PREVIEW[activeTab];
            return (
              <div className="p-3 space-y-3">
                {/* Headers */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Columns ({t.headers.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {t.headers.map((h, i) => (
                      <span key={h}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-mono">
                        <span className="text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                        {h}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sample rows */}
                {t.samples.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Sample data ({t.samples.length} shown)
                    </p>
                    <div className="overflow-auto rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {t.headers.map(h => (
                              <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {t.samples.map((row, ri) => (
                            <tr key={ri} className="hover:bg-muted/30">
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-2 py-1.5 whitespace-nowrap max-w-[160px] truncate">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No sample rows — populated by the app at runtime.</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function CreateSheetCard() {
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<NewSheetResult | null>(null);
  const [saved, setSaved] = useState(false);

  async function create() {
    setStatus("running");
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch(apiUrl("/sheets/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create sheet");
      setResult(data);
      setStatus("ok");
    } catch (e: any) {
      setError(e.message || "Unknown error");
      setStatus("error");
    }
  }

  function useThisSheet() {
    if (!result) return;
    localStorage.setItem("edutrack_sheet_id", result.spreadsheetId);
    setSaved(true);
  }

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Database className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">Create New EduTrack Sheet in My Drive</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Creates a brand-new Google Spreadsheet named <strong>"EduTrack Data"</strong> in your connected Drive account,
            sets up all 9 tabs with correct column headers, and pre-fills with sample data so the app works immediately.
          </p>
        </div>
      </div>

      <SheetPreview />

      {status === "idle" && (
        <Button onClick={create} className="w-full gap-2">
          <Database className="w-4 h-4" />
          Create Sheet + Sample Data in My Drive
        </Button>
      )}

      {status === "running" && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Creating sheet in your Drive… this takes a few seconds
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={create} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}

      {status === "ok" && result && (
        <div className="space-y-3 p-4 rounded-lg border border-green-200 bg-green-50">
          <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Sheet created with {result.tabs.length} tabs + sample data!
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-green-800">Sheet ID</p>
            <code className="block text-xs font-mono bg-white border border-green-200 rounded px-2 py-1.5 text-foreground break-all">
              {result.spreadsheetId}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={result.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-green-200 text-green-800 text-xs font-medium hover:bg-green-50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Sheet in Google Drive
            </a>

            {!saved ? (
              <Button size="sm" onClick={useThisSheet} className="gap-1.5 text-xs h-7">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Use this sheet in the app
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved as active sheet
              </span>
            )}
          </div>

          {saved && (
            <p className="text-xs text-green-700">
              This sheet is now active. Reload the page or navigate to any portal to see your data.
              Remember to also set <code className="font-mono bg-white px-0.5 rounded">DEFAULT_SHEET_ID={result.spreadsheetId}</code> in your Railway environment variables for production.
            </p>
          )}
        </div>
      )}

      {status === "ok" && (
        <button onClick={() => { setStatus("idle"); setResult(null); setSaved(false); }}
          className="text-xs text-muted-foreground hover:text-foreground underline">
          Create another sheet
        </button>
      )}
    </div>
  );
}

function AddSubjectCard() {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Group", days: "", time: "", room: "", maxCapacity: "8", teacherName: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setResult(null);
    try {
      const sid = sheetId();
      const res = await fetch(apiUrl("/subjects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: sid,
          name: form.name,
          type: form.type,
          teachers: form.teacherName,
          days: form.days,
          time: form.time,
          room: form.room,
          maxCapacity: form.maxCapacity,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, msg: `Class "${form.name}" created (${data.subjectId})` });
        setForm({ name: "", type: "Group", days: "", time: "", room: "", maxCapacity: "8", teacherName: "" });
        setShow(false);
      } else {
        setResult({ ok: false, msg: data.error || "Failed to create class." });
      }
    } catch { setResult({ ok: false, msg: "Connection error." }); }
    setSubmitting(false);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">Add New Class</p>
          <p className="text-xs text-muted-foreground">Create a new subject / class in the Google Sheet.</p>
          {result && (
            <p className={`text-xs mt-1 ${result.ok ? "text-green-600" : "text-red-600"}`}>{result.msg}</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => { setShow(s => !s); setResult(null); }} className="shrink-0 gap-1.5">
          <Plus className="h-3.5 w-3.5" />{show ? "Cancel" : "Add"}
        </Button>
      </div>
      {show && (
        <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Class Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Maths Year 5" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type <span className="text-destructive">*</span></Label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="Group">Group</option>
                <option value="Individual">Individual</option>
                <option value="Both">Both</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Days</Label>
              <Input value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} placeholder="e.g. Mon, Wed" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Time</Label>
              <Input value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} placeholder="e.g. 4:00 PM" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Room</Label>
              <Input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 3" className="h-8 text-sm" />
            </div>
            {(form.type === "Group" || form.type === "Both") && (
              <div className="space-y-1">
                <Label className="text-xs">Max Capacity</Label>
                <Input type="number" min="1" value={form.maxCapacity} onChange={e => setForm(f => ({ ...f, maxCapacity: e.target.value }))} placeholder="8" className="h-8 text-sm" />
              </div>
            )}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Teacher Name (optional)</Label>
              <Input value={form.teacherName} onChange={e => setForm(f => ({ ...f, teacherName: e.target.value }))} placeholder="e.g. Sarah Johnson" className="h-8 text-sm" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />{submitting ? "Saving…" : "Create Class"}
          </Button>
        </form>
      )}
    </div>
  );
}

function BackupCard() {
  const [status, setStatus] = useState<any>(null);
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  async function load() {
    try {
      const res = await fetch(apiUrl("/backup/status"));
      setStatus(await res.json());
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function toggle() {
    setToggling(true);
    try {
      const res = await fetch(apiUrl("/backup/toggle"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !status?.enabled }),
      });
      const data = await res.json();
      setStatus((s: any) => ({ ...s, enabled: data.enabled }));
    } catch {}
    setToggling(false);
  }

  async function sendNow() {
    setSending(true);
    setSendResult("");
    try {
      const sid = sheetId();
      const res = await fetch(apiUrl("/backup/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sid }),
      });
      const data = await res.json();
      setSendResult(data.ok ? `Sent to ${data.recipient} ✓` : (data.error || "Failed"));
    } catch (e: any) {
      setSendResult(e.message || "Failed");
    }
    setSending(false);
  }

  const enabled = status?.enabled ?? true;
  const emailOk = status?.emailConfigured;
  const recipients: string[] = status?.recipients || [];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-1.5">
            {enabled ? <Bell className="w-3.5 h-3.5 text-green-600" /> : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
            Daily Backup Email
          </p>
          <p className="text-xs text-muted-foreground">
            {emailOk
              ? `Runs ${status?.scheduleHuman || "daily at 7:00 AM"} — sends CSV export to:`
              : "Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS to enable."}
          </p>
          {emailOk && recipients.length > 0 && (
            <p className="text-xs font-mono text-foreground">{recipients.join(", ")}</p>
          )}
          {sendResult && (
            <p className={`text-xs mt-1 ${sendResult.includes("✓") ? "text-green-600" : "text-red-600"}`}>{sendResult}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {emailOk && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={sendNow} disabled={sending}>
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send Now
            </Button>
          )}
          <Button
            size="sm"
            variant={enabled ? "outline" : "default"}
            className={`gap-1.5 text-xs ${enabled ? "text-red-600 border-red-200 hover:bg-red-50" : ""}`}
            onClick={toggle}
            disabled={toggling || !emailOk}
          >
            {toggling ? <Loader2 className="w-3 h-3 animate-spin" /> : enabled ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolsTab() {
  const [manualId, setManualId] = useState("");

  function activeSid(): string {
    return manualId.trim() || sheetId();
  }

  function saveManual() {
    const v = manualId.trim();
    if (v) { localStorage.setItem("edutrack_sheet_id", v); setManualId(""); }
  }

  async function runTool(path: string, successMsg: string) {
    const sid = activeSid();
    if (!sid) throw new Error("No Sheet ID — paste it in the field below first.");
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: sid }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return successMsg;
  }

  async function checkHealth() {
    const res = await fetch(apiUrl("/healthz"));
    const data = await res.json();
    return `API is ${data.status || "ok"} ✓`;
  }

  const stored = sheetId();

  return (
    <div className="space-y-4">
      <CreateSheetCard />

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium px-1">Manage existing linked sheet</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Sheet ID row — always visible, editable */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">Active Sheet ID</p>
        {stored ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded border truncate">{stored}</code>
            <a href={`https://docs.google.com/spreadsheets/d/${stored}`} target="_blank" rel="noreferrer"
              className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Open
            </a>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              placeholder="Paste your Google Sheet ID here"
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={saveManual} disabled={!manualId.trim()}>
              Save
            </Button>
          </div>
        )}
        {stored && (
          <button onClick={() => { localStorage.removeItem("edutrack_sheet_id"); window.location.reload(); }}
            className="text-xs text-muted-foreground hover:text-destructive underline">
            Change sheet ID
          </button>
        )}
      </div>

      <AddSubjectCard />

      <ToolButton
        label="Health Check"
        desc="Ping the API server and confirm it is responding."
        action={checkHealth}
      />

      <ToolButton
        label="Ensure Headers"
        desc="Checks every tab's header row and adds any missing columns. Safe to run on existing data."
        action={() => runTool("/sheets/ensure-headers", "Headers verified and updated ✓")}
      />

      <ToolButton
        label="Apply Validation"
        desc="Adds dropdown validation (Status, Role) to sheet columns so data entry is consistent."
        action={() => runTool("/sheets/apply-validation", "Validation rules applied ✓")}
      />

      <ToolButton
        label="Seed Demo Data"
        desc="Clears and re-fills every tab with sample data. Use this to reset the sheet to a clean demo state."
        action={() => runTool("/sheets/seed", "Demo data seeded ✓")}
      />

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium px-1">Backup &amp; notifications</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <BackupCard />

    </div>
  );
}

// ─── Main Admin Portal ────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",  label: "Overview",    icon: <Activity className="w-4 h-4" /> },
  { id: "navigate",  label: "View as Role", icon: <Eye className="w-4 h-4" /> },
  { id: "data",      label: "Data Browser", icon: <Database className="w-4 h-4" /> },
  { id: "tools",     label: "Dev Tools",    icon: <Wrench className="w-4 h-4" /> },
  { id: "upload",    label: "Mass Upload",  icon: <Upload className="w-4 h-4" /> },
];

export default function AdminPortal() {
  const signOut = useSignOut();
  const name = localStorage.getItem("edutrack_user_name") || "Developer";
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    localStorage.setItem("edutrack_user_role", "developer");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">EduTrack</span>
          <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
            Developer
          </span>
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
        <div className="flex gap-1 overflow-x-auto max-w-4xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {tab === "overview" && <OverviewTab />}
        {tab === "navigate" && <NavigateTab />}
        {tab === "data"     && <DataTab />}
        {tab === "tools"    && <ToolsTab />}
        {tab === "upload"   && <BulkUploadCard />}
      </main>
    </div>
  );
}
