import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Loader2, Clock, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

// Shown when the user's email is not registered
function NotFoundScreen({ sheetId, onEnroll }: { sheetId: string; onEnroll: () => void }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          Your email is not registered in this school's system. Only approved users can sign in.
          If you're a new family, you can submit an enrolment request below.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Button className="w-full gap-2" onClick={onEnroll}>
            <UserPlus className="w-4 h-4" />
            Submit Enrolment Request
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
          Tutors and staff must be added to the Users tab by a principal before they can sign in.
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
          Your Google Sheet hasn't been set up yet. Go to the Developer Portal to initialise the sheet,
          then sign in again.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <Button className="w-full" onClick={() => window.location.href = `${BASE}/admin`}>
            Go to Developer Portal
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

// Shown when the account exists but is still pending activation
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

// Shown when the account is Inactive — either new (awaiting payment) or deactivated
function InactiveScreen({ name }: { name: string }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Awaiting Activation</h1>
        <p className="text-muted-foreground text-sm">
          Hi{name ? ` ${name}` : ""}! Your enrolment request has been received.
          Your account will be activated once payment is confirmed by the principal.
          You'll be able to sign in and access your portal once that's done.
        </p>
        <p className="text-xs text-muted-foreground">
          Already paid? Contact your school's front desk or principal to confirm activation.
        </p>
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => window.location.href = "/principal"}
        >
          <ShieldCheck className="w-4 h-4" />
          Principal Dashboard
        </Button>
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

type Screen = "loading" | "pending" | "inactive" | "not-found" | "setup-required";

export default function AuthRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<Screen>("loading");
  const [statusMsg, setStatusMsg] = useState("Checking your account…");
  const [userName, setUserName] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setScreen("loading");
      setStatusMsg("Enter the email you want to use to sign in.");
      return;
    }

    const sid = localStorage.getItem(SHEET_KEY) || "";
    setSheetId(sid);

    if (!sid) {
      setStatusMsg("No Google Sheet linked. Please sign in with your school email.");
    }

    setStatusMsg("Looking up your account…");
    const activeEmail = submittedEmail || user.primaryEmailAddress?.emailAddress || "";
    fetch(apiUrl(`/roles/check?email=${encodeURIComponent(activeEmail)}&sheetId=${encodeURIComponent(sid)}`))
      .then((r) => r.json())
      .then((data) => {
        if (data.tabMissing) {
          setScreen("setup-required");
          return;
        }

        if (!data.found || !data.role) {
          setScreen("not-found");
          return;
        }

        setUserName(data.name || "");

        if (data.status === "pending") {
          setScreen("pending");
          return;
        }

        if (data.status === "inactive") {
          setScreen("inactive");
          return;
        }

        // Active user — store role for portal-aware UI, then route
        const role: string = data.role;
        localStorage.removeItem("edutrack_dev_role_override");
        localStorage.setItem("edutrack_user_role", role);
        if (data.name) localStorage.setItem("edutrack_user_name", data.name);
        if (data.userId) localStorage.setItem("edutrack_user_id", data.userId);

        if (role === "developer" || role === "admin") {
          setStatusMsg("Welcome, Developer. Redirecting…");
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
        } else if (role === "student") {
          setStatusMsg("Welcome. Redirecting to your schedule…");
          setTimeout(() => setLocation("/student"), 500);
        } else {
          setLocation("/");
        }
      })
      .catch(() => {
        setScreen("setup-required");
      });
  }, [isLoaded, isSignedIn, user, setLocation]);

  if (screen === "pending")  return <PendingApprovalScreen name={userName} />;
  if (screen === "inactive") return <InactiveScreen name={userName} />;
  if (screen === "not-found") return (
    <NotFoundScreen
      sheetId={sheetId}
      onEnroll={() => setLocation(`/enroll?sheetId=${encodeURIComponent(sheetId)}`)}
    />
  );

  if (screen === "setup-required") return <SetupRequiredScreen />;

  if (!isSignedIn || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Sign in with email</h1>
            <p className="text-sm text-muted-foreground">
              Enter the email that exists in the Users tab.
            </p>
          </div>
          <div className="space-y-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
            <Button
              className="w-full"
              disabled={!email.trim() || isSubmittingEmail}
              onClick={async () => {
                const next = email.trim().toLowerCase();
                if (!next) return;
                setIsSubmittingEmail(true);
                setSubmittedEmail(next);
                localStorage.removeItem("edutrack_dev_role_override");
                await signOut({ redirectUrl: `${BASE}/auth-redirect` });
              }}
            >
              {isSubmittingEmail ? "Sending…" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{statusMsg}</p>
    </div>
  );
}
