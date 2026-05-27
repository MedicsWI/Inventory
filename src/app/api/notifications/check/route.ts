// /api/notifications/check — POST runs the expiration + low-stock sweep.
// For each recipient: writes a Notification row (in-app), then fans out to
// email + Teams + push per their channel preferences.
//
// Two callers are accepted:
//   1. Signed-in admin/manager hitting the "Check now" button (cookie auth)
//   2. Vercel Cron / external scheduler with Bearer CRON_SECRET header
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailAlert, sendTeamsAlert, sendPushAlert, sendSmsAlert } from "@/lib/notifier";

export async function POST(req: Request) {
  // Auth: either a real session, OR a Bearer token matching CRON_SECRET
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronAuthorized = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!session && !cronAuthorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const past24h = new Date(now.getTime() - 24 * 3600000);

  const recipients = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      receiveExpirationAlerts: true,
      receiveLowStockAlerts: true,
      receiveAlertsByEmail: true,
      receiveAlertsByTeams: true,
      receiveAlertsByPush: true,
      receiveAlertsBySms: true,
      phone: true,
    },
  });

  // Inventory alerts are operational — ADMIN/MANAGER receive email by default
  // because they own these alerts. The flag still controls Teams/Push/SMS so
  // those stay opt-in. MEDIC role (if ever queried) still requires opt-in.
  function wantsEmail(u: (typeof recipients)[number]): boolean {
    if (u.role === "ADMIN" || u.role === "MANAGER") return true;
    return u.receiveAlertsByEmail === true;
  }

  if (recipients.length === 0) {
    return NextResponse.json({ created: 0, reason: "No admin/manager recipients" });
  }

  const expiringItems = await prisma.item.findMany({
    where: { expirationDate: { lte: in30 } },
    select: { id: true, name: true, expirationDate: true, quantity: true },
  });

  const lowStockItems = await prisma.item.findMany({
    where: { lowStockThreshold: { not: null } },
    select: { id: true, name: true, quantity: true, lowStockThreshold: true, unit: true },
  });
  const reallyLow = lowStockItems.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  );

  const appBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
  const channelStats = { emailSent: 0, emailFailed: 0, teamsSent: 0, teamsFailed: 0, pushSent: 0, pushFailed: 0, smsSent: 0, smsFailed: 0 };
  // Teams is a SHARED channel — dedupe so multiple opted-in admins don't cause duplicate posts.
  const teamsKeysSent = new Set<string>();
  let created = 0;

  for (const u of recipients) {
    const existing = await prisma.notification.findMany({
      where: { userId: u.id, createdAt: { gte: past24h } },
      select: { type: true, payload: true },
    });
    const seen = new Set(
      existing.map((n) => `${n.type}:${JSON.stringify(n.payload ?? {})}`),
    );

    if (u.receiveExpirationAlerts !== false) {
      for (const item of expiringItems) {
        if (!item.expirationDate) continue;
        const days = Math.ceil((item.expirationDate.getTime() - now.getTime()) / 86400000);
        const type = days < 0 ? "EXPIRED" : "EXPIRING_SOON";
        const key = `${type}:${JSON.stringify({ itemId: item.id })}`;
        if (seen.has(key)) continue;

        const title =
          days < 0
            ? `${item.name} expired ${Math.abs(days)}d ago`
            : `${item.name} expires in ${days}d`;

        await prisma.notification.create({
          data: { userId: u.id, type, title, body: null, payload: { itemId: item.id, days } },
        });
        created++;

        await fanout(u, {
          title,
          body: null,
          linkUrl: appBase ? `${appBase}/items/${item.id}` : undefined,
          severity: days < 0 ? "critical" : days <= 7 ? "critical" : "warning",
        });
      }
    }

    if (u.receiveLowStockAlerts !== false) {
      for (const item of reallyLow) {
        const key = `LOW_STOCK:${JSON.stringify({ itemId: item.id })}`;
        if (seen.has(key)) continue;

        const title = `${item.name} is low (${item.quantity} ${item.unit ?? ""})`.trim();
        const body = `At or below threshold of ${item.lowStockThreshold}`;

        await prisma.notification.create({
          data: { userId: u.id, type: "LOW_STOCK", title, body, payload: { itemId: item.id } },
        });
        created++;

        await fanout(u, {
          title,
          body,
          linkUrl: appBase ? `${appBase}/items/${item.id}` : undefined,
          severity: item.quantity === 0 ? "critical" : "warning",
        });
      }
    }
  }

  async function fanout(
    u: (typeof recipients)[number],
    payload: { title: string; body: string | null; linkUrl?: string; severity: "info" | "warning" | "critical" },
  ) {
    const user = { id: u.id, name: u.name, email: u.email };
    if (wantsEmail(u)) {
      const r = await sendEmailAlert({ user, ...payload });
      r.ok ? channelStats.emailSent++ : channelStats.emailFailed++;
    }
    if (u.receiveAlertsByTeams) {
      // Channel is shared — one post per unique alert per run, no matter how many users opted in.
      const key = `${payload.title}|${payload.body ?? ""}`;
      if (!teamsKeysSent.has(key)) {
        teamsKeysSent.add(key);
        const r = await sendTeamsAlert({ user, ...payload });
        r.ok ? channelStats.teamsSent++ : channelStats.teamsFailed++;
      }
    }
    if (u.receiveAlertsByPush) {
      const r = await sendPushAlert({ user, ...payload });
      r.ok ? (channelStats.pushSent += r.sent) : channelStats.pushFailed++;
    }
    if (u.receiveAlertsBySms && u.phone) {
      const r = await sendSmsAlert({ user, ...payload, phone: u.phone });
      r.ok ? channelStats.smsSent++ : channelStats.smsFailed++;
    }
  }

  return NextResponse.json({ created, channelStats });
}

// Vercel Cron supports GET. Delegate to POST so the same code runs.
export async function GET(req: Request) {
  return POST(req);
}
