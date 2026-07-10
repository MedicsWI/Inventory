// /api/notifications/check — POST runs the expiration + low-stock sweep.
// For each recipient: writes a Notification row (in-app), then fans out to
// email + Teams + push per their channel preferences.
//
// Two callers are accepted:
//   1. Signed-in admin/manager hitting the "Check now" button (cookie auth)
//   2. Vercel Cron / external scheduler with Bearer CRON_SECRET header
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, sendTeamsAlert, sendPushAlert, sendSmsAlert } from "@/lib/notifier";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  // Auth: either a signed-in ADMIN/MANAGER, OR a Bearer token matching CRON_SECRET.
  // The sweep fans out email/Teams/push/SMS, so MEDICs can't trigger it.
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronAuthorized = !!(cronSecret && safeEqual(authHeader, `Bearer ${cronSecret}`));
  const sessionAuthorized =
    !!session && (session.user.role === "ADMIN" || session.user.role === "MANAGER");
  if (!sessionAuthorized && !cronAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Lower bound keeps long-expired items (>90d) from re-alerting daily forever.
  const past90d = new Date(now.getTime() - 90 * 86400000);
  const expiringItems = await prisma.item.findMany({
    where: { expirationDate: { lte: in30, gte: past90d } },
    select: { id: true, name: true, expirationDate: true, quantity: true },
  });

  const lowStockItems = await prisma.item.findMany({
    where: { lowStockThreshold: { not: null } },
    select: { id: true, name: true, quantity: true, lowStockThreshold: true, unit: true },
  });
  const reallyLow = lowStockItems.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  );

  // Overdue checkouts — gear past its expected return date and still out.
  const overdueCheckouts = await prisma.checkout.findMany({
    where: { returnedAt: null, expectedReturnAt: { lt: now } },
    select: {
      id: true,
      quantity: true,
      expectedReturnAt: true,
      item: { select: { id: true, name: true } },
      user: { select: { name: true, email: true } },
    },
    take: 200,
  });

  const appBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
  const channelStats = { emailSent: 0, emailFailed: 0, teamsSent: 0, teamsFailed: 0, pushSent: 0, pushFailed: 0, smsSent: 0, smsFailed: 0 };
  // Teams is a SHARED channel — dedupe so multiple opted-in admins don't cause duplicate posts.
  const teamsKeysSent = new Set<string>();
  let created = 0;

  // ---- Build the alert sets once (shared across recipients) ----
  const expiredAlerts = expiringItems
    .filter((i) => i.expirationDate)
    .map((item) => {
      const days = Math.ceil((item.expirationDate!.getTime() - now.getTime()) / 86400000);
      return { item, days };
    });

  const overdueAlerts = overdueCheckouts.map((c) => ({
    checkout: c,
    days: Math.floor((now.getTime() - (c.expectedReturnAt?.getTime() ?? now.getTime())) / 86400000),
  }));

  // ONE digest per recipient per run — a bad restock day is 75 low items, and
  // 75 separate emails per admin trains everyone to ignore alerts entirely.
  for (const u of recipients) {
    const existing = await prisma.notification.findMany({
      where: { userId: u.id, createdAt: { gte: past24h } },
      select: { type: true, payload: true },
    });
    const seen = new Set(
      existing.map((n) => `${n.type}:${JSON.stringify(n.payload ?? {})}`),
    );

    const wantsExpiration = u.receiveExpirationAlerts !== false;
    const wantsLowStock = u.receiveLowStockAlerts !== false;

    // In-app rows stay per item (that's the bell feed) with the 24h dedupe.
    let newForUser = 0;

    if (wantsExpiration) {
      for (const { item, days } of expiredAlerts) {
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
        newForUser++;
      }
    }

    if (wantsLowStock) {
      for (const item of reallyLow) {
        const key = `LOW_STOCK:${JSON.stringify({ itemId: item.id })}`;
        if (seen.has(key)) continue;
        const title = `${item.name} is low (${item.quantity} ${item.unit ?? ""})`.trim();
        await prisma.notification.create({
          data: {
            userId: u.id,
            type: "LOW_STOCK",
            title,
            body: `At or below threshold of ${item.lowStockThreshold}`,
            payload: { itemId: item.id },
          },
        });
        created++;
        newForUser++;
      }
    }

    for (const { checkout: c, days } of overdueAlerts) {
      const key = `SYSTEM:${JSON.stringify({ checkoutId: c.id })}`;
      if (seen.has(key)) continue;
      const borrower = c.user.name ?? c.user.email;
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: "SYSTEM",
          title: `Overdue: ${c.item.name} (${c.quantity}) — ${borrower}`,
          body: days > 0 ? `Expected back ${days}d ago` : "Expected back today",
          payload: { checkoutId: c.id },
        },
      });
      created++;
      newForUser++;
    }

    // Nothing new since the last run → no outbound noise for this user.
    if (newForUser === 0) continue;

    // ---- One digest across all channels ----
    const expForUser = wantsExpiration ? expiredAlerts : [];
    const lowForUser = wantsLowStock ? reallyLow : [];
    const counts: string[] = [];
    if (lowForUser.length) counts.push(`${lowForUser.length} low stock`);
    const expiredCount = expForUser.filter((e) => e.days < 0).length;
    const expiringCount = expForUser.length - expiredCount;
    if (expiredCount) counts.push(`${expiredCount} expired`);
    if (expiringCount) counts.push(`${expiringCount} expiring ≤30d`);
    if (overdueAlerts.length) counts.push(`${overdueAlerts.length} overdue checkout(s)`);

    const digestTitle = `Inventory digest: ${counts.join(", ")}`;
    const digestBody = `${newForUser} new since the last sweep. Full lists in the app.`;
    const severity: "warning" | "critical" =
      expiredCount > 0 || lowForUser.some((i) => i.quantity === 0) ? "critical" : "warning";
    const user = { id: u.id, name: u.name, email: u.email };

    if (wantsEmail(u)) {
      const r = await sendEmail({
        to: u.email,
        subject: `[Medics WI] ${digestTitle}`,
        html: buildDigestHtml({
          appBase,
          newCount: newForUser,
          low: lowForUser,
          expiring: expForUser,
          overdue: overdueAlerts,
        }),
        text: buildDigestText({
          newCount: newForUser,
          low: lowForUser,
          expiring: expForUser,
          overdue: overdueAlerts,
        }),
      });
      r.ok ? channelStats.emailSent++ : channelStats.emailFailed++;
    }
    if (u.receiveAlertsByTeams) {
      // Shared channel — one digest post per run regardless of opted-in count.
      if (!teamsKeysSent.has("digest")) {
        teamsKeysSent.add("digest");
        const r = await sendTeamsAlert({
          user,
          title: digestTitle,
          body: digestBody,
          linkUrl: appBase ? `${appBase}/low-stock` : undefined,
          severity,
        });
        r.ok ? channelStats.teamsSent++ : channelStats.teamsFailed++;
      }
    }
    if (u.receiveAlertsByPush) {
      const r = await sendPushAlert({
        user,
        title: digestTitle,
        body: digestBody,
        linkUrl: appBase ? `${appBase}/notifications` : undefined,
        severity,
      });
      r.ok ? (channelStats.pushSent += r.sent) : channelStats.pushFailed++;
    }
    if (u.receiveAlertsBySms && u.phone) {
      const r = await sendSmsAlert({
        user,
        title: digestTitle,
        body: null,
        severity,
        phone: u.phone,
      });
      r.ok ? channelStats.smsSent++ : channelStats.smsFailed++;
    }
  }

  return NextResponse.json({ created, channelStats });
}

