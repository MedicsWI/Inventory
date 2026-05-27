"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Mail, MessageSquare, Bell, MessageCircle, CheckCircle2, AlertCircle, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Status = {
  emailConfigured: boolean;
  emailMode: "graph" | "smtp" | "none";
  teamsConfigured: boolean;
  teamsMode: "email" | "webhook" | "none";
  teamsChannelEmail: string | null;
  pushConfigured: boolean;
  smsConfigured: boolean;
  smsFromNumber: string | null;
  graphSendFrom: string | null;
  smtpHost: string | null;
  smtpFrom: string | null;
};

export default function IntegrationsPage() {
  const status = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => api.get<Status>("/api/integrations/status"),
  });

  const test = useMutation({
    mutationFn: (channel: "email" | "teams" | "sms") =>
      api.post<{ ok: boolean; error?: string }>("/api/integrations/test", { channel }),
    onSuccess: () => toast.success("Sent. Check the destination."),
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin"><ChevronLeft className="h-4 w-4" /> Admin</Link>
      </Button>

      <header>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Outbound channels for notifications. Configured via environment variables — see README §5c.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email</CardTitle>
          <CardDescription>
            {status.data?.emailMode === "graph" && (
              <>Microsoft Graph (OAuth) — sends as <span className="font-medium">{status.data.graphSendFrom}</span>. Works under Conditional Access / MFA.</>
            )}
            {status.data?.emailMode === "smtp" && (
              <>SMTP — sends as <span className="font-medium">{status.data.smtpFrom}</span> via {status.data.smtpHost}.</>
            )}
            {status.data?.emailMode === "none" && <>Not configured. See setup walkthrough below.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {status.data?.emailConfigured ? (
            <Badge variant="ok" className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </Badge>
          ) : (
            <Badge variant="warn" className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not configured
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => test.mutate("email")}
            disabled={!status.data?.emailConfigured || test.isPending}
          >
            {test.isPending && test.variables === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test email to me
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Microsoft Teams</CardTitle>
          <CardDescription>
            {status.data?.teamsMode === "email" && (
              <>Posts via the channel's email address (<span className="font-mono text-xs">{status.data.teamsChannelEmail}</span>). Free, no Power Automate.</>
            )}
            {status.data?.teamsMode === "webhook" && <>Posts via legacy webhook URL.</>}
            {status.data?.teamsMode === "none" && <>Not configured.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {status.data?.teamsConfigured ? (
            <Badge variant="ok" className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </Badge>
          ) : (
            <Badge variant="warn" className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not configured
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => test.mutate("teams")}
            disabled={!status.data?.teamsConfigured || test.isPending}
          >
            {test.isPending && test.variables === "teams" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test post
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Web Push</CardTitle>
          <CardDescription>
            {status.data?.pushConfigured
              ? <>VAPID keys are configured. Each user enables push per-device from <span className="font-medium">Alert settings</span>.</>
              : <>Not configured. Generate VAPID keys with <code className="text-xs">pnpm exec web-push generate-vapid-keys</code> and add to <code className="text-xs">.env</code>.</>
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {status.data?.pushConfigured ? (
            <Badge variant="ok" className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </Badge>
          ) : (
            <Badge variant="warn" className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not configured
            </Badge>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/account/alerts">Open Alert settings</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> SMS (Twilio)</CardTitle>
          <CardDescription>
            {status.data?.smsConfigured
              ? <>Twilio configured. Sending from <span className="font-mono text-xs">{status.data.smsFromNumber}</span>. iOS users should opt into SMS over push.</>
              : <>Not configured. Add <code className="text-xs">TWILIO_ACCOUNT_SID</code>, <code className="text-xs">TWILIO_AUTH_TOKEN</code>, and <code className="text-xs">TWILIO_FROM_NUMBER</code> to env vars.</>
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {status.data?.smsConfigured ? (
            <Badge variant="ok" className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </Badge>
          ) : (
            <Badge variant="warn" className="inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Not configured
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => test.mutate("sms")}
            disabled={!status.data?.smsConfigured || test.isPending}
          >
            {test.isPending && test.variables === "sms" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test SMS to me
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup quick reference</CardTitle>
          <CardDescription>Both channels are configured by editing the project's .env file and restarting the server.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <div className="font-semibold mb-1">Email — Microsoft Graph (recommended, works under MFA)</div>
            <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{`AZURE_TENANT_ID="<directory id>"
AZURE_CLIENT_ID="<application id>"
AZURE_CLIENT_SECRET="<client secret value>"
GRAPH_SEND_FROM="inventory-alerts@medicswisconsin.com"
GRAPH_FROM_NAME="Medics WI Inventory"`}</pre>
            <p className="text-xs text-muted-foreground mt-1">
              Full setup steps in EMAIL-AND-TEAMS-SETUP.md (Azure portal → App registrations → Mail.Send application permission).
            </p>
            <div className="font-semibold mt-3 mb-1">Email — SMTP fallback</div>
            <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{`SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="inventory-alerts@medicswisconsin.com"
SMTP_PASSWORD="<M365 app password>"
SMTP_FROM="Medics WI Inventory <inventory-alerts@medicswisconsin.com>"`}</pre>
            <p className="text-xs text-muted-foreground mt-1">
              Used only if the Graph vars above are empty. Doesn't work under Conditional Access.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-1">Teams channel email (recommended)</div>
            <pre className="bg-muted rounded p-3 text-xs overflow-x-auto">{`TEAMS_ALERTS_EMAIL="eebc8cef.medicswisconsin.com@amer.teams.ms"`}</pre>
            <p className="text-xs text-muted-foreground mt-1">
              In Teams: target channel → ⋯ → <span className="font-medium">Get email address</span> → copy the address shown there.
              Inbound emails appear as channel posts. Sidesteps Microsoft's webhook OAuth churn entirely.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
