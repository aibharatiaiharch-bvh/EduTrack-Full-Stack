import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Upload, Download, FileText, XCircle } from "lucide-react";
import { apiUrl } from "@/lib/api";

const CSV_HEADERS = [
  "Student Name", "Student Email", "Age", "Current School", "Current Grade",
  "Previously Enrolled (Yes/No)", "Classes Interested", "Parent Email",
  "Parent Phone", "Reference", "Promo Code", "Notes",
];

const CSV_FIELD_MAP: Record<string, string> = {
  "student name":                 "studentName",
  "student email":                "studentEmail",
  "age":                          "age",
  "current school":               "currentSchool",
  "current grade":                "currentGrade",
  "previously enrolled (yes/no)": "previouslyEnrolled",
  "previously enrolled":          "previouslyEnrolled",
  "classes interested":           "classesInterested",
  "parent email":                 "parentEmail",
  "parent phone":                 "parentPhone",
  "reference":                    "reference",
  "promo code":                   "promoCode",
  "notes":                        "notes",
};

function downloadTemplate() {
  const sampleRow = [
    "Emma Johnson", "emma@email.com", "12", "Greenwood Primary", "Year 6",
    "No", "Maths Year 6", "parent@email.com", "0412 345 678", "Friend", "", "",
  ];
  const csv = [CSV_HEADERS.join(","), sampleRow.map(v => `"${v}"`).join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "EduTrack_Student_Upload_Template.csv";
  a.click();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i <= line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if ((ch === "," || i === line.length) && !inQuote) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const key = CSV_FIELD_MAP[h] || h;
      row[key] = values[i] || "";
    });
    return row;
  });
}

type BulkResult = {
  total: number;
  success: number;
  failed: number;
  results: { row: number; name: string; ok: boolean; error?: string }[];
};

export function BulkUploadCard() {
  const sheetId = localStorage.getItem("edutrack_sheet_id") || "";

  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkResults(null);
    setError("");
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target?.result as string);
      setBulkRows(rows.slice(0, 200));
    };
    reader.readAsText(file);
  }

  async function handleBulkSubmit() {
    if (!bulkRows.length) return;
    setBulkSubmitting(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/roles/enroll-bulk"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId, students: bulkRows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Upload failed"); return; }
      setBulkResults(data);
      setBulkRows([]);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Step 1 — Download the Template
          </CardTitle>
          <CardDescription>
            Fill in the CSV with your student list (max 200 rows), then upload below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate} className="gap-2">
            <FileText className="w-4 h-4" /> Download CSV Template
          </Button>
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">Required:</span> Student Name, Parent Email, Parent Phone</p>
            <p><span className="font-medium text-foreground">Optional:</span> Student Email, Age, Current School, Current Grade, Previously Enrolled, Classes Interested, Reference, Promo Code, Notes</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" /> Step 2 — Upload Your CSV
          </CardTitle>
          <CardDescription>A preview will appear before you confirm the submission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">{bulkFileName || "Click to choose a CSV file"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {bulkRows.length > 0 ? `${bulkRows.length} student${bulkRows.length !== 1 ? "s" : ""} detected` : ".csv files only"}
              </p>
            </div>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
          </label>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {bulkRows.length > 0 && !bulkResults && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview ({bulkRows.length} rows)</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Student Name</th>
                      <th className="px-3 py-2 text-left font-medium">Student Email</th>
                      <th className="px-3 py-2 text-left font-medium">Parent Email</th>
                      <th className="px-3 py-2 text-left font-medium">Classes</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, i) => {
                      const missing = !row.studentName?.trim() || !row.parentEmail?.trim();
                      return (
                        <tr key={i} className={`border-b last:border-0 ${missing ? "bg-red-50" : "hover:bg-muted/30"}`}>
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{row.studentName || <span className="text-destructive">Missing</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.studentEmail || "—"}</td>
                          <td className="px-3 py-2">{row.parentEmail || <span className="text-destructive">Missing</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{row.classesInterested || "—"}</td>
                          <td className="px-3 py-2">
                            {missing
                              ? <span className="text-destructive font-medium">⚠ Fix required</span>
                              : <span className="text-green-600">✓ Ready</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button onClick={handleBulkSubmit} disabled={bulkSubmitting} className="w-full gap-2 mt-2">
                <Upload className="w-4 h-4" />
                {bulkSubmitting ? "Submitting…" : `Submit ${bulkRows.length} Student${bulkRows.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          )}

          {bulkResults && (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-4 rounded-lg border ${bulkResults.failed === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <CheckCircle2 className={`w-5 h-5 shrink-0 ${bulkResults.failed === 0 ? "text-green-600" : "text-amber-600"}`} />
                <div>
                  <p className="font-medium text-sm">{bulkResults.success} of {bulkResults.total} submitted successfully</p>
                  {bulkResults.failed > 0 && <p className="text-xs text-muted-foreground">{bulkResults.failed} failed — see details below</p>}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.results.map((r, i) => (
                      <tr key={i} className={`border-b last:border-0 ${r.ok ? "" : "bg-red-50"}`}>
                        <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">
                          {r.ok
                            ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Submitted</span>
                            : <span className="text-destructive flex items-center gap-1"><XCircle className="w-3 h-3" /> {r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setBulkResults(null); setBulkFileName(""); }} className="gap-1.5">
                Upload Another File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
