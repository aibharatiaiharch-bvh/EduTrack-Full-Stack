import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import {
  Mail, LogOut, ExternalLink, Shield, Users, BookOpen,
  Settings, RefreshCw, Copy, Check, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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

  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [stats, setStats] = useState<SheetStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [copied, setCopied] = useState(false);

  const sheetId = localStorage.getItem(SHEET_KEY) || "";

  useEffect(() => {
    fetch(apiUrl("/admin/contact"))
      .then((r) => r.json())
      .then((d) => setContact(d))
      .catch(() => {});
  }, []);

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

  function copyEmail() {
    if (!contact?.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openMailto() {
    if (!contact?.email) return;
    window.open(
      `mailto:${contact.email}?subject=EduTrack Support Request&body=Hi ${contact.name},%0A%0A`,
      "_blank"
    );
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="w-4 h-4 text-purple-600" />
              Developer Contact
            </CardTitle>
            <CardDescription>
              This contact is shown to clients so they can reach you directly.
              To change it, update the <strong>DEVELOPER_EMAIL</strong> value in the Replit Secrets panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contact ? (
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
                  <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={openMailto}>
                    <Mail className="w-3 h-3" />
                    Send Email
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                DEVELOPER_EMAIL not configured — add it in the Replit Secrets panel.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Platform Stats */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Platform Overview</h2>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={loadStats}
              disabled={loadingStats}
            >
              <RefreshCw className={`w-3 h-3 ${loadingStats ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Students", value: stats?.students, icon: BookOpen, color: "text-blue-600 bg-blue-50" },
              { label: "Teachers", value: stats?.teachers, icon: Users, color: "text-green-600 bg-green-50" },
              { label: "Parents", value: stats?.parents, icon: Phone, color: "text-orange-600 bg-orange-50" },
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

        {/* Quick Links */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 text-left"
              onClick={() => setLocation("/settings")}
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Settings</p>
                <p className="text-xs text-muted-foreground">Manage sheet, seed data</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 text-left"
              onClick={() => setLocation("/principal")}
            >
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Principal Dashboard</p>
                <p className="text-xs text-muted-foreground">View as principal</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2 text-left"
              onClick={() => {
                if (sheetId) {
                  window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, "_blank");
                } else {
                  toast({ title: "No sheet linked", description: "Go to Settings to link a sheet." });
                }
              }}
            >
              <ExternalLink className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Open Google Sheet</p>
                <p className="text-xs text-muted-foreground">View raw data</p>
              </div>
            </Button>
          </div>
        </div>

        {/* How to contact info */}
        <Card className="bg-amber-50/40 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-800 mb-1">How clients contact you</p>
            <p className="text-sm text-amber-700">
              The Principal Dashboard includes a <strong>"Contact Developer"</strong> button that opens a pre-filled
              email to your address above. Only you can change this email — clients have no way to edit it.
            </p>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
