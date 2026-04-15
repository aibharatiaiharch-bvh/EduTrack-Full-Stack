import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { FlaskConical, X } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  tutor: "Tutor",
  parent: "Parent",
  principal: "Principal",
  student: "Student",
};

const DISMISSED_KEY = "edutrack_dev_banner_dismissed";

export function DevModeBanner() {
  const [, setLocation] = useLocation();
  const override = localStorage.getItem("edutrack_dev_role_override");
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "true");

  useEffect(() => {
    if (!override) {
      setDismissed(false);
      localStorage.removeItem(DISMISSED_KEY);
    }
  }, [override]);

  if (!override || dismissed) return null;

  function exitTestMode() {
    localStorage.removeItem("edutrack_dev_role_override");
    localStorage.setItem("edutrack_user_role", "developer");
    localStorage.removeItem(DISMISSED_KEY);
    setLocation("/admin");
  }

  function dismissBanner() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm shadow-xl border border-purple-500">
      <FlaskConical className="w-4 h-4 shrink-0" />
      <span>Dev preview: <strong>{ROLE_LABELS[override] || override}</strong></span>
      <button
        onClick={dismissBanner}
        className="ml-1 rounded p-0.5 hover:bg-purple-700 transition-colors"
        title="Dismiss banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={exitTestMode}
        className="ml-1 rounded px-2 py-0.5 text-xs bg-purple-700 hover:bg-purple-800 transition-colors"
        title="Exit test mode"
      >
        Exit
      </button>
    </div>
  );
}
