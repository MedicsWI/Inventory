"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, Upload, PackageOpen, Download, MessageSquare, MapPin, Pencil, Check, X } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useConfirm, usePrompt } from "@/components/dialog-provider";

type Role = "ADMIN" | "MANAGER" | "MEDIC";
type Row = { id: string; name: string | null; email: string; role: Role; createdAt: string };
type Patch = { role?: Role; password?: string; name?: string; email?: string };

export default function AdminPage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const meId = session?.user.id;
  const confirm = useConfirm();
  const prompt = usePrompt();

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<Row[]>("/api/users"),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) =>
      api.patch(`/api/users/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated.");
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted.");
    },
    onError: (e) => toast.error(String(e)),
  });

  // Inline create
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", role: "MEDIC" as Role, password: "" });
  const createUser = useMutation({
    mutationFn: () => api.post("/api/users", draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`User created. Share the temp password with ${draft.name} now.`);
      setDraft({ name: "", email: "", role: "MEDIC", password: "" });
      setCreating(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  function tempPassword() {
    const out = Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
    setDraft((d) => ({ ...d, password: out }));
  }

  // Inline edit (one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  function startEdit(u: Row) {
    setEditingId(u.id);
    setEditName(u.name ?? "");
    setEditEmail(u.email);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
  }
  function saveEdit(u: Row) {
    const patch: Patch = {};
    if (editName.trim() !== (u.name ?? "")) patch.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== u.email.toLowerCase()) patch.email = editEmail.trim();
    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }
    updateUser.mutate(
      { id: u.id, patch },
      {
        onSuccess: () => cancelEdit(),
      },
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">Users, roles, and bulk tools.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline"><Link href="/admin/checkouts"><PackageOpen className="h-4 w-4" /> Checkouts</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/import"><Upload className="h-4 w-4" /> CSV import</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/export"><Download className="h-4 w-4" /> Export</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/integrations"><MessageSquare className="h-4 w-4" /> Integrations</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/tile-links"><MapPin className="h-4 w-4" /> Tile links</Link></Button>
          <Button onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> New user
          </Button>
        </div>
      </header>

      {creating && (
        <Card>
          <CardHeader><CardTitle>Create user</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select className="h-12 rounded-md border bg-background px-3" value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                <option value="MEDIC">MEDIC</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Temp password * (min 8 chars)</Label>
              <div className="flex gap-2">
                <Input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                <Button type="button" variant="outline" onClick={tempPassword}>Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground">Share this with the user. Ask them to change it on first login.</p>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button
                onClick={() => createUser.mutate()}
                disabled={!draft.name || !draft.email || draft.password.length < 8 || createUser.isPending}
              >
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent>
          {users.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {/* Desktop: table; Mobile: card list. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!users.isLoading && users.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No users yet — tap "New user" to add one.
                    </td>
                  </tr>
                )}
                {users.data?.map((u) => {
                  const editing = editingId === u.id;
                  return (
                    <tr key={u.id} className="border-b last:border-none align-top">
                      {/* Name */}
                      <td className="py-2 pr-3 font-medium">
                        {editing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Name"
                            className="h-9"
                          />
                        ) : (
                          <>
                            {u.name ?? "—"}
                            {u.id === meId && <Badge variant="secondary" className="ml-1">you</Badge>}
                          </>
                        )}
                      </td>

                      {/* Email */}
                      <td className="py-2 pr-3">
                        {editing ? (
                          <Input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="user@medicswisconsin.com"
                            className="h-9"
                          />
                        ) : (
                          u.email
                        )}
                      </td>

                      {/* Role (always selectable, never blocked by edit mode) */}
                      <td className="py-2 pr-3">
                        <select
                          className="h-9 rounded-md border bg-background px-2"
                          value={u.role}
                          onChange={(e) => updateUser.mutate({ id: u.id, patch: { role: e.target.value as Role } })}
                          disabled={updateUser.isPending}
                        >
                          <option value="MEDIC">MEDIC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>

                      {/* Created */}
                      <td className="py-2 pr-3 text-muted-foreground">{formatDate(u.createdAt)}</td>

                      {/* Actions */}
                      <td className="py-2 pr-3 text-right">
                        {editing ? (
                          <div className="inline-flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(u)}
                              disabled={updateUser.isPending || !editEmail.trim() || !editName.trim()}
                            >
                              <Check className="h-4 w-4" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => startEdit(u)}>
                              <Pencil className="h-4 w-4" /> Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const pw = await prompt({
                                  title: "Reset password",
                                  description: `Set a new temporary password for ${u.email}. Share it with them and ask them to change it on first login.`,
                                  label: "New temp password",
                                  placeholder: "min 8 characters",
                                  type: "text",
                                  minLength: 8,
                                  confirmText: "Reset password",
                                });
                                if (!pw) return;
                                updateUser.mutate({ id: u.id, patch: { password: pw } });
                              }}
                            >
                              <KeyRound className="h-4 w-4" /> Reset pw
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={u.id === meId}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `Delete ${u.name ?? u.email}?`,
                                  description: "This is permanent. Their activity log entries will be kept but no longer linked to a named user.",
                                  confirmText: "Delete user",
                                  variant: "destructive",
                                });
                                if (ok) deleteUser.mutate(u.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {!users.isLoading && users.data?.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No users yet — tap "New user" to add one.
              </div>
            )}
            {users.data?.map((u) => {
              const editing = editingId === u.id;
              return (
                <div key={u.id} className="rounded-md border p-3 space-y-2">
                  {editing ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="user@medicswisconsin.com" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(u)} disabled={updateUser.isPending || !editEmail.trim() || !editName.trim()} className="flex-1">
                          <Check className="h-4 w-4" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          <X className="h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {u.name ?? "—"}
                            {u.id === meId && <Badge variant="secondary" className="ml-1">you</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          <div className="text-xs text-muted-foreground mt-1">Created {formatDate(u.createdAt)}</div>
                        </div>
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm shrink-0"
                          value={u.role}
                          onChange={(e) => updateUser.mutate({ id: u.id, patch: { role: e.target.value as Role } })}
                          disabled={updateUser.isPending}
                        >
                          <option value="MEDIC">MEDIC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => startEdit(u)} className="flex-1">
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={async () => {
                            const pw = await prompt({
                              title: "Reset password",
                              description: `Set a new temporary password for ${u.email}.`,
                              label: "New temp password",
                              placeholder: "min 8 characters",
                              type: "text",
                              minLength: 8,
                              confirmText: "Reset password",
                            });
                            if (!pw) return;
                            updateUser.mutate({ id: u.id, patch: { password: pw } });
                          }}
                        >
                          <KeyRound className="h-4 w-4" /> Reset pw
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={u.id === meId}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete ${u.name ?? u.email}?`,
                              description: "This is permanent.",
                              confirmText: "Delete user",
                              variant: "destructive",
                            });
                            if (ok) deleteUser.mutate(u.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
