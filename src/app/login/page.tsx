"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Next 15 requires useSearchParams() to live inside a Suspense boundary
// so the prerenderer can still bail out cleanly.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const sp = useSearchParams();
  const from = sp.get("from") ?? "/dashboard";
  const errorParam = sp.get("error");

  const [email, setEmail] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setMagicLoading(true);
    const res = await signIn("email", { email, callbackUrl: from, redirect: false });
    setMagicLoading(false);
    if (res?.error) {
      toast.error("Could not send sign-in link. Try again or use Microsoft sign-in.");
    } else {
      setMagicSent(true);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-primary text-primary-foreground grid place-items-center text-xl font-bold">
            M
          </div>
          <CardTitle>Medics WI Inventory</CardTitle>
          <CardDescription>Sign in with your Microsoft account or get a sign-in link by email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorParam && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Sign-in failed. Try again, or reach out to Brian if it keeps happening.
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: from })}
          >
            <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Sign in with Microsoft
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or get a sign-in link
            <span className="h-px flex-1 bg-border" />
          </div>

          {magicSent ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm text-center space-y-2">
              <div className="font-medium">Check your email</div>
              <div className="text-xs text-muted-foreground">
                We sent a sign-in link to <strong>{email}</strong>. Click the link in the email to finish signing in.
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMagicSent(false);
                  setEmail("");
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@medicswisconsin.com"
                />
              </div>
              <Button type="submit" variant="outline" size="lg" className="w-full" disabled={magicLoading || !email}>
                {magicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Email me a sign-in link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
