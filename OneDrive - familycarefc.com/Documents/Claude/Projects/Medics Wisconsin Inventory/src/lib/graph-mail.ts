// Microsoft Graph email sender.
// Uses the OAuth2 client-credentials flow → POSTs to /users/{sender}/sendMail.
// No user interaction needed. Works under Conditional Access / MFA because
// the app authenticates as itself, not as a user.

type AccessToken = { token: string; expiresAt: number };
let cached: AccessToken | null = null;

export function isGraphConfigured(): boolean {
  return !!(
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.GRAPH_SEND_FROM
  );
}

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const tenant = process.env.AZURE_TENANT_ID!;
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    client_secret: process.env.AZURE_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token request failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type GraphMessage = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
};

function asRecipientList(v: string | string[] | undefined) {
  if (!v) return undefined;
  const list = Array.isArray(v) ? v : [v];
  return list.filter(Boolean).map((address) => ({ emailAddress: { address } }));
}

export async function sendViaGraph(msg: GraphMessage): Promise<{ ok: boolean; error?: string }> {
  if (!isGraphConfigured()) return { ok: false, error: "Graph not configured" };
  try {
    const token = await getAccessToken();
    const sender = process.env.GRAPH_SEND_FROM!;
    const body = {
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html },
        toRecipients: asRecipientList(msg.to) ?? [],
        ccRecipients: asRecipientList(msg.cc),
        bccRecipients: asRecipientList(msg.bcc),
        replyTo: msg.replyTo ? [{ emailAddress: { address: msg.replyTo } }] : undefined,
      },
      saveToSentItems: true,
    };
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 202) return { ok: true };           // success — Graph returns 202 Accepted
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Graph ${res.status}: ${text.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
