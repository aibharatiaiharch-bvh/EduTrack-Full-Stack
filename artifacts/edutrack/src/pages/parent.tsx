import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Calendar, Clock, XCircle, AlertTriangle, Search } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";

type Enrollment = {
  _row: number;
  "Student Name": string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Parent Email": string;
  "Status": string;
  "Override Action": string;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Active") return "default";
  if (status === "Cancelled") return "secondary";
  if (status === "Late Cancellation") return "destructive";
  if (status === "Fee Waived") return "secondary";
  if (status === "Fee Confirmed") return "destructive";
  return "outline";
}

export default function ParentView() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const [parentEmail, setParentEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState("");
  const [cancelRow, setCancelRow] = useState<Enrollment | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: enrollments, isLoading } = useQuery<Enrollment[]>({
    queryKey: ["enrollments", searchedEmail, sheetId],
    enabled: !!searchedEmail && !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ parentEmail: searchedEmail });
      const res = await fetch(`/api/enrollments?${params}`, {
        headers: sheetId ? { "x-sheet-id": sheetId } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (row: number) => {
      const res = await fetch(`/api/enrollments/${row}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sheetId ? { "x-sheet-id": sheetId } : {}),
        },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      if (data.lateCancel) {
        toast({
          title: "Late cancellation policy applies",
          description: "Requesting Principal Override. A late cancellation fee may apply.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Class cancelled successfully" });
      }
      setCancelRow(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel", description: err.message, variant: "destructive" });
      setCancelRow(null);
    },
  });

  return (
    <AppLayout>
      <div className="p-8 space-y-8 max-w-4xl">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Parent Portal</h1>
          <p className="text-muted-foreground mt-1">View and manage your child's class enrollments.</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings to link your data source first.</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Look up enrollments by parent email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="parent@example.com"
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setSearchedEmail(parentEmail); }}
                className="max-w-sm"
              />
              <Button onClick={() => setSearchedEmail(parentEmail)} disabled={!parentEmail} className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {searchedEmail && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Enrollments for <span className="text-primary">{searchedEmail}</span>
            </h2>

            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))
            ) : !enrollments || enrollments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                No enrollments found for this email.
              </div>
            ) : (
              enrollments.map((enrollment) => (
                <Card key={enrollment._row} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-semibold text-base">{enrollment["Student Name"]}</h3>
                          <p className="font-medium text-foreground">{enrollment["Class Name"]}</p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            {enrollment["Class Date"] && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {enrollment["Class Date"]}
                              </span>
                            )}
                            {enrollment["Class Time"] && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {enrollment["Class Time"]}
                              </span>
                            )}
                          </div>
                          {enrollment["Status"] === "Late Cancellation" && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mt-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Pending principal review — late cancellation fee may apply
                            </div>
                          )}
                          {enrollment["Override Action"] && (
                            <p className="text-xs text-muted-foreground">
                              Override: <span className="font-medium">{enrollment["Override Action"]}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <Badge variant={statusVariant(enrollment["Status"])} className="capitalize">
                          {enrollment["Status"]}
                        </Badge>
                        {enrollment["Status"] === "Active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                            onClick={() => setCancelRow(enrollment)}
                          >
                            <XCircle className="h-4 w-4" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!cancelRow} onOpenChange={(open) => { if (!open) setCancelRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this class?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to cancel <strong>{cancelRow?.["Class Name"]}</strong> for{" "}
              <strong>{cancelRow?.["Student Name"]}</strong>
              {cancelRow?.["Class Date"] && ` on ${cancelRow["Class Date"]}`}.
              <br /><br />
              If the class starts in less than 24 hours, the late cancellation policy will apply
              and a Principal Override will be requested.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep class</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => cancelRow && cancelMutation.mutate(cancelRow._row)}
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
