import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { ShieldCheck, BookOpen, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, SlidersHorizontal } from "lucide-react";

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

export default function PrincipalDashboard() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { flags, setFlag } = useFeatureFlags();

  const { data: requests, isLoading } = useQuery<Enrollment[]>({
    queryKey: ["enrollments", "late-cancellations", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ status: "Late Cancellation", ...(sheetId ? { sheetId } : {}) });
      const res = await fetch(`/api/enrollments?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ row, action }: { row: number; action: "Fee Waived" | "Fee Confirmed" }) => {
      const res = await fetch(`/api/enrollments/${row}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sheetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      toast({
        title: data.action === "Fee Waived" ? "Fee waived" : "Fee confirmed",
        description: `The enrollment has been updated to "${data.action}".`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Override failed", description: err.message, variant: "destructive" });
    },
  });

  const pending = requests ?? [];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-4xl">
        <header className="flex items-start gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
            <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Principal Dashboard</h1>
            <p className="text-muted-foreground mt-1">Review and resolve late cancellation requests.</p>
          </div>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings to link your data source first.</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4" />
              Feature Visibility
            </CardTitle>
            <CardDescription>
              Toggle features on or off for all users. Disabled features are hidden from the sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div>
                <p className="font-medium text-sm">Assessments</p>
                <p className="text-xs text-muted-foreground">Grade tracking, reports, and evaluations</p>
              </div>
              <Switch
                checked={flags.assessments}
                onCheckedChange={(v) => setFlag("assessments", v)}
                aria-label="Toggle Assessments"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-sm">Billing</p>
                <p className="text-xs text-muted-foreground">Invoices, payments, and billing history</p>
              </div>
              <Switch
                checked={flags.billing}
                onCheckedChange={(v) => setFlag("billing", v)}
                aria-label="Toggle Billing"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <CardTitle>Late Cancellation Requests</CardTitle>
                <CardDescription className="mt-1">
                  These cancellations were made within 24 hours of class start. Use "God Mode" to waive or confirm the fee.
                </CardDescription>
              </div>
              {!isLoading && (
                <Badge variant={pending.length > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1 self-start shrink-0">
                  {pending.length} pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))
            ) : pending.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="font-medium">No pending requests</p>
                <p className="text-sm">All late cancellations have been resolved.</p>
              </div>
            ) : (
              pending.map((enrollment) => (
                <div
                  key={enrollment._row}
                  className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-11 h-11 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{enrollment["Student Name"]}</p>
                      <p className="font-medium text-sm">{enrollment["Class Name"]}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {enrollment["Class Date"] && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {enrollment["Class Date"]}
                          </span>
                        )}
                        {enrollment["Class Time"] && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {enrollment["Class Time"]}
                          </span>
                        )}
                        {enrollment["Parent Email"] && (
                          <span className="text-muted-foreground">{enrollment["Parent Email"]}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950"
                      onClick={() => overrideMutation.mutate({ row: enrollment._row, action: "Fee Waived" })}
                      disabled={overrideMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Waive Fee
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => overrideMutation.mutate({ row: enrollment._row, action: "Fee Confirmed" })}
                      disabled={overrideMutation.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Confirm Charge
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
