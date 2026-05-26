"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () =>
      api.post("/api/me/password", { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success("Password updated.");
      router.push("/dashboard");
    },
    onError: (e) => toast.error(String(e)),
  });

  const tooShort = next.length < 8;
  const mismatch = !!next && !!confirm && next !== confirm;
  const disabled = tooShort || mismatch || !current || change.isPending;

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            <CardTitle>Change password</CardTitle>
          </div>
          <CardDescription>Minimum 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Current password</Label>
            <Input type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>New password</Label>
            <Input type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} />
            {tooShort && next.length > 0 && (
              <p className="text-xs text-danger">Must be at least 8 characters.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Confirm new password</Label>
            <Input type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <p className="text-xs text-danger">Doesn't match.</p>}
          </div>
          <Button onClick={() => change.mutate()} disabled={disabled} className="w-full">
            {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
