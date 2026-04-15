import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSheetConfig } from "@/hooks/use-sheet-config";
import { ExternalLink, RefreshCw, Plus, CheckCircle2, AlertCircle, Loader2, Shield, Database, Link2, Copy, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

export default function Settings() {
  const {
    sheetId,
    setSheetId,
    clearSheetId,
    manualSheetId,
    setManualSheetId,
    driveFiles,
    loadingFiles,
    filesError,
    creating,
    createNewSheet,
    refreshFiles,
  } = useSheetConfig();

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [syncingHeaders, setSyncingHeaders] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [applyingDropdowns, setApplyingDropdowns] = useState(false);

  const selectedFile = driveFiles.find((f) => f.id === sheetId);

  const handleManualLink = () => {
    const value = manualSheetId.trim();
    if (!value) return;
    setSheetId(value);
    setManualSheetId("");
    toast({ title: "Google Sheet linked", description: "The spreadsheet ID has been saved." });
  };

  const handleClearLink = () => {
    clearSheetId();
    setManualSheetId("");
    toast({ title: "Link cleared", description: "You can now link a different Google Sheet." });
  };

  const handleSyncHeaders = async () => {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Please link a Google Sheet first.", variant: "destructive" });
      return;
    }
    setSyncingHeaders(true);
    try {
      const res = await fetch(apiUrl("/sheets/ensure-headers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync headers");
      toast({ title: "Headers synced", description: "All sheet tabs have been checked and updated." });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingHeaders(false);
    }
  };

  const handleSeedData = async () => {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Please link a Google Sheet first.", variant: "destructive" });
      return;
    }
    setSeedingData(true);
    try {
      const res = await fetch(apiUrl("/sheets/seed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Seed failed");
      toast({ title: "Demo data loaded", description: "All tabs have been cleared and filled with sample data." });
    } catch (err: any) {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    } finally {
      setSeedingData(false);
    }
  };

  const handleApplyDropdowns = async () => {
    if (!sheetId) {
      toast({ title: "No sheet linked", description: "Please link a Google Sheet first.", variant: "destructive" });
      return;
    }
    setApplyingDropdowns(true);
    try {
      const res = await fetch(apiUrl("/sheets/apply-validation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply dropdowns");
      toast({ title: "Dropdowns applied", description: `${data.rulesApplied} dropdown rules set on all status columns.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setApplyingDropdowns(false);
    }
  };

  const handleSelect = (value: string) => {
    setSheetId(value);
    toast({ title: "Google Sheet linked", description: "Your spreadsheet has been saved." });
  };

  const handleCreate = async () => {
    try {
      const newId = await createNewSheet();
      if (newId) {
        setSheetId(newId);
        await refreshFiles();
        toast({
          title: "Spreadsheet created and ready",
          description: "All 7 tabs have been created, sample data loaded, and dropdowns applied. You're all set!",
        });
      }
    } catch (err: any) {
      toast({ title: "Failed to create spreadsheet", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-4xl">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your platform preferences and institution details.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Institution Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Institution Name</label>
                <Input defaultValue="EduTrack Academy" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email</label>
                <Input type="email" defaultValue="admin@edutrack.edu" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Sheet</CardTitle>
          <CardDescription>
              Link a Google Spreadsheet to use as your EduTrack data source. If nothing is linked yet,
              create a new one or select an existing file from Drive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sheetId && selectedFile ? (
              <div className="flex items-start gap-3 p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-green-900 dark:text-green-100 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                    Last modified: {format(new Date(selectedFile.modifiedTime), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
                <a
                  href={selectedFile.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 shrink-0"
                  title="Open in Google Sheets"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : sheetId && !selectedFile && !loadingFiles ? (
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  A sheet is linked but was not found in your Drive. Select a new one below.
                </p>
              </div>
            ) : !sheetId && !loadingFiles ? (
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/40">
                <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  No spreadsheet is linked yet. Choose one from Drive or create a new EduTrack spreadsheet.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Select from your Google Drive</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshFiles}
                  disabled={loadingFiles}
                  className="h-7 gap-1.5 text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {filesError ? (
                <p className="text-sm text-destructive">{filesError}</p>
              ) : (
                <Select
                  value={sheetId ?? ""}
                  onValueChange={handleSelect}
                  disabled={loadingFiles}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingFiles ? "Loading spreadsheets…" : "Choose a spreadsheet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {driveFiles.length === 0 && !loadingFiles ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No spreadsheets found in your Drive.</div>
                    ) : (
                      driveFiles.map((file) => (
                        <SelectItem key={file.id} value={file.id}>
                          <span className="flex items-center gap-2">
                            <span className="flex flex-col">
                              <span>{file.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Modified {format(new Date(file.modifiedTime), "MMM d, yyyy h:mm a")}
                              </span>
                            </span>
                            {file.id === sheetId && (
                              <Badge variant="secondary" className="text-xs py-0">linked</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {!loadingFiles && driveFiles.length === 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Paste spreadsheet ID manually</label>
                <div className="flex gap-2">
                  <Input
                    value={manualSheetId}
                    onChange={(e) => setManualSheetId(e.target.value)}
                    placeholder="Spreadsheet ID from the Google Sheets URL"
                  />
                  <Button onClick={handleManualLink} disabled={!manualSheetId.trim()}>
                    Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use the long ID between <code>/d/</code> and <code>/edit</code> in the Google Sheets URL.
                </p>
              </div>
            )}

            {sheetId && !selectedFile && !loadingFiles && (
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Linked by ID: <span className="font-mono break-all">{sheetId}</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleClearLink}>
                  Unlink
                </Button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t" />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Don't have a sheet yet? Create a brand-new one — all 7 tabs are created, sample data is loaded, and dropdown rules are applied automatically. The sheet will be linked immediately.
              </p>
              <Button
                variant="outline"
                onClick={handleCreate}
                disabled={creating}
                className="gap-2"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {creating ? "Creating spreadsheet…" : "Create new EduTrack spreadsheet"}
              </Button>
            </div>

            {sheetId && (
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Enrollment Link
                </p>
                <p className="text-xs text-muted-foreground">
                  Share this link with new families. They can fill in their details and submit an enrollment
                  request without needing any code — the school's sheet is embedded in the link.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-md px-3 py-2 text-xs text-muted-foreground font-mono truncate border">
                    {`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/enroll?sheetId=${sheetId}`}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => {
                      const link = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/enroll?sheetId=${sheetId}`;
                      navigator.clipboard.writeText(link).then(() => {
                        toast({ title: "Link copied!", description: "Share it with families to start enrollment." });
                      });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Sheet tools</p>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Sync sheet structure — adds missing tabs and columns without touching existing data.
                </p>
                <Button
                  variant="outline"
                  onClick={handleSyncHeaders}
                  disabled={syncingHeaders || !sheetId}
                  className="gap-2"
                >
                  {syncingHeaders ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  Sync Sheet Headers
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Load demo data — <strong className="text-destructive">clears all existing data</strong> and fills every tab with sample students, teachers, subjects, and enrollments so you can test the platform. Dropdowns are applied automatically.
                </p>
                <Button
                  variant="outline"
                  onClick={handleSeedData}
                  disabled={seedingData || !sheetId}
                  className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {seedingData ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Load Demo Data
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Set up dropdown lists on all Status, Priority, and controlled columns across every tab — prevents typing errors when editing the sheet directly.
                </p>
                <Button
                  variant="outline"
                  onClick={handleApplyDropdowns}
                  disabled={applyingDropdowns || !sheetId}
                  className="gap-2"
                >
                  {applyingDropdowns ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListChecks className="h-4 w-4" />
                  )}
                  Setup Dropdowns
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <Select defaultValue="america-new_york">
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="america-new_york">Eastern Time (US & Canada)</SelectItem>
                  <SelectItem value="america-chicago">Central Time (US & Canada)</SelectItem>
                  <SelectItem value="america-denver">Mountain Time (US & Canada)</SelectItem>
                  <SelectItem value="america-los_angeles">Pacific Time (US & Canada)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button>Update Preferences</Button>
          </CardContent>
        </Card>

        <div className="border-t pt-4">
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-purple-700"
            onClick={() => setLocation("/admin")}
          >
            <Shield className="w-4 h-4" />
            Developer Portal
          </Button>
          <p className="text-xs text-muted-foreground mt-1 ml-1">
            Developer access only — manage contact details and set up sheet data.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
