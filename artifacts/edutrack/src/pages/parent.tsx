import { useState, useMemo, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Calendar, Clock, XCircle, AlertTriangle, Users, Search, X } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

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
  const { toast } = useToast();
  const qc = useQueryClient();

  // Parent search state
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [studentFilter, setStudentFilter] = useState("all");
  const [cancelRow, setCancelRow] = useState<Enrollment | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close list when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowList(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      selectParent(parents[0]);
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

  // Load classes for the selected parent
  const { data: enrollments, isLoading: loadingClasses } = useQuery<Enrollment[]>({
    queryKey: ["classes", selectedParent?.["Email"], sheetId],
    enabled: !!selectedParent && !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ parentEmail: selectedParent!["Email"], sheetId: sheetId! });
      const res = await fetch(apiUrl(`/enrollments?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (row: number) => {
      const res = await fetch(apiUrl(`/enrollments/${row}/cancel`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId }),
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
    setShowList(false);
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
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Parent Portal</h1>
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
            {/* Searchable parent selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Select Parent</label>
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9 pr-9"
                    placeholder={loadingParents ? "Loading parents…" : "Search by name or email…"}
                    value={search}
                    disabled={!sheetId || loadingParents}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShowList(true);
                      if (selectedParent && e.target.value !== (selectedParent["Parent Name"] || selectedParent["Email"])) {
                        setSelectedParent(null);
                        setStudentFilter("all");
                      }
                    }}
                    onFocus={() => setShowList(true)}
                  />
                  {search && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={clearSelection}
                      tabIndex={-1}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown list */}
                {showList && !selectedParent && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden max-h-60 overflow-y-auto">
                    {filteredParents.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No parents found.</div>
                    ) : (
                      filteredParents.map((parent) => (
                        <button
                          key={parent["Email"]}
                          className="w-full text-left px-4 py-3 hover:bg-muted transition-colors flex flex-col gap-0.5 border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectParent(parent);
                          }}
                        >
                          <span className="font-medium text-sm text-foreground">
                            {parent["Parent Name"] || "Unnamed"}
                          </span>
                          <span className="text-xs text-muted-foreground">{parent["Email"]}</span>
                          {parent["Children"] && (
                            <span className="text-xs text-muted-foreground">Children: {parent["Children"]}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedParent && (
                <div className="flex items-center justify-between gap-2 pl-1">
                  <p className="text-xs text-muted-foreground">
                    Showing classes for <span className="font-medium text-foreground">{selectedParent["Email"]}</span>
                  </p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowList((v) => !v)}
                    type="button"
                  >
                    Change parent
                  </button>
                </div>
              )}
            </div>

            {/* Student filter — shown once classes are loaded and multiple students */}
            {selectedParent && studentNames.length > 1 && (
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

        {/* Results */}
        {selectedParent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {studentFilter === "all"
                  ? <>Classes for <span className="text-primary">{selectedParent["Parent Name"] || selectedParent["Email"]}</span></>
                  : <>Classes for <span className="text-primary">{studentFilter}</span></>
                }
              </h2>
              {!loadingClasses && enrollments && (
                <Badge variant="secondary" className="text-sm">
                  {visibleClasses.length} {visibleClasses.length === 1 ? "class" : "classes"}
                </Badge>
              )}
            </div>

            {loadingClasses ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))
            ) : !visibleClasses || visibleClasses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg flex flex-col items-center gap-2">
                <BookOpen className="h-8 w-8 opacity-40" />
                <p className="font-medium">No classes found</p>
                <p className="text-sm">
                  {studentFilter !== "all"
                    ? `No classes found for ${studentFilter}.`
                    : "No classes found for this parent."}
                </p>
              </div>
            ) : (
              visibleClasses.map((enrollment) => (
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
                            Cancel Class
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
