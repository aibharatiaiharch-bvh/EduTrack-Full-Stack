import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Loader2, Clock, LogOut, ShieldCheck, UserPlus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

// Shown when the user's email is not in the Users tab yet
function NotFoundScreen({ sheetId, onEnroll }: { sheetId: string; onEnroll: () => void }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Account Not Found</h1>
        <p className="text-muted-foreground text-sm">
          Your email isn't registered in this school's system yet. What would you like to do?
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Button
            className="w-full gap-2"
            onClick={onEnroll}
          >
            <UserPlus className="w-4 h-4" />
            Submit Enrolment Request
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => window.location.href = `${BASE}/settings`}
          >
            <Settings className="w-4 h-4" />
            I'm an Administrator — Go to Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If you're a tutor or staff member, contact your principal to be added to the Users tab in the school's Google Sheet.
        </p>
      </div>
    </div>
  );
}

// Shown when the Users tab itself doesn't exist (sheet not seeded yet)
function SetupRequiredScreen() {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Sheet Setup Required</h1>
        <p className="text-muted-foreground text-sm">
          Your Google Sheet hasn't been set up yet. As the administrator, go to Settings and click <strong>"Set up columns & add sample data"</strong> to initialise the sheet, then sign in again.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Button
            className="w-full gap-2"
            onClick={() => window.location.href = `${BASE}/settings`}
          >
            <Settings className="w-4 h-4" />
            Go to Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

// Shown when account exists but is pending activation
function PendingApprovalScreen({ name }: { name: string }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Pending Approval</h1>
        <p className="text-muted-foreground text-sm">
          Hi{name ? ` ${name}` : ""}! Your enrolment request has been received.
          A staff member or principal will review and activate your account shortly.
          Once activated you'll be able to sign in and access your portal.
        </p>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

type Screen = "loading" | "pending" | "not-found" | "setup-required";

export default function AuthRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<Screen>("loading");
  const [statusMsg, setStatusMsg] = useState("Checking your account…");
  const [pendingName, setPendingName] = useState("");
  const [sheetId, setSheetId] = useState("");

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setLocation("/");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress || "";
    const sid = localStorage.getItem(SHEET_KEY) || "";
    setSheetId(sid);

    if (!sid) {
      setScreen("setup-required");
      return;
    }

    setStatusMsg("Looking up your account…");

    fetch(apiUrl(`/roles/check?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sid)}`))
      .then((r) => r.json())
      .then((data) => {
        // Sheet isn't set up at all
        if (data.tabMissing) {
          setScreen("setup-required");
          return;
        }

        // Email not in Users tab
        if (!data.found || !data.role) {
          setScreen("not-found");
          return;
        }

        // Account exists but pending approval
        if (data.status === "pending") {
          setPendingName(data.name || "");
          setScreen("pending");
          return;
        }

        // Active — route by role
        const role: string = data.role;
        if (role === "admin") {
          setStatusMsg("Welcome, Admin. Redirecting…");
          setTimeout(() => setLocation("/admin"), 500);
        } else if (role === "principal") {
          setStatusMsg("Welcome, Principal. Redirecting…");
          setTimeout(() => setLocation("/principal"), 500);
        } else if (role === "tutor") {
          setStatusMsg("Welcome back. Redirecting to your dashboard…");
          setTimeout(() => setLocation("/dashboard"), 500);
        } else if (role === "parent") {
          setStatusMsg("Welcome. Redirecting to the Parent Portal…");
          setTimeout(() => setLocation("/parent"), 500);
        } else {
          setLocation("/");
        }
      })
      .catch(() => {
        // Network error — send admin to settings, don't trap them
        setScreen("setup-required");
      });
  }, [isLoaded, isSignedIn, user, setLocation]);

  if (screen === "setup-required") return <SetupRequiredScreen />;
  if (screen === "pending") return <PendingApprovalScreen name={pendingName} />;
  if (screen === "not-found") return (
    <NotFoundScreen
      sheetId={sheetId}
      onEnroll={() => setLocation(`/enroll?sheetId=${encodeURIComponent(sheetId)}`)}
    />
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{statusMsg}</p>
    </div>
  );
}
