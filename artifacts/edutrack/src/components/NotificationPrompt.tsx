import { Bell, BellOff, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useState } from "react";

export function NotificationPrompt() {
  const { state, error, subscribe, sendTest } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [tested, setTested] = useState(false);

  if (state === "unsupported" || state === "denied" || dismissed) return null;

  if (state === "granted") {
    if (tested) return null;
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm mb-4">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <span className="text-green-800 flex-1">Class reminders are on. You'll get a push 15 minutes before each class.</span>
        <button
          className="text-xs text-green-700 underline underline-offset-2"
          onClick={async () => { await sendTest(); setTested(true); }}
        >
          Send test
        </button>
        <button onClick={() => setDismissed(true)} className="text-green-600 hover:text-green-800">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm mb-4">
      <Bell className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="flex-1">
        <p className="text-blue-900 font-medium">Enable class reminders</p>
        <p className="text-blue-700 text-xs mt-0.5">Get a notification 15 minutes before each class — free, no app needed.</p>
        {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
      </div>
      <Button size="sm" onClick={subscribe} disabled={state === "loading"} className="gap-1 shrink-0">
        <Bell className="w-3 h-3" />
        {state === "loading" ? "Setting up…" : "Turn on"}
      </Button>
      <button onClick={() => setDismissed(true)} className="text-blue-500 hover:text-blue-700">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
