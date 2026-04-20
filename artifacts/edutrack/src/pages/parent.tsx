import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Calendar, Clock, XCircle, AlertTriangle, Users, Search, X } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type Parent = {
  _row: number;
  "Email": string;
  "Parent Name": string;
  "Phone": string;
  "Children": string;
  "Status": string;
};

type Enrollment = {
  _row: number;
  "Student Name": string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Parent Email": string;
  "Status": string;
  "Fee": string;
  "Override Action": string;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Active")   return "default";
  if (status === "Inactive") return "secondary";
  // legacy values (backward compat)
  if (status === "Cancelled" || status === "Fee Waived") return "secondary";
  if (status === "Late Cancellation" || status === "Fee Confirmed") return "destructive";
  if (status === "Pending")  return "outline";
  if (status === "Rejected") return "destructive";
  return "outline";
}

type Period = "upcoming" | "past" | "all";

export default function ParentView() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Parent search state
  const [search, setSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [studentFilter, setStudentFilter] = useState("all");
  const [cancelRow, setCancelRow] = useState<Enrollment | null>(null);
  const [period, setPeriod] = useState<Period>("upcoming");

  // Load parent list from the sheet
  const { data: parents, isLoading: loadingParents } = useQuery<Parent[]>({
    queryKey: ["parents-list", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/sheets/parents?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      const rows = await res.json();
      return Array.isArray(rows) ? rows.filter((r: Parent) => r["Email"]) : [];
    },
  });

  useEffect(() => {
    if (!selectedParent && parents && parents.length > 0) {
      setSelectedParent(null);
    }
  }, [parents, selectedParent]);

  // Filter parents based on search text
  const filteredParents = useMemo(() => {
    if (!parents) return [];
    if (!search.trim()) return parents;
    const q = search.toLowerCase();
    return parents.filter(p =>
      (p["Parent Name"] || "").toLowerCase().includes(q) ||
      (p["Email"] || "").toLowerCase().includes(q)
    );
  }, [parents, search]);

  // Load classes — all when no parent selected, filtered when a parent is selected
  const { data: enrollments, isLoading: loadingClasses } = useQuery<Enrollment[]>({
    queryKey: ["classes", selectedParent?.["Email"] ?? "all", sheetId, period],
    enabled: !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ sheetId: sheetId!, period });
      if (selectedParent) params.set("parentEmail", selectedParent["Email"]);
      const res = await fetch(apiUrl(`/enrollments?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (enrollment: any) => {
      const classDate  = enrollment["ClassDate"] || enrollment["Class Date"] || "";
      const classTime  = enrollment["ClassTime"] || enrollment["Class Time"] || "";
      const sessionDate = new Date().toISOString().slice(0, 10);
      // Determine if within 24 hrs: check if class date string starts today or is within 24h
      let within24Hrs = "Yes";
      if (classDate) {
        const parsed = new Date(classDate);
        if (!isNaN(parsed.getTime())) {
          within24Hrs = (parsed.getTime() - Date.now()) <= 24 * 60 * 60 * 1000 ? "Yes" : "No";
        }
      }
      const res = await fetch(apiUrl(`/enrollments/${enrollment._row}/cancel`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          userId:    enrollment["UserID"]  || enrollment.UserID  || "",
          classId:   enrollment["ClassID"] || enrollment.ClassID || "",
          within24Hrs,
          sessionDate,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      if (data.lateCancel) {
        toast({
          title: "Late cancellation policy applies",
          description: "A late cancellation fee may apply. The principal has been notified.",
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

  // Unique student names from the fetched classes
  const studentNames = useMemo(() => {
    if (!enrollments) return [];
    return Array.from(new Set(enrollments.map(e => e["Student Name"]).filter(Boolean))).sort();
  }, [enrollments]);

  // Apply student filter
  const visibleClasses = useMemo(() => {
    if (!enrollments) return [];
    if (studentFilter === "all") return enrollments;
    return enrollments.filter(e => e["Student Name"] === studentFilter);
  }, [enrollments, studentFilter]);

  function selectParent(parent: Parent) {
    setSelectedParent(parent);
    setSearch(parent["Parent Name"] || parent["Email"]);
    setStudentFilter("all");
  }

  function clearSelection() {
    setSelectedParent(null);
    setSearch("");
    setStudentFilter("all");
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-4xl">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">My Classes</h1>
          <p className="text-muted-foreground mt-1">View and manage your child's upcoming classes.</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings to link your data source first.</p>
          </div>
        )}

        {/* Look up Classes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-muted-foreground" />
              Look up Classes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Select Parent</label>
              <Select
                value={selectedParent?.["Email"] || "all"}
                onValueChange={(email) => {
                  if (email === "all") {
                    clearSelection();
                    return;
                  }
                  const parent = parents?.find((p) => p["Email"] === email);
                  if (parent) selectParent(parent);
                }}
                disabled={!sheetId || loadingParents}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingParents ? "Loading parents…" : "All Parents"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parents</SelectItem>
                  {filteredParents.map((parent) => (
                    <SelectItem key={parent["Email"]} value={parent["Email"]}>
                      {parent["Parent Name"] || parent["Email"]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedParent && (
                <p className="text-xs text-muted-foreground pl-1">
                  Showing classes for <span className="font-medium text-foreground">{selectedParent["Parent Name"] || selectedParent["Email"]}</span>
                </p>
              )}
            </div>

            {selectedParent && studentNames.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Filter by Student</label>
                <Select value={studentFilter} onValueChange={setStudentFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All students" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All students</SelectItem>
                    {studentNames.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results — always shown when sheet is linked */}
        {sheetId && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedParent
                  ? studentFilter === "all"
                    ? <>Classes for <span className="text-primary">{selectedParent["Parent Name"] || selectedParent["Email"]}</span></>
                    : <>Classes for <span className="text-primary">{studentFilter}</span></>
                  : "All Students"}
              </h2>
              <div className="flex items-center gap-2">
                {/* Period toggle */}
                <div className="flex rounded-lg border bg-muted p-0.5 text-xs font-medium">
                  {(["upcoming", "past", "all"] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1 rounded-md capitalize transition-colors ${
                        period === p
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {!loadingClasses && enrollments && (
                  <Badge variant="secondary" className="text-sm shrink-0">
                    {visibleClasses.length} {visibleClasses.length === 1 ? "class" : "classes"}
                  </Badge>
                )}
              </div>
            </div>

            {loadingClasses ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))
            ) : !visibleClasses || visibleClasses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <BookOpen className="h-8 w-8 opacity-40" />
                <p className="font-medium">No classes found</p>
                <p className="text-sm">
                  {selectedParent
                    ? studentFilter !== "all"
                      ? `No classes found for ${studentFilter}.`
                      : "No classes found for this parent."
                    : "No classes found in this sheet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleClasses.map((enrollment) => (
                    <TableRow key={enrollment._row}>
                      <TableCell className="font-medium">{enrollment["Student Name"]}</TableCell>
                      <TableCell>{enrollment["Class Name"]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {[enrollment["Class Date"], enrollment["Class Time"]].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={statusVariant(enrollment["Status"])} className="capitalize w-fit">
                            {enrollment["Status"] || "Active"}
                          </Badge>
                          {enrollment["Status"] === "Inactive" && enrollment["Fee"] && enrollment["Fee"] !== "Not Applicable" && (
                            <span className="text-xs text-muted-foreground">
                              Fee: {enrollment["Fee"]}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {enrollment["Status"] === "Active" && selectedParent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8 px-2 text-xs"
                            onClick={() => setCancelRow(enrollment)}
                          >
                            <XCircle className="h-4 w-4" />
                            Cancel
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              onClick={() => cancelRow && cancelMutation.mutate(cancelRow)}
            >
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
