"use client";

// /alert-groups — admin roster + broadcast UI for SMS alert groups.
// Pick an event, see who's signed up by topic, hand-add or remove subscribers,
// download/print the QR poster, and (ADMIN/MANAGER) fire a broadcast.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  QrCode,
  UserPlus,
  Trash2,
  Send,
  ShieldAlert,
  Users,
  AlertTriangle,
  ExternalLink,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TOPICS = [
  { value: "LOST_CHILD", label: "Lost child", accent: "bg-brand-red/15 text-brand-red border-red-500/40" },
  { value: "SEVERE_WEATHER", label: "Severe weather", accent: "bg-brand-amber/15 text-brand-amber border-amber-500/40" },
  { value: "ALL_HANDS", label: "All-hands", accent: "bg-brand-cyan/15 text-brand-cyan border-cyan-500/40" },
  { value: "GEAR_RETURN", label: "Gear return", accent: "bg-muted/30 text-muted-foreground border-border" },
] as const;
type Topic = typeof TOPICS[number]["value"];

type EventLite = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED" | "CANCELED";
  startsAt: string | null;
  location: string | null;
};

type Subscriber = {
  id: string;
  eventId: string;
  name: string;
  phone: string;
  department: string | null;
  topics: Topic[];
  source: "QR" | "KIOSK" | "VOLUNTEER" | "ADMIN" | "OPSHUB";
  stopped: boolean;
  stoppedAt: string | null;
  consentAt: string;
};

