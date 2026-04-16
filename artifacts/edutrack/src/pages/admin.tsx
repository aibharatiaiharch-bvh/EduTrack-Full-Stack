import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  GraduationCap, LogOut, Users, Shield, Database, Wrench,
  CheckCircle2, XCircle, RefreshCw, ExternalLink, ChevronRight,
  BookOpen, UserCheck, ClipboardList, UserPlus, Eye, Loader2,
  AlertTriangle, Activity,
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

type Tab = "overview" | "navigate" | "data" | "tools";

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

function OverviewTab() {
  const [health, setHealth] = useState<"loading" | "ok" | "error">("loading");
  const [config, setConfig] = useState<{ sheetId?: string } | null>(null);

  async function checkHealth() {
    setHealth("loading");
    try {
      const res = await fetch(apiUrl("/healthz"));
      setHealth(res.ok ? "ok" : "error");
    } catch { setHealth("error"); }
  }

  useEffect(() => {
    checkHealth();
    fetch(apiUrl("/config")).then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  const sid = sheetId();
  const sheetUrl = sid ? `https://docs.google.com/spreadsheets/d/${sid}` : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

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

function ToolsTab() {
  const sid = sheetId();

  async function runTool(path: string, successMsg: string) {
    if (!sid) throw new Error("No Sheet ID set — link a sheet first.");
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

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These tools operate on the linked Google Sheet. Sheet ID: {" "}
        <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">{sid || "not set"}</code>
      </p>

      <ToolButton
        label="Health Check"
        desc="Ping the API server and confirm it is responding."
        action={checkHealth}
      />

      <ToolButton
        label="Setup Sheet Tabs"
        desc="Creates any missing tabs (Users, Students, Teachers, Subjects, Enrollments, Attendance, etc.) with correct headers."
        action={() => runTool("/sheets/setup", "Sheet tabs created / verified ✓")}
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
        desc="Loads sample users, students, tutors, classes, and enrollments into the sheet for testing. Will add rows — does not delete existing data."
        action={() => runTool("/sheets/seed", "Demo data seeded ✓")}
      />
    </div>
  );
}

// ─── Main Admin Portal ────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",  label: "Overview",    icon: <Activity className="w-4 h-4" /> },
  { id: "navigate",  label: "View as Role", icon: <Eye className="w-4 h-4" /> },
  { id: "data",      label: "Data Browser", icon: <Database className="w-4 h-4" /> },
  { id: "tools",     label: "Dev Tools",    icon: <Wrench className="w-4 h-4" /> },
];

export default function AdminPortal() {
  const signOut = useSignOut();
  const name = localStorage.getItem("edutrack_user_name") || "Developer";
  const [tab, setTab] = useState<Tab>("overview");

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
      </main>
    </div>
  );
}
