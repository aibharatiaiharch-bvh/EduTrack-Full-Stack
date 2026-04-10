import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import {
  Mail, LogOut, ExternalLink, Shield, Users, BookOpen,
  Settings, RefreshCw, Copy, Check, Phone, Pencil, X, Save,
  FlaskConical, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSheetConfig } from "@/hooks/use-sheet-config";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

interface ContactInfo {
  email: string;
  name: string;
}

interface SheetStats {
  students: number;
  teachers: number;
  parents: number;
  enrollments: number;
}

export default function AdminPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const sheetId = localStorage.getItem(SHEET_KEY) || "";

  // Seeding
  const { seeding, seedSheet } = useSheetConfig();
  const [seedConfirm, setSeedConfirm] = useState(false);

  async function handleSeed() {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Go to Settings to link a Google Sheet first.", variant: "destructive" });
      return;
    }
    if (!seedConfirm) { setSeedConfirm(true); return; }
    try {
      await seedSheet(sheetId);
      setSeedConfirm(false);
      toast({ title: "Sheet set up successfully", description: "All tabs now have correct columns and sample data." });
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    }
  }

  // Contact state
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Stats state
  const [stats, setStats] = useState<SheetStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  function loadContact() {
    const qs = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
    fetch(apiUrl(`/admin/contact${qs}`))
      .then((r) => r.json())
      .then((d) => { if (d.email) setContact(d); })
      .catch(() => {});
  }

  useEffect(() => { loadContact(); }, [sheetId]);

  function startEdit() {
    setEditEmail(contact?.email || "");
    setEditName(contact?.name || "");
    setEditing(true);
  }

  async function saveContact() {
    if (!editEmail.trim()) return;
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Go to Settings to link your Google Sheet first.", variant: "destructive" });
      return;
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
      toast({ title: "Contact updated", description: "Your developer contact details have been saved to the sheet." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function copyEmail() {
    if (!contact?.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function loadStats() {
    if (!sheetId) return;
    setLoadingStats(true);
    Promise.all([
      fetch(apiUrl(`/sheets/students?sheetId=${sheetId}`)).then((r) => r.json()),
      fetch(apiUrl(`/sheets/teachers?sheetId=${sheetId}`)).then((r) => r.json()),
      fetch(apiUrl(`/sheets/parents?sheetId=${sheetId}`)).then((r) => r.json()),
      fetch(apiUrl(`/sheets/enrollments?sheetId=${sheetId}`)).then((r) => r.json()),
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => signOut({ redirectUrl: "/" })}
            >
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
          <p className="text-muted-foreground text-sm mt-1">
            Developer & Admin overview for EduTrack
          </p>
        </div>

        {/* Developer Contact Card */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="w-4 h-4 text-purple-600" />
                  Developer Contact
                </CardTitle>
                <CardDescription className="mt-1">
                  Shown to clients on their dashboard so they can reach you. Stored in your Google Sheet — only admins can edit this.
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
                    <Input
                      id="dev-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="App Developer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dev-email">Your Email</Label>
                    <Input
                      id="dev-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={saveContact} disabled={saving || !editEmail.trim()}>
                    {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditing(false)} disabled={saving}>
                    <X className="w-3 h-3" />
                    Cancel
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
                  <Button
                    size="sm"
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                    onClick={() => window.open(`mailto:${contact.email}?subject=EduTrack Support Request&body=Hi ${contact.name},%0A%0A`, "_blank")}
                  >
                    <Mail className="w-3 h-3" />
                    Send Email
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground italic">
                  No developer contact set yet. Click Edit to add your details — they'll be saved to your Google Sheet.
                </p>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
                  <Pencil className="w-3 h-3" />
                  Add Contact Details
                </Button>
              </div>
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
                  <p className="text-2xl font-bold text-foreground">
                    {loadingStats ? "—" : (value ?? "—")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => setLocation("/settings")}>
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">Settings</p>
                <p className="text-xs text-muted-foreground">Manage sheet, seed data</p>
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
                else toast({ title: "No sheet linked", description: "Go to Settings to link a sheet." });
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

        {/* Developer Tools — Seed */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Developer Tools</h2>
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="w-4 h-4 text-amber-600" />
                Set Up Columns &amp; Sample Data
              </CardTitle>
              <CardDescription>
                Creates all required tabs and writes correct column headers. Populates sample data so you can test the app immediately.
                <span className="block mt-1 font-medium text-amber-700">
                  Warning: this overwrites all existing data in every tab.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!sheetId ? (
                <p className="text-sm text-muted-foreground">Link a Google Sheet in Settings first.</p>
              ) : seedConfirm ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">
                      This will <strong>overwrite all data</strong> in your Google Sheet. Are you sure?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-2 bg-red-600 hover:bg-red-700"
                      onClick={handleSeed}
                      disabled={seeding}
                    >
                      {seeding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                      {seeding ? "Setting up…" : "Yes, overwrite everything"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSeedConfirm(false)} disabled={seeding}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleSeed}
                >
                  <FlaskConical className="w-3 h-3" />
                  Set up columns &amp; add sample data
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info note */}
        <Card className="bg-amber-50/40 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-800 mb-1">Who can edit this contact?</p>
            <p className="text-sm text-amber-700">
              Only users with role <strong>admin</strong> in the Users tab of the Google Sheet can access this portal and edit the developer contact.
              Principals and tutors see a read-only "Contact Developer" button — they cannot change the email address.
            </p>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
