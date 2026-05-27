"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Users, Upload, ShieldAlert, CheckCircle2, AlertTriangle, Search, Stethoscope, Shield, Mail, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Volunteer = {
  id: string;
  type: "MEDICAL" | "SECURITY";
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  credLevel: string | null;
  credNumber: string | null;
  credExpiresAt: string | null;
  credVerified: boolean;
  cartWaiverSigned: boolean;
  emailListOptIn: boolean;
  welcomeEmailSent: boolean;
  emergencyContactName: string | null;
  dob: string | null;
};

type NewVolunteerForm = {
  type: "MEDICAL" | "SECURITY";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  shirtSize: string;
};

const EMPTY_NEW: NewVolunteerForm = {
  type: "MEDICAL",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  state: "WI",
  shirtSize: "",
};

export default function VolunteersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"ALL" | "MEDICAL" | "SECURITY">("ALL");
  const [filter, setFilter] = useState<"ALL" | "UNVERIFIED" | "EXPIRING">("ALL");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newV, setNewV] = useState<NewVolunteerForm>(EMPTY_NEW);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "ALL") params.set("type", type);
  if (filter === "UNVERIFIED") params.set("verified", "no");
  if (filter === "EXPIRING") params.set("expiringSoon", "1");

  const { data, isLoading } = useQuery({
    queryKey: ["volunteers", q, type, filter],
    queryFn: () => api.get<Volunteer[]>(`/api/volunteers?${params.toString()}`),
  });

  const importMut = useMutation({
    mutationFn: (csv: string) =>
      api.post<{ summary: { created: number; updated: number; skipped: number; errored: number; total: number } }>(
        "/api/volunteers/import", { csv },
      ),
    onSuccess: (r) => {
      const s = r.summary;
      toast.success(`Imported: ${s.created} created, ${s.updated} updated, ${s.skipped} skipped, ${s.errored} errors`);
      qc.invalidateQueries({ queryKey: ["volunteers"] });
      setCsvOpen(false);
      setCsvText("");
    },
    onError: (e) => toast.error(String(e)),
  });

  const digestMut = useMutation({
    mutationFn: () =>
      api.post<{ sent?: number; failed?: number; flagged?: number; reason?: string }>(
        "/api/volunteers/missing-data-alert", {},
      ),
    onSuccess: (r) => {
      if (r.reason) toast.success(r.reason);
      else toast.success(`Digest sent to ${r.sent ?? 0} recipient(s) — ${r.flagged ?? 0} volunteers flagged`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const addMut = useMutation({
    mutationFn: (body: NewVolunteerForm) =>
      api.post<{ id: string }>("/api/volunteers", {
        type: body.type,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone.trim() || null,
        state: body.state.trim().toUpperCase().slice(0, 2) || null,
        shirtSize: body.shirtSize.trim() || null,
      }),
    onSuccess: (r) => {
      toast.success("Volunteer added — open the record to fill in the rest");
      qc.invalidateQueries({ queryKey: ["volunteers"] });
      setAddOpen(false);
      setNewV(EMPTY_NEW);
      // Jump straight to the detail page so Brian can finish filling fields
      router.push(`/volunteers/${r.id}`);
    },
    onError: (e) => toast.error(String(e)),
  });

  const counts = useMemo(() => {
    if (!data) return { total: 0, unverified: 0, expiring: 0 };
    const now = Date.now();
    const in30 = now + 30 * 86400000;
    return {
      total: data.length,
      unverified: data.filter((v) => !v.credVerified).length,
      expiring: data.filter((v) => v.credExpiresAt && new Date(v.credExpiresAt).getTime() <= in30).length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> Volunteers
          </h1>
          <p className="text-sm text-muted-foreground">
            Roster of medical and security volunteers across all events. Imported from RegPack.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => digestMut.mutate()} disabled={digestMut.isPending}>
            <Mail className="h-4 w-4" /> {digestMut.isPending ? "Sending…" : "Send missing-data digest"}
          </Button>
          <Button variant="outline" onClick={() => { setAddOpen(!addOpen); setCsvOpen(false); }}>
            <UserPlus className="h-4 w-4" /> New volunteer
          </Button>
          <Button onClick={() => { setCsvOpen(!csvOpen); setAddOpen(false); }}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
        </div>
      </header>

      {addOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Add a volunteer</CardTitle>
            <CardDescription>
              Use this for hand-adds — typically a security walk-in at an event, or a medical
              volunteer who didn't come through RegPack. You only need the basics here;
              license, DOB, emergency contact, and acknowledgments are on the next screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={newV.type === "MEDICAL" ? "default" : "outline"}
                onClick={() => setNewV({ ...newV, type: "MEDICAL" })}
              >
                <Stethoscope className="h-4 w-4" /> Medical
              </Button>
              <Button
                type="button"
                variant={newV.type === "SECURITY" ? "default" : "outline"}
                onClick={() => setNewV({ ...newV, type: "SECURITY" })}
              >
                <Shield className="h-4 w-4" /> Security
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">First name *</label>
                <Input
                  value={newV.firstName}
                  onChange={(e) => setNewV({ ...newV, firstName: e.target.value })}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Last name *</label>
                <Input
                  value={newV.lastName}
                  onChange={(e) => setNewV({ ...newV, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium">Email *</label>
                <Input
                  type="email"
                  value={newV.email}
                  onChange={(e) => setNewV({ ...newV, email: e.target.value })}
                  placeholder="jane.doe@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Phone (E.164)</label>
                <Input
                  value={newV.phone}
                  onChange={(e) => setNewV({ ...newV, phone: e.target.value })}
                  placeholder="+19205551234"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">State</label>
                  <Input
                    value={newV.state}
                    onChange={(e) => setNewV({ ...newV, state: e.target.value })}
                    maxLength={2}
                    placeholder="WI"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Shirt size</label>
                  <Input
                    value={newV.shirtSize}
                    onChange={(e) => setNewV({ ...newV, shirtSize: e.target.value })}
                    placeholder="L"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => addMut.mutate(newV)}
                disabled={
                  addMut.isPending ||
                  !newV.firstName.trim() ||
                  !newV.lastName.trim() ||
                  !newV.email.trim()
                }
              >
                <UserPlus className="h-4 w-4" /> {addMut.isPending ? "Saving…" : "Save & open record"}
              </Button>
              <Button variant="outline" onClick={() => { setAddOpen(false); setNewV(EMPTY_NEW); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {csvOpen && (
        <Card>
          <CardHeader>
            <CardTitle>CSV import</CardTitle>
            <CardDescription>
              Paste CSV content here. See <code>volunteer-import-instructions.md</code> for column format.
              Existing volunteers (matched by email) are updated, not duplicated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full h-48 rounded-md border bg-background p-3 font-mono text-xs"
              placeholder="type,last_name,first_name,email,..."
            />
            <div className="flex gap-2">
              <Button onClick={() => importMut.mutate(csvText)} disabled={!csvText.trim() || importMut.isPending}>
                <Upload className="h-4 w-4" /> Run import
              </Button>
              <Button variant="outline" onClick={() => { setCsvOpen(false); setCsvText(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats + filters */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total volunteers</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.total}</div></CardContent>
        </Card>
        <Card className={counts.unverified ? "border-warn" : ""}>
          <CardHeader className="pb-2"><CardDescription>Need license verification</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.unverified}</div>
            {counts.unverified > 0 && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setFilter("UNVERIFIED")}>
                Show only unverified →
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className={counts.expiring ? "border-warn" : ""}>
          <CardHeader className="pb-2"><CardDescription>License expiring within 30d</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.expiring}</div>
            {counts.expiring > 0 && (
              <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setFilter("EXPIRING")}>
                Show only expiring →
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant={type === "ALL" ? "default" : "outline"} onClick={() => setType("ALL")}>All</Button>
            <Button variant={type === "MEDICAL" ? "default" : "outline"} onClick={() => setType("MEDICAL")}>
              <Stethoscope className="h-4 w-4" /> Medical
            </Button>
            <Button variant={type === "SECURITY" ? "default" : "outline"} onClick={() => setType("SECURITY")}>
              <Shield className="h-4 w-4" /> Security
            </Button>
            {filter !== "ALL" && (
              <Button variant="ghost" onClick={() => setFilter("ALL")}>
                Clear filter ({filter.toLowerCase()})
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No volunteers match. Use <strong>Import CSV</strong> to load from RegPack.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Level</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Expires</th>
                    <th className="text-left p-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => {
                    const expiresSoon = v.credExpiresAt && new Date(v.credExpiresAt).getTime() < Date.now() + 30 * 86400000;
                    const expired = v.credExpiresAt && new Date(v.credExpiresAt).getTime() < Date.now();
                    return (
                      <tr key={v.id} className="border-t hover:bg-accent/50">
                        <td className="p-2">
                          <Link href={`/volunteers/${v.id}`} className="font-medium hover:underline">
                            {v.lastName}, {v.firstName}
                          </Link>
                        </td>
                        <td className="p-2">
                          <Badge variant={v.type === "SECURITY" ? "outline" : "outline"}>{v.type}</Badge>
                        </td>
                        <td className="p-2 text-xs">{v.credLevel ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2">
                          {v.credVerified ? (
                            <Badge variant="ok" className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="warn" className="inline-flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3" /> Needs verify
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          {v.credExpiresAt ? (
                            <span className={expired ? "text-destructive font-medium" : expiresSoon ? "text-warn-foreground" : ""}>
                              {formatDate(v.credExpiresAt)}
                              {expired && " (expired)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{v.email}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
