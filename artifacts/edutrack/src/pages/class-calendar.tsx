import { useState, useMemo } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar, Clock, Users, User, BookOpen, AlertTriangle,
  CheckCircle2, ChevronRight, Video, PlusCircle,
} from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const ROLE_KEY = "edutrack_user_role";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type CalendarSlot = {
  subjectId: string;
  className: string;
  type: string;
  teacherName: string;
  teacherEmail: string;
  zoomLink: string;
  room: string;
  time: string;
  maxCapacity: number;
  enrolled: number;
  isFull: boolean;
  students: string[];
};

type CalendarDay = {
  date: string;
  dateISO: string;
  dayName: string;
  slots: CalendarSlot[];
};

type CalendarData = {
  days: CalendarDay[];
  weeks: number;
};

function capacityColor(enrolled: number, max: number) {
  const pct = enrolled / max;
  if (pct >= 1) return "text-destructive";
  if (pct >= 0.75) return "text-amber-600";
  return "text-green-600";
}

function typeIcon(type: string) {
  return type === "Individual"
    ? <User className="h-3.5 w-3.5" />
    : <Users className="h-3.5 w-3.5" />;
}

export default function ClassCalendar() {
  const { user } = useUser();
  const sheetId = localStorage.getItem(SHEET_KEY);
  const role = localStorage.getItem(ROLE_KEY) || "parent";
  const { toast } = useToast();
  const qc = useQueryClient();
  // Fall back to localStorage email when Clerk isn't loaded (e.g. production with dev keys)
  const resolvedEmail = user?.primaryEmailAddress?.emailAddress || localStorage.getItem("edutrack_user_email") || "";

  const [bookingSlot, setBookingSlot] = useState<{ slot: CalendarSlot; date: string } | null>(null);
  const [studentName, setStudentName] = useState("");
  const [parentEmail, setParentEmail] = useState(resolvedEmail);
  const isPrincipal = role === "principal" || role === "admin" || role === "developer";
  const weekCount = isPrincipal ? 3 : 2;
  const [selectedWeek, setSelectedWeek] = useState<0 | 1 | 2>(0);

  // Request a new class
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [reqForm, setReqForm] = useState({ name: "", email: resolvedEmail, className: "", preferredDays: "", preferredTime: "", notes: "" });

  const requestClassMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/roles/enroll"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          requestType: "new-class",
          studentName: reqForm.name.trim(),
          parentEmail: reqForm.email.trim(),
          classesInterested: reqForm.className.trim(),
          parentPhone: reqForm.preferredDays.trim(),
          currentGrade: reqForm.preferredTime.trim(),
          notes: reqForm.notes.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request submitted!", description: "A principal will review your request and activate the class." });
      setShowRequestDialog(false);
      setReqForm({ name: "", email: resolvedEmail, className: "", preferredDays: "", preferredTime: "", notes: "" });
    },
    onError: (err: any) => toast({ title: "Request failed", description: err.message, variant: "destructive" }),
  });

  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ["class-calendar", sheetId, weekCount],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/schedule/calendar?sheetId=${encodeURIComponent(sheetId!)}&weeks=${weekCount}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!bookingSlot) return;
      const res = await fetch(apiUrl("/enrollments/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          studentName: studentName.trim(),
          parentEmail: parentEmail.trim(),
          subjectName: bookingSlot.slot.className,
          subjectType: bookingSlot.slot.type,
          teacherName: bookingSlot.slot.teacherName,
          teacherEmail: bookingSlot.slot.teacherEmail,
          zoomLink: bookingSlot.slot.zoomLink,
          classDate: bookingSlot.date,
          classTime: bookingSlot.slot.time,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-calendar"] });
      toast({ title: "Booking confirmed!", description: `${studentName} has been enrolled in ${bookingSlot?.slot.className}.` });
      setBookingSlot(null);
      setStudentName("");
    },
    onError: (err: any) => {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    },
  });

  const allDays = data?.days ?? [];

  // Group days into weeks (up to 3 for principal)
  const weekDays = useMemo(() => [
    allDays.filter((_, i) => i < 7),
    allDays.filter((_, i) => i >= 7 && i < 14),
    allDays.filter((_, i) => i >= 14),
  ], [allDays]);

  const currentWeekDays = weekDays[selectedWeek] ?? [];

  const weekLabel = (days: CalendarDay[]) => {
    if (!days.length) return "";
    return `${days[0].date} – ${days[days.length - 1].date}`;
  };

  const weekTabLabels = ["This week", "Next week", "Week 3"];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-5xl">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Class Calendar</h1>
            <p className="text-muted-foreground">
              {isPrincipal
                ? "View all scheduled classes across this week and the next 2 weeks."
                : "View available classes for the next 2 weeks and book a spot."}
            </p>
          </div>
          {sheetId && (
            <Button
              className="gap-2 shrink-0 self-start"
              onClick={() => {
                setReqForm(f => ({ ...f, email: resolvedEmail || f.email }));
                setShowRequestDialog(true);
              }}
            >
              <PlusCircle className="h-4 w-4" />
              Request a New Class
            </Button>
          )}
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings first.</p>
          </div>
        )}

        {/* Week tabs */}
        <div className="flex gap-2 border-b border-border pb-0">
          {weekTabLabels.slice(0, weekCount).map((label, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedWeek(idx as 0 | 1 | 2)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                selectedWeek === idx
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {weekLabel(weekDays[idx]) && (
                <span className="ml-1.5 text-xs font-normal hidden sm:inline">({weekLabel(weekDays[idx])})</span>
              )}
            </button>
          ))}
        </div>

        {/* Calendar content */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load calendar. Please refresh.</p>
          </div>
        ) : currentWeekDays.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground flex flex-col items-center gap-3">
            <Calendar className="h-10 w-10 opacity-30" />
            <p className="font-medium">No classes scheduled this week</p>
            <p className="text-sm">Check back or try the other week tab.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {currentWeekDays.map((day) => (
              <div key={day.dateISO} className="space-y-3">
                {/* Day header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-primary leading-none">{day.dayName.slice(0, 3)}</span>
                    <span className="text-base font-bold text-primary leading-none mt-0.5">
                      {day.date.split("/")[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{day.dayName}</p>
                    <p className="text-xs text-muted-foreground">{day.date}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto">{day.slots.length} {day.slots.length === 1 ? "class" : "classes"}</Badge>
                </div>

                {/* Slots */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {day.slots.map((slot, i) => (
                    <Card
                      key={`${slot.subjectId}-${i}`}
                      className={`overflow-hidden transition-shadow hover:shadow-md ${slot.isFull && !isPrincipal ? "opacity-70" : ""}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm leading-tight">{slot.className}</p>
                            {slot.teacherName && (
                              <p className={`text-xs mt-0.5 ${isPrincipal ? "text-primary font-medium" : "text-muted-foreground"}`}>
                                {isPrincipal ? "👤 " : ""}{slot.teacherName}
                              </p>
                            )}
                            {!slot.teacherName && isPrincipal && (
                              <p className="text-xs mt-0.5 text-amber-600 font-medium">⚠ No teacher assigned</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                            {typeIcon(slot.type)}
                            <span className="text-xs">{slot.type}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {slot.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{slot.time}
                            </span>
                          )}
                          {slot.room && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />{slot.room}
                            </span>
                          )}
                          {slot.zoomLink && (
                            <a href={slot.zoomLink} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline">
                              <Video className="h-3 w-3" />Zoom
                            </a>
                          )}
                        </div>

                        {/* Capacity bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${capacityColor(slot.enrolled, slot.maxCapacity)}`}>
                              {slot.enrolled}/{slot.maxCapacity} enrolled
                            </span>
                            {slot.isFull && <Badge variant="destructive" className="text-xs py-0 px-1.5">Full</Badge>}
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                slot.isFull ? "bg-destructive" :
                                slot.enrolled / slot.maxCapacity >= 0.75 ? "bg-amber-500" : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min((slot.enrolled / slot.maxCapacity) * 100, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Principal: show enrolled student names */}
                        {isPrincipal && slot.students.length > 0 && (
                          <div className="pt-1 border-t border-border/50">
                            <p className="text-xs text-muted-foreground font-medium mb-1">Students:</p>
                            <div className="flex flex-wrap gap-1">
                              {slot.students.map((s, si) => (
                                <span key={si} className="text-xs bg-muted rounded px-1.5 py-0.5">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Booking button — hide for principal */}
                        {!isPrincipal && (
                          <Button
                            size="sm"
                            variant={slot.isFull ? "outline" : "default"}
                            className="w-full gap-1.5"
                            disabled={slot.isFull}
                            onClick={() => {
                              setBookingSlot({ slot, date: day.date });
                              setStudentName("");
                              setParentEmail(resolvedEmail);
                            }}
                          >
                            {slot.isFull ? (
                              "Class Full"
                            ) : (
                              <>
                                Book a Spot
                                <ChevronRight className="h-3.5 w-3.5" />
                              </>
                            )}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request a New Class dialog */}
      <Dialog open={showRequestDialog} onOpenChange={(open) => { if (!open) setShowRequestDialog(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              Request a New Class
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Can't find the class you need? Submit a request and a principal will review and activate it.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-name">Your Name *</Label>
                <Input
                  id="req-name"
                  placeholder="Full name"
                  value={reqForm.name}
                  onChange={e => setReqForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-email">Your Email *</Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="you@example.com"
                  value={reqForm.email}
                  onChange={e => setReqForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-class">Class / Subject Name *</Label>
              <Input
                id="req-class"
                placeholder="e.g. Advanced Mathematics, Guitar Lessons…"
                value={reqForm.className}
                onChange={e => setReqForm(f => ({ ...f, className: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-days">Preferred Days</Label>
                <Input
                  id="req-days"
                  placeholder="e.g. Mon, Wed"
                  value={reqForm.preferredDays}
                  onChange={e => setReqForm(f => ({ ...f, preferredDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-time">Preferred Time</Label>
                <Input
                  id="req-time"
                  placeholder="e.g. 4:00 PM"
                  value={reqForm.preferredTime}
                  onChange={e => setReqForm(f => ({ ...f, preferredTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-notes">Additional Notes</Label>
              <Textarea
                id="req-notes"
                placeholder="Any other details that might help…"
                rows={3}
                value={reqForm.notes}
                onChange={e => setReqForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
            <Button
              disabled={!reqForm.name.trim() || !reqForm.email.trim() || !reqForm.className.trim() || requestClassMutation.isPending}
              onClick={() => requestClassMutation.mutate()}
            >
              {requestClassMutation.isPending ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking dialog */}
      <Dialog open={!!bookingSlot} onOpenChange={(open) => { if (!open) setBookingSlot(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book a Spot</DialogTitle>
          </DialogHeader>
          {bookingSlot && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-sm">{bookingSlot.slot.className}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{bookingSlot.date}</span>
                  {bookingSlot.slot.time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{bookingSlot.slot.time}</span>}
                  {bookingSlot.slot.teacherName && <span>{bookingSlot.slot.teacherName}</span>}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="text-green-700 font-medium">
                    {bookingSlot.slot.maxCapacity - bookingSlot.slot.enrolled} {bookingSlot.slot.maxCapacity - bookingSlot.slot.enrolled === 1 ? "spot" : "spots"} remaining
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="book-student">Student Name *</Label>
                  <Input
                    id="book-student"
                    placeholder="Enter student's full name"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="book-parent">Parent / Guardian Email *</Label>
                  <Input
                    id="book-parent"
                    type="email"
                    placeholder="parent@example.com"
                    value={parentEmail}
                    onChange={e => setParentEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingSlot(null)}>Cancel</Button>
            <Button
              disabled={!studentName.trim() || !parentEmail.trim() || bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
            >
              {bookMutation.isPending ? "Booking…" : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
