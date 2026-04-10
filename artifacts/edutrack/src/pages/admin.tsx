import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import {
  Mail, LogOut, ExternalLink, Shield, Users, BookOpen,
  Settings, RefreshCw, Copy, Check, Phone, Pencil, X, Save,
  FlaskConical, AlertTriangle, Columns, ToggleLeft,
  UserCheck, UserX, Trash2, ChevronDown, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSheetConfig } from "@/hooks/use-sheet-config";
import { FEATURE_META, type FeatureKey, setStoredFeatures } from "@/config/features";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

interface ContactInfo { email: string; name: string; }
interface SheetStats { students: number; teachers: number; parents: number; enrollments: number; }
type FeatureState = Record<FeatureKey, boolean>;

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

const FEATURE_KEYS = Object.keys(FEATURE_META) as FeatureKey[];
const DEFAULT_FEATURES: FeatureState = { assessments: true, billing: true, schedule: true };

export default function AdminPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sheetId = localStorage.getItem(SHEET_KEY) || "";
  const { seeding, seedSheet } = useSheetConfig();
  const [seedConfirm, setSeedConfirm] = useState(false);

  // ── User Management ──────────────────────────────────────────────────
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [actioningUser, setActioningUser] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
      const res = await fetch(apiUrl(`/users/deactivate?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUserList(prev => prev.map(u => u.userId === userId ? { ...u, status: "Inactive" } : u));
      toast({ title: "User deactivated", description: "Access revoked. A copy has been saved to the Archive tab." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setActioningUser(null); }
  }

  async function reactivateUser(userId: string) {
    setActioningUser(userId);
    try {
      const res = await fetch(apiUrl(`/users/reactivate?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setUserList(prev => prev.map(u => u.userId === userId ? { ...u, status: "Active" } : u));
      toast({ title: "User reactivated", description: "Access restored." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setActioningUser(null); }
  }

  async function deleteUser(userId: string) {
    setActioningUser(userId);
    try {
      const res = await fetch(apiUrl(`/users/${encodeURIComponent(userId)}?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setUserList(prev => prev.filter(u => u.userId !== userId));
      setDeleteConfirm(null);
      toast({ title: "User deleted", description: "Row removed from Users tab. Access revoked immediately." });
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

  // ── Admin email / developer contact ─────────────────────────────────
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  function loadContact() {
    const qs = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
    fetch(apiUrl(`/admin/contact${qs}`))
      .then(r => r.json())
      .then(d => { if (d.email) setContact(d); })
      .catch(() => {});
  }
  useEffect(() => { loadContact(); }, [sheetId]);

  function startEdit() { setEditEmail(contact?.email || ""); setEditName(contact?.name || ""); setEditing(true); }

  async function saveContact() {
    if (!editEmail.trim()) return;
    if (!sheetId) {
      toast({ title: "No sheet linked", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/admin/contact?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: editEmail.trim(), name: editName.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setContact({ email: editEmail.trim(), name: editName.trim() || "App Developer" });
      setEditing(false);
      toast({ title: "Contact updated", description: "Saved to your Google Sheet." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  function copyEmail() {
    if (!contact?.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Platform stats ───────────────────────────────────────────────────
  const [stats, setStats] = useState<SheetStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  function loadStats() {
    if (!sheetId) return;
    setLoadingStats(true);
    Promise.all([
      fetch(apiUrl(`/sheets/students?sheetId=${sheetId}`)).then(r => r.json()),
      fetch(apiUrl(`/sheets/teachers?sheetId=${sheetId}`)).then(r => r.json()),
      fetch(apiUrl(`/sheets/parents?sheetId=${sheetId}`)).then(r => r.json()),
      fetch(apiUrl(`/sheets/enrollments?sheetId=${sheetId}`)).then(r => r.json()),
    ])
      .then(([students, teachers, parents, enrollments]) => {
        setStats({
          students: Array.isArray(students) ? students.length : 0,
          teachers: Array.isArray(teachers) ? teachers.length : 0,
          parents: Array.isArray(parents) ? parents.length : 0,
          enrollments: Array.isArray(enrollments) ? enrollments.length : 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }
  useEffect(() => { loadStats(); }, [sheetId]);

  // ── Feature toggles ──────────────────────────────────────────────────
  const [features, setFeatures] = useState<FeatureState>(DEFAULT_FEATURES);
  const [savingFeature, setSavingFeature] = useState<FeatureKey | null>(null);
  const [loadingFeatures, setLoadingFeatures] = useState(false);

  function loadFeatures() {
    if (!sheetId) return;
    setLoadingFeatures(true);
    fetch(apiUrl(`/admin/features?sheetId=${encodeURIComponent(sheetId)}`))
      .then(r => r.json())
      .then(d => setFeatures({ ...DEFAULT_FEATURES, ...d }))
      .catch(() => {})
      .finally(() => setLoadingFeatures(false));
  }
  useEffect(() => { loadFeatures(); }, [sheetId]);

  async function toggleFeature(key: FeatureKey, value: boolean) {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Link a Google Sheet in Settings first.", variant: "destructive" });
      return;
    }
    setSavingFeature(key);
    const updated = { ...features, [key]: value };
    try {
      const res = await fetch(apiUrl(`/admin/features?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFeatures(updated);
      setStoredFeatures(updated);
      toast({
        title: `${FEATURE_META[key].label} ${value ? "enabled" : "disabled"}`,
        description: "Sidebar will update on next page navigation.",
      });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally { setSavingFeature(null); }
  }

  // ── Ensure headers (safe) ────────────────────────────────────────────
  const [ensuringHeaders, setEnsuringHeaders] = useState(false);

  async function ensureHeaders() {
    if (!sheetId) {
      toast({ title: "No sheet linked", variant: "destructive" }); return;
    }
    setEnsuringHeaders(true);
    try {
      const res = await fetch(apiUrl(`/sheets/ensure-headers?sheetId=${encodeURIComponent(sheetId)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const addedTabs = data.tabsAdded?.length ?? 0;
      const addedHeaders = data.headersAdded?.length ?? 0;
      toast({
        title: "Sheet columns up to date",
        description: addedTabs > 0 || addedHeaders > 0
          ? `Added ${addedTabs} tab(s) and wrote headers to ${addedHeaders} tab(s). Existing data was not changed.`
          : "All tabs and headers already exist. No changes made.",
      });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setEnsuringHeaders(false); }
  }

  // ── Seed (overwrite) ─────────────────────────────────────────────────
  async function handleSeed() {
    if (!sheetId) {
      toast({ title: "No sheet linked", variant: "destructive" }); return;
    }
    if (!seedConfirm) { setSeedConfirm(true); return; }
    try {
      await seedSheet(sheetId);
      setSeedConfirm(false);
      toast({ title: "Sheet set up successfully", description: "All tabs now have columns and sample data." });
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none">Admin Portal</p>
              <p className="text-xs text-muted-foreground mt-0.5">Developer Access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.primaryEmailAddress?.emailAddress}
            </span>
            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Admin</Badge>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => signOut({ redirectUrl: "/" })}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Developer & Admin overview for EduTrack</p>
        </div>

        {/* Admin Email */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="w-4 h-4 text-purple-600" />
                  Admin Email
                </CardTitle>
                <CardDescription className="mt-1">
                  Shown to principals as the "Contact Developer" button. Stored in your Google Sheet.
                </CardDescription>
              </div>
              {!editing && (
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={startEdit}>
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="dev-name">Your Name</Label>
                    <Input id="dev-name" value={editName} onChange={e => setEditName(e.target.value)} placeholder="App Developer" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dev-email">Your Email</Label>
                    <Input id="dev-email" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={saveContact} disabled={saving || !editEmail.trim()}>
                    {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditing(false)} disabled={saving}>
                    <X className="w-3 h-3" />Cancel
                  </Button>
                </div>
              </div>
            ) : contact ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-2" onClick={copyEmail}>
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={() => window.open(`mailto:${contact.email}`, "_blank")}>
                    <Mail className="w-3 h-3" />Send Email
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground italic">No admin email set. Click Edit to add your details.</p>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
                  <Pencil className="w-3 h-3" />Add Contact Details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ToggleLeft className="w-4 h-4 text-blue-600" />
              Feature Toggles
            </CardTitle>
            <CardDescription>
              Enable or disable features for this school. Changes are saved to the Google Sheet and apply to all users.
              {!sheetId && <span className="block text-amber-600 font-medium mt-1">Link a Google Sheet first to save changes.</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {loadingFeatures ? (
              <p className="text-sm text-muted-foreground py-2">Loading feature settings…</p>
            ) : (
              FEATURE_KEYS.map((key, i) => (
                <div key={key} className={`flex items-center justify-between gap-4 py-4 ${i === 0 ? "pt-0" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{FEATURE_META[key].label}</p>
                    <p className="text-xs text-muted-foreground">{FEATURE_META[key].description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant={features[key] ? "secondary" : "outline"}
                      className={`text-xs ${features[key] ? "bg-green-100 text-green-700" : "text-muted-foreground"}`}
                    >
                      {features[key] ? "On" : "Off"}
                    </Badge>
                    <Switch
                      checked={features[key]}
                      onCheckedChange={v => toggleFeature(key, v)}
                      disabled={savingFeature === key}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Platform Stats */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Platform Overview</h2>
            <Button size="sm" variant="outline" className="gap-2" onClick={loadStats} disabled={loadingStats}>
              <RefreshCw className={`w-3 h-3 ${loadingStats ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Students",    value: stats?.students,    icon: BookOpen, color: "text-blue-600 bg-blue-50" },
              { label: "Teachers",    value: stats?.teachers,    icon: Users,    color: "text-green-600 bg-green-50" },
              { label: "Parents",     value: stats?.parents,     icon: Phone,    color: "text-orange-600 bg-orange-50" },
              { label: "Enrollments", value: stats?.enrollments, icon: BookOpen, color: "text-purple-600 bg-purple-50" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{loadingStats ? "—" : (value ?? "—")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* User Management */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">User Management</h2>
            <Button size="sm" variant="outline" className="gap-2" onClick={loadUsers} disabled={loadingUsers}>
              <RefreshCw className={`w-3 h-3 ${loadingUsers ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {!sheetId ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Link a Google Sheet in Settings to manage users.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>
                  All entries in the Users tab. Role determines which portal they access.
                  Deactivating revokes access immediately and archives the record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Search name, email, or ID…"
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
                        <option value="admin">Admin</option>
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
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading users…</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {userList.length === 0 ? "No users found in the Users tab." : "No users match the current filters."}
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredUsers.map(u => {
                      const statusKey = u.status.toLowerCase();
                      const roleKey = u.role.toLowerCase();
                      const isActioning = actioningUser === u.userId;
                      const isDeleting = deleteConfirm === u.userId;
                      return (
                        <div key={u.userId} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-foreground">{u.name || u.email}</span>
                                <Badge className={`text-xs px-1.5 py-0 ${ROLE_COLORS[roleKey] || "bg-muted text-muted-foreground"}`}>
                                  {u.role || "—"}
                                </Badge>
                                <Badge className={`text-xs px-1.5 py-0 ${STATUS_COLORS[statusKey] || "bg-muted text-muted-foreground"}`}>
                                  {u.status || "—"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                <span className="font-mono">{u.userId || "—"}</span>
                                <span>·</span>
                                <span>{u.email}</span>
                                {u.addedDate && <><span>·</span><span>Added {u.addedDate}</span></>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isDeleting ? (
                                <>
                                  <Button size="sm" className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700" onClick={() => deleteUser(u.userId)} disabled={isActioning}>
                                    {isActioning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Confirm Delete
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeleteConfirm(null)} disabled={isActioning}>Cancel</Button>
                                </>
                              ) : (
                                <>
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
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => setDeleteConfirm(u.userId)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground pt-1">
                  {filteredUsers.length} of {userList.length} user{userList.length !== 1 ? "s" : ""} shown
                  {userList.length > 0 && " · Changes take effect on next sign-in"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setLocation("/settings")}>
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">Settings</p>
                <p className="text-xs text-muted-foreground">Manage sheet link</p>
              </div>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setLocation("/principal")}>
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">Principal Dashboard</p>
                <p className="text-xs text-muted-foreground">View as principal</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                if (sheetId) window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, "_blank");
                else toast({ title: "No sheet linked" });
              }}
            >
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">Open Google Sheet</p>
                <p className="text-xs text-muted-foreground">View raw data</p>
              </div>
            </Button>
          </div>
        </div>

        {/* Developer Tools */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Developer Tools</h2>
          <div className="space-y-4">

            {/* Add Missing Columns — safe */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Columns className="w-4 h-4 text-blue-600" />
                  Add Missing Tabs &amp; Columns
                </CardTitle>
                <CardDescription>
                  Checks the Google Sheet for any missing tabs or empty header rows and adds them.
                  <span className="block mt-1 text-green-700 font-medium">Safe — does not overwrite or delete any existing data.</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!sheetId ? (
                  <p className="text-sm text-muted-foreground">Link a Google Sheet in Settings first.</p>
                ) : (
                  <Button
                    size="sm"
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={ensureHeaders}
                    disabled={ensuringHeaders}
                  >
                    {ensuringHeaders
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <Columns className="w-3 h-3" />
                    }
                    {ensuringHeaders ? "Checking…" : "Add missing tabs & columns"}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Seed — overwrites everything */}
            <Card className="border-amber-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="w-4 h-4 text-amber-600" />
                  Set Up Columns &amp; Sample Data
                </CardTitle>
                <CardDescription>
                  Creates all required tabs and writes correct headers. Populates sample data for testing.
                  <span className="block mt-1 font-medium text-amber-700">Warning: overwrites all existing data in every tab.</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!sheetId ? (
                  <p className="text-sm text-muted-foreground">Link a Google Sheet in Settings first.</p>
                ) : seedConfirm ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">This will <strong>overwrite all data</strong> in your Google Sheet. Are you sure?</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-2 bg-red-600 hover:bg-red-700" onClick={handleSeed} disabled={seeding}>
                        {seeding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                        {seeding ? "Setting up…" : "Yes, overwrite everything"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSeedConfirm(false)} disabled={seeding}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSeed}>
                    <FlaskConical className="w-3 h-3" />
                    Set up columns &amp; add sample data
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </main>
    </div>
  );
}
