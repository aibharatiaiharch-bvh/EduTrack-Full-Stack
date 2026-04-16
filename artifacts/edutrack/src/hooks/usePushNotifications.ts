import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const SW_PATH  = "/sw.js";

function getSheetId() { return localStorage.getItem("edutrack_sheet_id") || ""; }
function getUserId()  { return localStorage.getItem("edutrack_user_id")  || ""; }
function getEmail()   { return localStorage.getItem("edutrack_user_email")|| ""; }

async function getVapidPublicKey(): Promise<string> {
  const sheetId = getSheetId();
  const res = await fetch(`${API_BASE}/api/push/vapid-public-key?sheetId=${sheetId}`);
  const data = await res.json();
  return data.publicKey || "";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export type PushState = "unsupported" | "default" | "granted" | "denied" | "loading";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported"); return;
    }
    setState(Notification.permission as PushState);
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setState("loading");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      const publicKey = await getVapidPublicKey();
      if (!publicKey) throw new Error("Could not fetch VAPID public key");

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const sheetId = getSheetId();
      const res = await fetch(`${API_BASE}/api/push/subscribe?sheetId=${sheetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getUserId(),
          email: getEmail(),
          subscription: subscription.toJSON(),
          sheetId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save subscription");

      setState("granted");
    } catch (e: any) {
      setError(e.message || "Subscription failed");
      setState(Notification.permission as PushState);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    const sheetId = getSheetId();
    try {
      const res = await fetch(`${API_BASE}/api/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: getUserId(), email: getEmail(), sheetId }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error || "Test push failed");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  return { state, error, subscribe, sendTest };
}
