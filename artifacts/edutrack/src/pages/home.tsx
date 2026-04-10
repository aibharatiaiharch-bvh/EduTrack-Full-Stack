import { useState } from "react";
import { Link, useLocation } from "wouter";
import { GraduationCap, Users, UserPlus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SHEET_KEY = "edutrack_sheet_id";

export default function Home() {
  const [showEnrollCode, setShowEnrollCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [, setLocation] = useLocation();

  function handleNewContinue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setCodeError("Please enter your School Enrollment Code.");
      return;
    }
    setCodeError("");
    localStorage.setItem(SHEET_KEY, trimmed);
    setLocation("/sign-up");
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

          <div className="rounded-xl border-2 border-dashed border-border bg-white overflow-hidden">
            {!showEnrollCode ? (
              <button
                onClick={() => setShowEnrollCode(true)}
                className="w-full p-5 flex items-center gap-4 text-left hover:bg-muted/40 transition-colors"
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
            ) : (
              <form onSubmit={handleNewContinue} className="p-5 space-y-4 text-left">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">New Student or Family</p>
                    <p className="text-xs text-muted-foreground">Enter the code provided by your school to get started.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schoolCode" className="text-xs font-medium">
                    School Enrollment Code
                  </Label>
                  <Input
                    id="schoolCode"
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setCodeError(""); }}
                    placeholder="Paste your school's enrollment code here"
                    className="text-sm"
                    autoFocus
                  />
                  {codeError && <p className="text-xs text-destructive">{codeError}</p>}
                  <p className="text-xs text-muted-foreground">
                    Don't have a code? Ask your school's front desk or principal.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="flex-1">
                    Continue to Sign Up
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowEnrollCode(false); setCode(""); setCodeError(""); }}
                  >
                    Back
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-white space-y-1">
        <p>© {new Date().getFullYear()} EduTrack. All rights reserved.</p>
        <p>App by <a href="https://qb2bsol.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-colors">Qb2bsol.com</a></p>
      </footer>
    </div>
  );
}
