import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import {
  LogOut, Shield, Settings, RefreshCw,
  FlaskConical, AlertTriangle, Columns, ToggleLeft, ShieldCheck,
  GraduationCap, UserRound, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSheetConfig } from "@/hooks/use-sheet-config";
import { FEATURE_META, type FeatureKey, setStoredFeatures, getFeatures } from "@/config/features";
import { DevModeBanner } from "@/components/dev-mode-banner";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const FEATURE_KEYS = Object.keys(FEATURE_META) as FeatureKey[];

export default function AdminPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sheetId = localStorage.getItem(SHEET_KEY) || "";
  const { seeding, seedSheet } = useSheetConfig();
  const [seedConfirm, setSeedConfirm] = useState(false);

  // ── Feature toggles (localStorage only — no client sheet access) ─────
  const [features, setFeatures] = useState(getFeatures());

  function toggleFeature(key: FeatureKey, value: boolean) {
    const updated = { ...features, [key]: value };
    setFeatures(updated);
    setStoredFeatures(updated);
    toast({
      title: `${FEATURE_META[key].label} ${value ? "enabled" : "disabled"}`,
      description: "Applies immediately across all sessions.",
    });
  }

  // ── Ensure headers (safe) ────────────────────────────────────────────
  const [ensuringHeaders, setEnsuringHeaders] = useState(false);

  async function ensureHeaders() {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Link a Google Sheet in Settings first.", variant: "destructive" }); return;
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
      const insertedCols = data.columnsInserted?.length ?? 0;
      toast({
        title: "Sheet columns up to date",
        description: addedTabs > 0 || addedHeaders > 0 || insertedCols > 0
          ? `Added ${addedTabs} tab(s), wrote headers to ${addedHeaders} tab(s), inserted ${insertedCols} missing column(s). No existing data changed.`
          : "All tabs and headers already exist. No changes made.",
      });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setEnsuringHeaders(false); }
  }

  // ── Seed (overwrite) ─────────────────────────────────────────────────
  async function handleSeed() {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Link a Google Sheet in Settings first.", variant: "destructive" }); return;
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
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none">Developer Portal</p>
              <p className="text-xs text-muted-foreground mt-0.5">EduTrack</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.primaryEmailAddress?.emailAddress}
            </span>
            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Developer</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/principal")}>
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Principal Dashboard</span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => signOut({ redirectUrl: "/" })}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Developer Tools
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure features and set up the Google Sheet. Client data is only visible to principals.
          </p>
        </div>

        {/* Feature Toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ToggleLeft className="w-4 h-4 text-blue-600" />
              Feature Toggles
            </CardTitle>
            <CardDescription>
              Enable or disable modules for this deployment. Saved locally — changes apply immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {FEATURE_KEYS.map((key, i) => (
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
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Quick Access</h2>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2 w-full sm:w-auto" onClick={() => setLocation("/settings")}>
            <Settings className="w-5 h-5 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium text-sm">Settings</p>
              <p className="text-xs text-muted-foreground">Link or change the Google Sheet</p>
            </div>
          </Button>
        </div>

        {/* Developer Tools */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Sheet Setup</h2>
          <div className="space-y-4">

            {/* Add Missing Columns — safe */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Columns className="w-4 h-4 text-blue-600" />
                  Add Missing Tabs &amp; Columns
                </CardTitle>
                <CardDescription>
                  Checks the linked Google Sheet for missing tabs or headers and adds them.
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
                  Creates all required tabs with correct headers and populates sample data for testing.
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

        {/* Data boundary notice */}
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 text-sm text-purple-800">
          <p className="font-medium mb-1">Data boundary</p>
          <p className="text-xs text-purple-700 leading-relaxed">
            This portal has no access to student, teacher, enrolment, or parent records.
            All client data is managed exclusively through the Principal Dashboard.
            When distributing this app, the developer and principal should use separate accounts.
          </p>
        </div>

      </main>
    </div>
  );
}
