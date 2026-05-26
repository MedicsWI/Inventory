"use client";

// Push-notification subscribe/unsubscribe component.
// Handles browser permission, service worker registration, and the subscribe-server roundtrip.

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2, Smartphone, AlertCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type Subscription = { id: string; endpoint: string; userAgent: string | null; createdAt: string };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Std);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle({ pushConfigured }: { pushConfigured: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<"sub" | "unsub" | "test" | null>(null);
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [permission, setPermission] = React.useState<NotificationPermission>("default");

  // Detect browser capability + current permission
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  const subs = useQuery({
    queryKey: ["push-subs"],
    queryFn: () => api.get<Subscription[]>("/api/push/subscriptions"),
  });

  // Helper: check if THIS device already has an active subscription.
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration().then((reg) =>
      reg?.pushManager.getSubscription().then((sub) => setThisDeviceSubscribed(!!sub)),
    );
  }, [supported]);

  async function subscribe() {
    if (!pushConfigured) return;
    setBusy("sub");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Notification permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        toast.error("VAPID public key not configured.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      await api.post("/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });
      setThisDeviceSubscribed(true);
      qc.invalidateQueries({ queryKey: ["push-subs"] });
      toast.success("Push enabled on this device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Subscribe failed");
    } finally {
      setBusy(null);
    }
  }

  async function unsubscribe() {
    setBusy("unsub");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setThisDeviceSubscribed(false);
      qc.invalidateQueries({ queryKey: ["push-subs"] });
      toast.success("Push disabled on this device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unsubscribe failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const res = await api.post<{ ok: boolean; sent: number; error?: string }>("/api/push/test", {});
      if (res.ok) toast.success(`Sent. (${res.sent} device${res.sent === 1 ? "" : "s"})`);
      else toast.error(res.error ?? "No devices subscribed yet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(null);
    }
  }

  // --- render ---

  if (supported === null) return null; // hydrating

  if (!supported) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-warn" /> Push not supported in this browser</div>
        <p className="text-xs text-muted-foreground mt-1">
          Try Chrome, Edge, or Firefox. Safari on macOS supports it; iOS Safari supports it only for installed PWAs (use "Add to Home Screen").
        </p>
      </div>
    );
  }

  if (!pushConfigured) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4 text-warn" /> Push not configured</div>
        <p className="text-xs text-muted-foreground mt-1">
          VAPID keys missing. See Admin → Integrations for setup instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {thisDeviceSubscribed ? (
          <Button variant="outline" onClick={unsubscribe} disabled={busy === "unsub"}>
            {busy === "unsub" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Disable push on this device
          </Button>
        ) : (
          <Button onClick={subscribe} disabled={busy === "sub"}>
            {busy === "sub" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Enable push on this device
          </Button>
        )}
        <Button variant="ghost" onClick={sendTest} disabled={busy === "test" || (subs.data?.length ?? 0) === 0}>
          {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test push
        </Button>
      </div>
      {permission === "denied" && (
        <p className="text-xs text-warn">
          Notifications are blocked for this site. Re-enable them in your browser's site settings to subscribe.
        </p>
      )}
      {(subs.data?.length ?? 0) > 0 && (
        <div className="text-xs text-muted-foreground">
          <div className="font-medium mb-1">{subs.data!.length} subscribed device{subs.data!.length === 1 ? "" : "s"}:</div>
          <ul className="space-y-1">
            {subs.data!.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Smartphone className="h-3 w-3" />
                <span className="truncate">{prettyUA(s.userAgent)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function prettyUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Google Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return ua.slice(0, 60);
}