// ---------- digest builders ----------

type LowItem = { id: string; name: string; quantity: number; lowStockThreshold: number | null; unit: string | null };
type ExpAlert = { item: { id: string; name: string; expirationDate: Date | null; quantity: number }; days: number };
type OverdueAlert = {
  checkout: {
    id: string;
    quantity: number;
    expectedReturnAt: Date | null;
    item: { id: string; name: string };
    user: { name: string | null; email: string };
  };
  days: number;
};

const MAX_ROWS = 60; // keep the email scannable; the app has the full list

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function section(title: string, rowsHtml: string, more: number, linkUrl: string | null, linkLabel: string): string {
  if (!rowsHtml) return "";
  return `
    <h3 style="margin:20px 0 8px;font-size:14px">${esc(title)}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">${rowsHtml}</table>
    ${more > 0 ? `<p style="font-size:12px;color:#666;margin:6px 0 0">…and ${more} more.</p>` : ""}
    ${linkUrl ? `<p style="margin:8px 0 0"><a href="${esc(linkUrl)}" style="font-size:12px;color:#0ea5e9">${esc(linkLabel)} →</a></p>` : ""}
  `;
}

function buildDigestHtml(opts: {
  appBase: string;
  newCount: number;
  low: LowItem[];
  expiring: ExpAlert[];
  overdue: OverdueAlert[];
}): string {
  const td = `padding:6px 8px;border-bottom:1px solid #e5e7eb`;
  const lowRows = opts.low
    .slice(0, MAX_ROWS)
    .map(
      (i) => `<tr>
        <td style="${td}">${esc(i.name)}</td>
        <td style="${td};text-align:right;font-weight:600;color:${i.quantity === 0 ? "#dc2626" : "#b45309"}">${i.quantity} ${esc(i.unit ?? "")}</td>
        <td style="${td};text-align:right;color:#666">threshold ${i.lowStockThreshold ?? "—"}</td>
      </tr>`,
    )
    .join("");
  const expRows = opts.expiring
    .slice(0, MAX_ROWS)
    .map(
      ({ item, days }) => `<tr>
        <td style="${td}">${esc(item.name)}</td>
        <td style="${td};text-align:right;font-weight:600;color:${days < 0 ? "#dc2626" : "#b45309"}">${days < 0 ? `expired ${Math.abs(days)}d ago` : `in ${days}d`}</td>
        <td style="${td};text-align:right;color:#666">qty ${item.quantity}</td>
      </tr>`,
    )
    .join("");
  const odRows = opts.overdue
    .slice(0, MAX_ROWS)
    .map(
      ({ checkout: c, days }) => `<tr>
        <td style="${td}">${esc(c.item.name)} (${c.quantity})</td>
        <td style="${td}">${esc(c.user.name ?? c.user.email)}</td>
        <td style="${td};text-align:right;font-weight:600;color:#b45309">${days > 0 ? `${days}d overdue` : "due today"}</td>
      </tr>`,
    )
    .join("");

  const base = opts.appBase || "";
  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111">
      <div style="border-bottom:2px solid #0ea5e9;padding-bottom:10px;margin-bottom:4px">
        <div style="font-size:18px;font-weight:700">Medics Wisconsin — Inventory digest</div>
        <div style="font-size:12px;color:#666">${opts.newCount} new alert(s) since the last sweep · one email per day, full lists below</div>
      </div>
      ${section(`Low stock (${opts.low.length})`, lowRows, opts.low.length - MAX_ROWS, base ? `${base}/low-stock` : null, "Open low stock")}
      ${section(`Expiring / expired (${opts.expiring.length})`, expRows, opts.expiring.length - MAX_ROWS, base ? `${base}/expiring` : null, "Open expiring")}
      ${section(`Overdue checkouts (${opts.overdue.length})`, odRows, opts.overdue.length - MAX_ROWS, base ? `${base}/admin/checkouts` : null, "Open checkouts")}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px" />
      <p style="font-size:11px;color:#666;margin:0">
        Automated daily digest. Adjust thresholds on each item, or your channels under
        Alert preferences on the Notifications page.
      </p>
    </div>
  `;
}

function buildDigestText(opts: {
  newCount: number;
  low: LowItem[];
  expiring: ExpAlert[];
  overdue: OverdueAlert[];
}): string {
  const lines: string[] = [
    `MEDICS WI — INVENTORY DIGEST (${opts.newCount} new since last sweep)`,
    "",
  ];
  if (opts.low.length) {
    lines.push(`LOW STOCK (${opts.low.length})`);
    for (const i of opts.low.slice(0, MAX_ROWS)) {
      lines.push(`  ${i.name}: ${i.quantity} ${i.unit ?? ""} (threshold ${i.lowStockThreshold ?? "—"})`);
    }
    if (opts.low.length > MAX_ROWS) lines.push(`  …and ${opts.low.length - MAX_ROWS} more`);
    lines.push("");
  }
  if (opts.expiring.length) {
    lines.push(`EXPIRING / EXPIRED (${opts.expiring.length})`);
    for (const { item, days } of opts.expiring.slice(0, MAX_ROWS)) {
      lines.push(`  ${item.name}: ${days < 0 ? `expired ${Math.abs(days)}d ago` : `in ${days}d`} (qty ${item.quantity})`);
    }
    if (opts.expiring.length > MAX_ROWS) lines.push(`  …and ${opts.expiring.length - MAX_ROWS} more`);
    lines.push("");
  }
  if (opts.overdue.length) {
    lines.push(`OVERDUE CHECKOUTS (${opts.overdue.length})`);
    for (const { checkout: c, days } of opts.overdue.slice(0, MAX_ROWS)) {
      lines.push(`  ${c.item.name} (${c.quantity}) — ${c.user.name ?? c.user.email}, ${days > 0 ? `${days}d overdue` : "due today"}`);
    }
  }
  return lines.join("\n");
}

// Vercel Cron supports GET. Delegate to POST so the same code runs.
export async function GET(req: Request) {
  return POST(req);
}
