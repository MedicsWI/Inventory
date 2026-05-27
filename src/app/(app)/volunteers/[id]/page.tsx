"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2, ShieldCheck, ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/dialog-provider";
import { formatDate } from "@/lib/utils";

const CRED_LEVELS = [
  "EMR", "EMT", "AEMT", "PARAMEDIC", "RN", "LPN", "MD", "DO", "PA", "NP",
  "SECURITY", "POLICE", "FIRE", "CHAPLAIN", "OTHER",
] as const;

type Volunteer = {
  id: string;
  type: "MEDICAL" | "SECURITY";
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  state: string | null;
  dob: string | null;
  shirtSize: string | null;
  credLevel: (typeof CRED_LEVELS)[number] | null;
  credNumber: string | null;
  credExpiresAt: string | null;
  credVerified: boolean;
  credVerifiedBy: { id: string; name: string | null; email: string } | null;
  credVerifiedAt: string | null;
  cartWaiverSigned: boolean;
  emailListOptIn: boolean;
  welcomeEmailSent: boolean;
  camping: boolean;
  shiftCount: number | null;
  returning: boolean;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  signOuts: { id: string; event: { id: string; name: string; startsAt: string | null } }[];
};

// Convert ISO string to YYYY-MM-DD for <input type="date">
function isoToDate(s: string | null): string {
  if (!s) return "";
  return s.slice(0, 10);
}

export default function VolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["volunteer", id],
    queryFn: () => api.get<Volunteer>(`/api/volunteers/${id}`),
  });

  const [form, setForm] = useState<Partial<Volunteer> | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Volunteer>) => api.patch(`/api/volunteers/${id}`, patch),
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["volunteer", id] });
      qc.invalidateQueries({ queryKey: ["volunteers"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/volunteers/${id}`),
    onSuccess: () => {
      toast.success("Volunteer deleted.");
      router.push("/volunteers");
    },
    onError: (e) => toast.error(String(e)),
  });

  if (isLoading || !form) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div>Not found.</div>;

  function handleSave() {
    if (!form) return;
    save.mutate({
      type: form.type,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || null,
      state: form.state || null,
      dob: form.dob ? new Date(form.dob).toISOString() : null,
      shirtSize: form.shirtSize || null,
      credLevel: form.credLevel || null,
      credNumber: form.credNumber || null,
      credExpiresAt: form.credExpiresAt ? new Date(form.credExpiresAt).toISOString() : null,
      credVerified: form.credVerified,
      cartWaiverSigned: form.cartWaiverSigned,
      emailListOptIn: form.emailListOptIn,
      welcomeEmailSent: form.welcomeEmailSent,
      camping: form.camping,
      returning: form.returning,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
      notes: form.notes || null,
    });
  }

  function set<K extends keyof Volunteer>(key: K, value: Volunteer[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/volunteers"><ChevronLeft className="h-4 w-4" /> Volunteers</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{data.type}</Badge>
            {data.credVerified ? (
              <Badge variant="ok" className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Verified
                {data.credVerifiedBy && (
                  <span className="text-xs ml-1">by {data.credVerifiedBy.name ?? data.credVerifiedBy.email}</span>
                )}
              </Badge>
            ) : (
              <Badge variant="warn" className="inline-flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Needs verification
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-1">{data.firstName} {data.lastName}</h1>
          <p className="text-sm text-muted-foreground">{data.email}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={save.isPending}>
            <Save className="h-4 w-4" /> Save
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this volunteer?",
                description: "This removes the volunteer record but keeps any event sign-out history.",
                confirmText: "Delete",
                variant: "destructive",
              });
              if (ok) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.type ?? "MEDICAL"} onChange={(e) => set("type", e.target.value as "MEDICAL" | "SECURITY")} className="h-10 w-full rounded-md border bg-background px-3">
              <option value="MEDICAL">MEDICAL</option>
              <option value="SECURITY">SECURITY</option>
            </select>
          </Field>
          <Field label="State (2-letter)">
            <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value.toUpperCase())} maxLength={2} />
          </Field>
          <Field label="First name *">
            <Input value={form.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Last name *">
            <Input value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
          <Field label="Email *">
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone (E.164)">
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+14145551234" />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={isoToDate(form.dob ?? null)} onChange={(e) => set("dob", e.target.value || null)} />
          </Field>
          <Field label="Shirt size">
            <Input value={form.shirtSize ?? ""} onChange={(e) => set("shirtSize", e.target.value)} placeholder="L" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credential</CardTitle>
          <CardDescription>You verify each license — flip Verified once you&apos;ve confirmed it.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Level">
            <select value={form.credLevel ?? ""} onChange={(e) => set("credLevel", (e.target.value || null) as Volunteer["credLevel"])} className="h-10 w-full rounded-md border bg-background px-3">
              <option value="">— None —</option>
              {CRED_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="License / cert number">
            <Input value={form.credNumber ?? ""} onChange={(e) => set("credNumber", e.target.value)} />
          </Field>
          <Field label="Expiration date">
            <Input type="date" value={isoToDate(form.credExpiresAt ?? null)} onChange={(e) => set("credExpiresAt", e.target.value || null)} />
          </Field>
          <Field label="Verified">
            <label className="flex items-center gap-2 h-10">
              <input type="checkbox" className="h-5 w-5" checked={form.credVerified ?? false} onChange={(e) => set("credVerified", e.target.checked)} />
              <span className="text-sm">I&apos;ve verified this license</span>
            </label>
          </Field>
          {data.credVerifiedAt && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Verified {formatDate(data.credVerifiedAt)}
              {data.credVerifiedBy && <> by {data.credVerifiedBy.name ?? data.credVerifiedBy.email}</>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acknowledgments</CardTitle>
          <CardDescription>Waivers, opt-ins, and confirmations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Checkbox label="Cart waiver signed" checked={form.cartWaiverSigned ?? false} onChange={(v) => set("cartWaiverSigned", v)} />
          <Checkbox label="Email list opt-in" checked={form.emailListOptIn ?? false} onChange={(v) => set("emailListOptIn", v)} />
          <Checkbox label="Welcome email sent / acknowledged" checked={form.welcomeEmailSent ?? false} onChange={(v) => set("welcomeEmailSent", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Event context</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Checkbox label="Camping at events" checked={form.camping ?? false} onChange={(v) => set("camping", v)} />
          <Checkbox label="Returning volunteer (not new)" checked={form.returning ?? false} onChange={(v) => set("returning", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Emergency contact</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} />
          </Field>
          <Field label="Phone (E.164)">
            <Input value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} placeholder="+14145551235" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </CardContent>
      </Card>

      {data.signOuts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Event history ({data.signOuts.length})</CardTitle>
            <CardDescription>Events this volunteer has worked.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {data.signOuts.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-2">
                <Link href={`/events/${s.event.id}`} className="hover:underline">{s.event.name}</Link>
                <span className="text-xs text-muted-foreground">{s.event.startsAt ? formatDate(s.event.startsAt) : ""}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
