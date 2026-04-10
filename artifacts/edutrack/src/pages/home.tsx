import { useLocation } from "wouter";
import { GraduationCap, Users, UserPlus, ArrowRight } from "lucide-react";
import { Link } from "wouter";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Home() {
  const [, setLocation] = useLocation();

  function handleNewStudent() {
    const sheetId = localStorage.getItem(SHEET_KEY) || "";
    if (sheetId) {
      setLocation(`/enroll?sheetId=${encodeURIComponent(sheetId)}`);
    } else {
      setLocation("/enroll");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center bg-white border-b border-border shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
          <span className="text-xl font-semibold text-foreground">EduTrack</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Welcome to EduTrack
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              Select your portal to continue.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/sign-in">
              <div className="group cursor-pointer rounded-xl border-2 border-border bg-white p-6 text-left hover:border-primary hover:shadow-md transition-all duration-200">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-1">Tutor / Staff</h2>
                <p className="text-sm text-muted-foreground">
                  Access your dashboard, manage classes, students, and attendance.
                </p>
              </div>
            </Link>

            <Link href="/parent">
              <div className="group cursor-pointer rounded-xl border-2 border-border bg-white p-6 text-left hover:border-primary hover:shadow-md transition-all duration-200">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-1">Parent Portal</h2>
                <p className="text-sm text-muted-foreground">
                  View your child's enrolments, attendance, and manage cancellations.
                </p>
              </div>
            </Link>
          </div>

          <button
            onClick={handleNewStudent}
            className="w-full rounded-xl border-2 border-dashed border-border bg-white p-5 flex items-center gap-4 text-left hover:bg-muted/40 hover:border-orange-300 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">New Student or Family?</p>
              <p className="text-xs text-muted-foreground">
                Sign up and submit an enrolment request — your school will activate your account.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-white space-y-1">
        <p>© {new Date().getFullYear()} EduTrack. All rights reserved.</p>
        <p>App by <a href="https://qb2bsol.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-colors">Qb2bsol.com</a></p>
      </footer>
    </div>
  );
}
