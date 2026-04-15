import { useState, useEffect } from "react";
import { X, AlertTriangle, Info } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type Announcement = {
  _row: number;
  AnnouncementID: string;
  Title: string;
  Message: string;
  Priority: string;
  IsActive: string;
};

function dismissedKey(id: string) {
  return `edutrack_dismissed_ann_${id}`;
}

export function AnnouncementBanner() {
  const sheetId = localStorage.getItem(SHEET_KEY);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sheetId) return;
    fetch(apiUrl(`/announcements?sheetId=${encodeURIComponent(sheetId)}`))
      .then(r => r.ok ? r.json() : [])
      .then((rows: Announcement[]) => setAnnouncements(rows))
      .catch(() => {});
  }, [sheetId]);

  function dismiss(id: string) {
    localStorage.setItem(dismissedKey(id), "1");
    setDismissed(prev => new Set([...prev, id]));
  }

  const visible = announcements.filter(a =>
    !dismissed.has(a.AnnouncementID) && !localStorage.getItem(dismissedKey(a.AnnouncementID))
  );

  if (!visible.length) return null;

  return (
    <div className="flex flex-col gap-0">
      {visible.map(a => {
        return (
          <div
            key={a.AnnouncementID || a._row}
            className={`flex items-start gap-3 px-4 py-3 text-sm ${
              "bg-amber-50 border-b border-amber-200 text-amber-900"
            }`}
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 min-w-0">
              {a.Title && <span className="font-semibold mr-2">{a.Title}:</span>}
              <span>{a.Message}</span>
            </div>
            <button
              onClick={() => dismiss(a.AnnouncementID || String(a._row))}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
