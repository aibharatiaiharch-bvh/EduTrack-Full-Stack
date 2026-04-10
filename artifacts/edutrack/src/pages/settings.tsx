import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSheetConfig } from "@/hooks/use-sheet-config";
import { ExternalLink, RefreshCw, Plus, CheckCircle2, AlertCircle, Loader2, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Settings() {
  const {
    sheetId,
    setSheetId,
    driveFiles,
    loadingFiles,
    filesError,
    creating,
    createNewSheet,
    seeding,
    seedSheet,
    refreshFiles,
  } = useSheetConfig();

  const { toast } = useToast();

  const selectedFile = driveFiles.find((f) => f.id === sheetId);

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
        toast({ title: "Spreadsheet created", description: "A new EduTrack spreadsheet has been set up and linked." });
      }
    } catch (err: any) {
      toast({ title: "Failed to create spreadsheet", description: err.message, variant: "destructive" });
    }
  };

  const handleSeed = async () => {
    if (!sheetId) return;
    try {
      await seedSheet(sheetId);
      toast({
        title: "Sheet seeded successfully",
        description: "All tabs now have correct columns and sample data.",
      });
    } catch (err: any) {
      toast({ title: "Seeding failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-4xl">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your platform preferences and institution details.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Institution Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
              Link a Google Spreadsheet to use as your EduTrack data source. The sheet must have
              tabs named <strong>Students</strong>, <strong>Teachers</strong>, and <strong>Subjects</strong>.
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

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t" />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Don't have a sheet yet? Create a new one pre-configured for EduTrack.
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
                Create new EduTrack spreadsheet
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-600" />
              Set Up Columns & Sample Data
            </CardTitle>
            <CardDescription>
              Writes the correct column headers to all tabs (Students, Teachers, Subjects, Enrollments)
              and populates them with sample data. Any missing tabs will be created automatically.
              <span className="block mt-1 font-medium text-amber-700 dark:text-amber-400">
                This will overwrite existing data in all tabs.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sheetId ? (
              <p className="text-sm text-muted-foreground">Link a Google Sheet above before seeding.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground text-sm">What will be created:</p>
                  <p><span className="font-medium">Students</span> — Name, Email, Classes, Status, Phone, Parent Email</p>
                  <p><span className="font-medium">Teachers</span> — Name, Email, Subjects, Role, Status</p>
                  <p><span className="font-medium">Subjects</span> — Name, Teacher, Room, Days, Status</p>
                  <p><span className="font-medium">Enrollments</span> — Student Name, Class Name, Class Date, Class Time, Parent Email, Status, Override Action</p>
                </div>
                <Button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {seeding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                  {seeding ? "Seeding sheet…" : "Set up columns & add sample data"}
                </Button>
              </div>
            )}
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
      </div>
    </AppLayout>
  );
}
