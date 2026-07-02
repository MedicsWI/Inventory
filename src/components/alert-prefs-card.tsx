"use client";

// Compact alert-preferences card for the /notifications page.
// What: expiration + low-stock toggles. How: email / Teams / push / SMS.
// Push includes per-device enrollment (service worker + VAPID subscribe).
// Only ADMIN/MANAGER see this — the sweep only queries those roles.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Prefs = {
  receiveExpirationAlerts: boolean | null;
  receiveLowStockAlerts: boolean | null;
  receiveAlertsByEmail: boolean;
  receiveAlertsByTeams: boolean;
  receiveAlertsByPush: boolean;
  receiveAlertsBySms: boolean;
  phone: string | null;
  role: "ADMIN" | "MANAGER" | "MEDIC";
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function AlertPrefsCard() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [phoneDraft, setPhoneDraft] = React.useState<string | null>(null);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [thisDeviceOn, setThisDeviceOn] = React.useState<boolean | null>(null);

  const isManager = session?.user.role === "ADMIN" || session?.user.role === "MANAGER";

  const { data: prefs } = useQuery({
    queryKey: ["alert-prefs"],
    queryFn: () => api.get<Prefs>("/api/me/alert-prefs"),
    enabled: isManager,
  });

  // Is THIS browser already push-subscribed?
  React.useEffect(() => {
    if (!isManager) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setThisDeviceOn(false);
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => setThisDeviceOn(!!sub))
      .catch(() => setThisDeviceOn(false));
  }, [isManager]);

  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api.patch<Prefs>("/api/me/alert-prefs", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-prefs"] });
      toast.success("Preferences saved");
      setPhoneDraft(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  async function enablePushOnThisDevice() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      toast.error("Push isn't configured on the server (VAPID keys missing).");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("This browser doesn't support push notifications.");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked for this site — allow them in browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
        }));
      const json = sub.toJSON();
      await api.post("/api/push/subscribe", {
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        userAgent: navigator.userAgent,
      });
      if (!prefs?.receiveAlertsByPush) await save.mutateAsync({ receiveAlertsByPush: true });
      setThisDeviceOn(true);
      toast.success("Push enabled on this device");
    } catch (e) {
      toast.error(`Couldn't enable push: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushOnThisDevice() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setThisDeviceOn(false);
      toast.success("Push disabled on this device");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPushBusy(false);
    }
  }

  if (!isManager || !prefs) return null;

  const Toggle = ({
    label,
    checked,
    onChange,
    hint,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    hint?: string;
  }) => (
    <label className="flex items-start gap-2 cursor-pointer text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        disabled={save.isPending}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" /> Alert preferences
        </CardTitle>
        <CardDescription>
          What the daily sweep sends you, and where. Admins and managers always get email.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Alerts</div>
          <Toggle
            label="Expiration alerts"
            checked={prefs.receiveExpirationAlerts !== false}
            onChange={(v) => save.mutate({ receiveExpirationAlerts: v })}
          />
          <Toggle
            label="Low-stock alerts"
            checked={prefs.receiveLowStockAlerts !== false}
            onChange={(v) => save.mutate({ receiveLowStockAlerts: v })}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">Channels</div>
          <Toggle
            label="Teams channel post"
            checked={prefs.receiveAlertsByTeams}
            onChange={(v) => save.mutate({ receiveAlertsByTeams: v })}
          />
          <Toggle
            label="Push notifications"
            checked={prefs.receiveAlertsByPush}
            onChange={(v) => save.mutate({ receiveAlertsByPush: v })}
            hint="Also enable each device below."
          />
          <Toggle
            label="SMS"
            checked={prefs.receiveAlertsBySms}
            onChange={(v) => save.mutate({ receiveAlertsBySms: v })}
            hint={prefs.phone ? `Texts ${prefs.phone}` : "Needs a phone number."}
          />
          {(prefs.receiveAlertsBySms || phoneDraft !== null) && (
            <div className="flex gap-2">
              <Input
                className="h-9"
                placeholder="+19205551234"
                value={phoneDraft ?? prefs.phone ?? ""}
                onChange={(e) => setPhoneDraft(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={phoneDraft === null || save.isPending}
                onClick={() => save.mutate({ phone: phoneDraft })}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 border-t pt-3">
          <Smartphone className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            This device: {thisDeviceOn === null ? "…" : thisDeviceOn ? "push enabled" : "push not enabled"}
          </span>
          {thisDeviceOn ? (
            <Button size="sm" variant="outline" disabled={pushBusy} onClick={disablePushOnThisDevice}>
              {pushBusy && <Loader2 className="h-4 w-4 animate-spin" />} Disable on this device
            </Button>
          ) : (
            <Button size="sm" disabled={pushBusy} onClick={enablePushOnThisDevice}>
              {pushBusy && <Loader2 className="h-4 w-4 animate-spin" />} Enable on this device
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
