import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSheetConfig } from "@/hooks/use-sheet-config";
import { CheckCircle2, AlertCircle, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Settings() {
  const {
    sheetId,
    setSheetId,
    clearSheetId,
    manualSheetId,
    setManualSheetId,
    creating,
    createNewSheet,
  } = useSheetConfig();

  const { toast } = useToast();
  const [, setLocation] = useLocation();
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

  const handleCreate = async () => {
    try {
      const newId = await createNewSheet();
      if (newId) {
        setSheetId(newId);
        toast({
          title: "Spreadsheet created and ready",
          description: "Your spreadsheet has been linked.",
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
              paste the spreadsheet ID to link it directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!sheetId ? (
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/40">
                <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  No spreadsheet is linked yet. Paste the spreadsheet ID below or create a new EduTrack spreadsheet.
                </p>
              </div>
            ) : (
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

          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
