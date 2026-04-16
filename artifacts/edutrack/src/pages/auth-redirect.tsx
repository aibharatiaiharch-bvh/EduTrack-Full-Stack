import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type Portal = { label: string; description: string; path: string; icon: React.ReactNode };

const PORTALS: Portal[] = [
  {
    label: "Admin",
    description: "Full system access, configuration, and user management",
    path: "/admin",
    icon: <ShieldCheck className="w-6 h-6" />,
  },
  {
    label: "Principal",
    description: "Enrollment requests, students, tutors, and school overview",
    path: "/principal",
    icon: <Users className="w-6 h-6" />,
  },
];

function PortalSelector() {
  const [, setLocation] = useLocation();
  const name = localStorage.getItem("edutrack_user_name") || "Developer";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto">
            <GraduationCap className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold">Welcome, {name}</h1>
          <p className="text-sm text-muted-foreground">Choose a portal to enter</p>
        </div>

        <div className="space-y-3">
          {PORTALS.map((p) => (
            <button
              key={p.path}
              onClick={() => setLocation(p.path)}
              className="w-full flex items-start gap-4 p-4 rounded-xl border bg-card text-left hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {p.icon}
              </div>
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AuthRedirect() {
  const [, setLocation] = useLocation();
  const [showSelector, setShowSelector] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("edutrack_user_role");
    if (role === "developer") {
      setShowSelector(true);
    } else if (role === "admin") {
      setLocation("/admin");
    } else if (role === "principal") {
      setLocation("/principal");
    } else {
      setLocation("/sign-in");
    }
  }, []);

  if (showSelector) return <PortalSelector />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
