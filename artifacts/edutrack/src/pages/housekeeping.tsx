import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type Kind = "subject" | "class" | "teacher" | "student";

export default function HousekeepingPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("subject");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const fields = kind === "subject"
    ? ["name", "type", "teacherId", "teachers", "room", "days", "maxCapacity"]
    : kind === "class"
    ? ["name", "type", "teacherEmail", "room", "days", "maxCapacity"]
    : kind === "teacher"
    ? ["name", "email", "subjects", "specialty", "zoomLink"]
    : ["name", "email", "phone", "parentEmail", "parentName", "parentPhone"];

  async function submit() {
    setSaving(true);
    try {
      const endpoint =
        kind === "teacher" ? "/principals/add-teacher" :
        kind === "student" ? "/principals/add-student" :
        kind === "class" ? "/subjects" : "/subjects";
      const body = kind === "class"
        ? { name: form.name, type: form.type, teacherEmail: form.teacherEmail, room: form.room, days: form.days, maxCapacity: form.maxCapacity, sheetId: localStorage.getItem("edutrack_sheet_id") || "" }
        : kind === "teacher"
        ? { name: form.name, email: form.email, subjects: form.subjects, specialty: form.specialty, zoomLink: form.zoomLink, sheetId: localStorage.getItem("edutrack_sheet_id") || "" }
        : kind === "student"
        ? { name: form.name, email: form.email, phone: form.phone, parentEmail: form.parentEmail, parentName: form.parentName, parentPhone: form.parentPhone, sheetId: localStorage.getItem("edutrack_sheet_id") || "" }
        : { name: form.name, type: form.type, teacherId: form.teacherId, teachers: form.teachers, room: form.room, days: form.days, maxCapacity: form.maxCapacity, sheetId: localStorage.getItem("edutrack_sheet_id") || "" };
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${kind} saved` });
      setForm({});
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Housekeeping</CardTitle>
            <CardDescription>Add a subject, class, teacher, or student from one place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["subject","class","teacher","student"] as Kind[]).map(k => (
                <Button key={k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k}</Button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map(field => (
                <div key={field} className="space-y-2">
                  <Label>{field}</Label>
                  <Input value={form[field] || ""} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}