export default function AlertGroupsPage() {
  const qc = useQueryClient();
  const [eventId, setEventId] = useState<string>("");
  const [topicFilter, setTopicFilter] = useState<Topic | "ALL">("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const { data: events } = useQuery({
    queryKey: ["events", "alert-groups"],
    queryFn: async () => {
      // The endpoint takes one status; fetch ACTIVE + PLANNED and merge.
      const [a, p] = await Promise.all([
        api.get<EventLite[]>("/api/events?status=ACTIVE"),
        api.get<EventLite[]>("/api/events?status=PLANNED"),
      ]);
      return [...a, ...p];
    },
  });

  // Auto-pick the first active event when the list loads.
  useEffect(() => {
    if (!eventId && events && events.length > 0) {
      const active = events.find((e) => e.status === "ACTIVE") ?? events[0];
      setEventId(active.id);
    }
  }, [events, eventId]);

  const { data: subs } = useQuery({
    queryKey: ["alert-subs", eventId, topicFilter],
    queryFn: () =>
      api.get<Subscriber[]>(
        `/api/alert-subscribers?eventId=${eventId}${
          topicFilter !== "ALL" ? `&topic=${topicFilter}` : ""
        }&includeStopped=1`,
      ),
    enabled: !!eventId,
  });

  const event = events?.find((e) => e.id === eventId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-brand-red" /> Alert groups
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Per-event SMS broadcast lists. Anyone at the event scans the QR poster to opt in
            (any department — not just medical / security). Reply STOP to opt out — that&apos;s
            handled automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAddOpen(true)}
            disabled={!eventId}
          >
            <UserPlus className="h-4 w-4" /> Hand-add subscriber
          </Button>
          <Button onClick={() => setBroadcastOpen(true)} disabled={!eventId}>
            <Send className="h-4 w-4" /> Send alert
          </Button>
        </div>
      </header>

      {/* Event picker */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium">Event:</label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(events ?? []).length === 0 && <option value="">No active events</option>}
              {(events ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.status === "ACTIVE" ? "(ACTIVE)" : ""}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1 ml-auto">
              <Button
                size="sm"
                variant={topicFilter === "ALL" ? "default" : "outline"}
                onClick={() => setTopicFilter("ALL")}
              >
                All topics
              </Button>
              {TOPICS.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  variant={topicFilter === t.value ? "default" : "outline"}
                  onClick={() => setTopicFilter(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {eventId && event && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <SubscriberList
              eventId={eventId}
              subs={subs ?? []}
              onChanged={() => qc.invalidateQueries({ queryKey: ["alert-subs"] })}
            />
          </div>
          <div className="space-y-4">
            <QrPoster eventId={eventId} eventName={event.name} />
            <TopicCounts subs={subs ?? []} />
          </div>
        </div>
      )}

      {addOpen && (
        <HandAddDialog
          eventId={eventId}
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["alert-subs"] });
            setAddOpen(false);
          }}
        />
      )}

      {broadcastOpen && event && (
        <BroadcastDialog
          event={event}
          subs={subs ?? []}
          onClose={() => setBroadcastOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- Subscriber list ----------

function SubscriberList({
  eventId,
  subs,
  onChanged,
}: {
  eventId: string;
  subs: Subscriber[];
  onChanged: () => void;
}) {
  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/alert-subscribers/${id}`),
    onSuccess: () => {
      toast.success("Subscriber removed");
      onChanged();
    },
    onError: (e) => toast.error(String(e)),
  });

  const toggleStopMut = useMutation({
    mutationFn: (vars: { id: string; stopped: boolean }) =>
      api.patch(`/api/alert-subscribers/${vars.id}`, { stopped: vars.stopped }),
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(String(e)),
  });

  if (subs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/60" />
          <div>No subscribers for this filter yet.</div>
          <div>Post the QR poster at staff check-in to start collecting opt-ins.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Subscribers ({subs.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-left p-2">Department</th>
                <th className="text-left p-2">Topics</th>
                <th className="text-left p-2">Source</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className={s.stopped ? "border-t border-border opacity-50" : "border-t border-border hover:bg-accent/40"}>
                  <td className="p-2 font-medium">{s.name}</td>
                  <td className="p-2 font-mono text-xs">{s.phone}</td>
                  <td className="p-2 text-xs">{s.department ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {s.topics.map((t) => {
                        const meta = TOPICS.find((x) => x.value === t);
                        return (
                          <Badge key={t} variant="outline" className={meta?.accent}>
                            {meta?.label ?? t}
                          </Badge>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {s.source}
                    {s.stopped && (
                      <Badge variant="outline" className="ml-1 bg-muted/30 text-muted-foreground border-border">
                        STOPPED
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleStopMut.mutate({ id: s.id, stopped: !s.stopped })}
                      title={s.stopped ? "Re-enable" : "Mute"}
                    >
                      {s.stopped ? "Re-enable" : "Mute"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Remove ${s.name} from this event's alert list?`)) {
                          delMut.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- QR poster ----------

function QrPoster({ eventId, eventName }: { eventId: string; eventName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [origin, setOrigin] = useState<string>("");
  const signupUrl = `${origin}/events/${eventId}/alert-signup`;

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !origin) return;
    // bwip-js is heavy — load only on the client when we actually render
    import("bwip-js").then((bwipjs) => {
      try {
        bwipjs.toCanvas(canvasRef.current!, {
          bcid: "qrcode",
          text: signupUrl,
          scale: 6,
          padding: 10,
          backgroundcolor: "FFFFFF",
        });
      } catch {
        // ignore — page will still render with the URL below
      }
    });
  }, [signupUrl, origin]);

  function printPoster() {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>${eventName} — alert signup</title>
      <style>body{font-family:system-ui;text-align:center;padding:48px}
      h1{font-size:32px;margin:0 0 8px}h2{font-size:20px;color:#555;margin:0 0 32px}
      img{max-width:480px;width:80vmin}p{margin-top:24px;font-size:14px;color:#444;max-width:480px;display:inline-block}</style>
      </head><body>
      <h1>${eventName}</h1>
      <h2>Scan to join event alerts</h2>
      <img src="${dataUrl}" />
      <p><strong>Lost child · Severe weather · All-hands</strong></p>
      <p style="font-size:11px;color:#888">Medics Wisconsin · Standard message/data rates apply. Reply STOP to opt out.</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 250);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-4 w-4 text-brand-cyan" /> QR signup poster
        </CardTitle>
        <CardDescription>Post at staff check-in. Anyone can scan — no login.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-white p-3 rounded-md grid place-items-center">
          <canvas ref={canvasRef} />
        </div>
        <div className="text-xs text-muted-foreground break-all font-mono">{signupUrl}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={printPoster}>
            <Printer className="h-4 w-4" /> Print poster
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={signupUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Topic counts ----------

function TopicCounts({ subs }: { subs: Subscriber[] }) {
  const counts = useMemo(() => {
    const active = subs.filter((s) => !s.stopped);
    return TOPICS.map((t) => ({
      ...t,
      count: active.filter((s) => s.topics.includes(t.value)).length,
    }));
  }, [subs]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By topic</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {counts.map((c) => (
          <div key={c.value} className="flex items-center justify-between text-sm">
            <Badge variant="outline" className={c.accent}>{c.label}</Badge>
            <span className="font-semibold">{c.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Hand-add dialog ----------

function HandAddDialog({
  eventId,
  onClose,
  onSuccess,
}: {
  eventId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    department: "",
    topics: ["LOST_CHILD"] as Topic[],
  });

  const mut = useMutation({
    mutationFn: () =>
      api.post("/api/alert-subscribers", {
        eventId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        department: form.department.trim() || null,
        topics: form.topics,
        source: "ADMIN",
      }),
    onSuccess: () => {
      toast.success("Subscriber added");
      onSuccess();
    },
    onError: (e) => toast.error(String(e)),
  });

  function toggle(t: Topic) {
    setForm((f) => ({
      ...f,
      topics: f.topics.includes(t) ? f.topics.filter((x) => x !== t) : [...f.topics, t],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Hand-add subscriber</CardTitle>
          <CardDescription>For people who can&apos;t scan the QR.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Phone (+19205551234)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <div>
            <div className="text-xs font-medium mb-2">Topics</div>
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm border border-border rounded-md p-2 cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={form.topics.includes(t.value)}
                    onChange={() => toggle(t.value)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !form.name.trim() || !form.phone.trim() || form.topics.length === 0}
            >
              <UserPlus className="h-4 w-4" /> {mut.isPending ? "Saving…" : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Broadcast dialog ----------

function BroadcastDialog({
  event,
  subs,
  onClose,
}: {
  event: EventLite;
  subs: Subscriber[];
  onClose: () => void;
}) {
  const [topic, setTopic] = useState<Topic>("LOST_CHILD");
  const [body, setBody] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const activeForTopic = subs.filter((s) => !s.stopped && s.topics.includes(topic)).length;
  const namesMatch = confirmName.trim().toLowerCase() === event.name.trim().toLowerCase();

  const mut = useMutation({
    mutationFn: () =>
      api.post<{ alertId: string; queued: number; failed: number; total: number }>(
        "/api/alerts/broadcast",
        { eventId: event.id, topic, body, confirmEventName: confirmName },
      ),
    onSuccess: (r) => {
      toast.success(`Alert sent — ${r.queued} delivered, ${r.failed} failed (of ${r.total})`);
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg border-brand-red/40" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-brand-red" /> Send alert
          </CardTitle>
          <CardDescription>
            This sends an SMS to <strong>{activeForTopic}</strong> subscriber{activeForTopic === 1 ? "" : "s"} of
            this event for the selected topic. Cannot be recalled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-xs font-medium mb-1">Topic</div>
            <div className="flex flex-wrap gap-1">
              {TOPICS.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  variant={topic === t.value ? "default" : "outline"}
                  onClick={() => setTopic(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Message (max 480 chars)</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={480}
              className="w-full h-28 rounded-md border border-input bg-background p-3 text-sm"
              placeholder="Lost child: 6yo girl, pink shirt, last seen near Mainstage. If found, bring to Info Booth."
            />
            <div className="text-xs text-muted-foreground text-right">{body.length}/480</div>
          </div>

          <div className="rounded-md border border-amber-500/40 bg-brand-amber/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-brand-amber shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Confirm event name to send</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Type <strong>{event.name}</strong> exactly to authorize.
                </div>
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={event.name}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !namesMatch || !body.trim() || activeForTopic === 0}
              className="bg-brand-red hover:bg-brand-red/90"
            >
              <Send className="h-4 w-4" /> {mut.isPending ? "Sending…" : `Send to ${activeForTopic}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
