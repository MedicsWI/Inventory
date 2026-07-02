"use client";

// License verification queue — every volunteer with credVerified=false, with
// inline fields so Brian can fill level/number/expiration and verify without
// opening each record.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Search, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  state: string | null;
  credLevel: (typeof CRED_LEVELS)[number] | null;
  credNumber: string | null;
  credExpiresAt: string | null;
  credVerified: boolean;
  idPictureUrl: string | null;
};

type Draft = { credLevel: string; credNumber: string; credExpiresAt: string };

function isoToDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function VerifyQueuePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  // Per-row edits, keyed by volunteer id. Rows without an entry show DB values.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["volunteers", "unverified"],
    queryFn: () => api.get<Volunteer[]>("/api/volunteers?verified=no"),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter(
      (v) =>
        `${v.firstName} ${v.lastName}`.toLowerCase().includes(needle) ||
        v.email.toLowerCase().includes(needle),
    );
  }, [data, q]);

  function draftFor(v: Volunteer): Draft {
    return (
      drafts[v.id] ?? {
        credLevel: v.credLevel ?? "",
        credNumber: v.credNumber ?? "",
        credExpiresAt: isoToDate(v.credExpiresAt),
      }
    );
  }

  function setDraft(v: Volunteer, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [v.id]: { ...draftFor(v), ...patch } }));
  }

  const saveMut = useMutation({
    mutationFn: ({ id, draft, verify }: { id: string; draft: Draft; verify: boolean }) =>
      api.patch(`/api/volunteers/${id}`, {
        credLevel: draft.credLevel || null,
        credNumber: draft.credNumber.trim() || null,
        credExpiresAt: draft.credExpiresAt ? new Date(draft.credExpiresAt).toISOString() : null,
        ...(verify ? { credVerified: true } : {}),
      }),
    onSuccess: (_r, vars) => {
      toast.success(vars.verify ? "Verified ✓" : "Saved");
      setDrafts((d) => {
        const next = { ...d };
        delete next[vars.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["volunteers"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" /> License verification queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Volunteers whose license hasn&apos;t been verified. Fill in the license details and
            hit <strong>Verify</strong> — the row drops off the queue.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/volunteers"><ArrowLeft className="h-4 w-4" /> All volunteers</Link>
        </Button>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Badge variant="warn">{rows.length} in queue</Badge>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Queue is empty — every volunteer is verified.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">State</th>
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Level</th>
                    <th className="text-left p-2">License #</th>
                    <th className="text-left p-2">Expires</th>
                    <th className="text-left p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const d = draftFor(v);
                    const pending = saveMut.isPending && saveMut.variables?.id === v.id;
                    return (
                      <tr key={v.id} className="border-t align-middle hover:bg-accent/30">
                        <td className="p-2 min-w-[160px]">
                          <Link href={`/volunteers/${v.id}`} className="font-medium hover:underline">
                            {v.lastName}, {v.firstName}
                          </Link>
                          <div className="text-xs text-muted-foreground">{v.email}</div>
                        </td>
                        <td className="p-2"><Badge variant="outline">{v.type}</Badge></td>
                        <td className="p-2 text-xs">{v.state ?? "—"}</td>
                        <td className="p-2 text-xs">
                          {v.idPictureUrl ? (
                            <a
                              href={v.idPictureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Photo <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <select
                            value={d.credLevel}
                            onChange={(e) => setDraft(v, { credLevel: e.target.value })}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="">—</option>
                            {CRED_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            value={d.credNumber}
                            onChange={(e) => setDraft(v, { credNumber: e.target.value })}
                            placeholder="License #"
                            className="h-9 min-w-[130px]"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="date"
                            value={d.credExpiresAt}
                            onChange={(e) => setDraft(v, { credExpiresAt: e.target.value })}
                            className="h-9 min-w-[140px]"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={pending || !d.credLevel}
                              title={!d.credLevel ? "Pick a level first" : "Save and mark verified"}
                              onClick={() => saveMut.mutate({ id: v.id, draft: d, verify: true })}
                            >
                              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending || !drafts[v.id]}
                              title="Save fields without verifying"
                              onClick={() => saveMut.mutate({ id: v.id, draft: d, verify: false })}
                            >
                              Save
                            </Button>
                          </div>
                        </td>
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
