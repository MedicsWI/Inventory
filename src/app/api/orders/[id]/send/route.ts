// /api/orders/[id]/send — email the PO to the vendor and flip DRAFT → ORDERED.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { isEmailConfigured, sendEmail } from "@/lib/notifier";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { assertCan(session.user.role, "import:bulk"); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

  const { id } = await ctx.params;
  const order = await prisma.incomingOrder.findUnique({
    where: { id },
    include: { lines: { include: { item: { select: { name: true, sku: true } } } } },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "DRAFT") {
    return NextResponse.json({ error: `Status is ${order.status}; can only send a DRAFT.` }, { status: 400 });
  }
  if (!order.vendorEmail) {
    return NextResponse.json({ error: "Add a vendor email before sending." }, { status: 400 });
  }
  if (!order.lines.length) {
    return NextResponse.json({ error: "PO has no lines." }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "SMTP not configured. See /admin/integrations." }, { status: 503 });
  }

  // Claim the order BEFORE emailing — two concurrent sends (double-click,
  // retry) must not both email the vendor. Loser of the race gets a 409.
  const claim = await prisma.incomingOrder.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "ORDERED", sentAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "Order was already sent." }, { status: 409 });
  }

  // Build the email
  const subjectPoNum = order.orderNumber ? ` ${order.orderNumber}` : "";
  const subject = `Purchase Order${subjectPoNum} — Medics Wisconsin`;
  const total = order.lines.reduce(
    (s, l) => s + (l.unitCost ?? 0) * l.expectedQty,
    0,
  );
  const dateStr = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  const linesHtml = order.lines
    .map((l) => {
      const display = l.item?.name ?? l.name;
      const sku = l.sku ?? l.item?.sku ?? "";
      const unit = l.unitCost != null ? `$${l.unitCost.toFixed(2)}` : "—";
      const lineTotal = l.unitCost != null ? `$${(l.unitCost * l.expectedQty).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(display)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(sku)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${l.expectedQty}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${unit}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${lineTotal}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#111">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0ea5e9;padding-bottom:16px">
        <div>
          <div style="font-size:22px;font-weight:700">Medics Wisconsin</div>
          <div style="font-size:12px;color:#666">Inventory · ${dateStr}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:700">PURCHASE ORDER</div>
          ${order.orderNumber ? `<div style="font-size:13px;color:#666">#${escapeHtml(order.orderNumber)}</div>` : ""}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;gap:24px;margin:16px 0">
        <div>
          <div style="font-size:11px;color:#666;letter-spacing:0.05em;text-transform:uppercase">Vendor</div>
          <div style="font-weight:600">${escapeHtml(order.vendor)}</div>
          ${order.vendorContact ? `<div>${escapeHtml(order.vendorContact)}</div>` : ""}
          ${order.vendorPhone ? `<div>${escapeHtml(order.vendorPhone)}</div>` : ""}
          <div>${escapeHtml(order.vendorEmail)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#666;letter-spacing:0.05em;text-transform:uppercase">Ship to</div>
          <div style="font-weight:600">Medics Wisconsin</div>
          <div>1337 Cooke Road</div>
          <div>Neenah, WI 54956</div>
        </div>
        <div style="text-align:right">
          ${order.expectedAt ? `<div><strong>Need by:</strong> ${escapeHtml(new Date(order.expectedAt).toLocaleDateString("en-US"))}</div>` : ""}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <thead>
          <tr style="background:#0ea5e9;color:#fff">
            <th style="padding:10px;text-align:left">Item</th>
            <th style="padding:10px;text-align:left">SKU</th>
            <th style="padding:10px;text-align:right">Qty</th>
            <th style="padding:10px;text-align:right">Unit</th>
            <th style="padding:10px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:12px;text-align:right;font-weight:600">Order total</td>
            <td style="padding:12px;text-align:right;font-weight:700">$${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      ${order.vendorNotes ? `
        <div style="margin-top:16px;padding:12px;background:#f9fafb;border-left:4px solid #0ea5e9">
          <div style="font-size:11px;color:#666;letter-spacing:0.05em;text-transform:uppercase">Notes</div>
          <div style="white-space:pre-wrap;margin-top:4px">${escapeHtml(order.vendorNotes)}</div>
        </div>` : ""}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
      <p style="font-size:11px;color:#666;margin:0">
        Submitted by ${escapeHtml(session.user.name ?? session.user.email ?? "Medics Wisconsin")}.
        Please confirm receipt and shipping schedule. Reply to this email with any questions.
      </p>
    </div>
  `;

  // Plain-text fallback
  const text = [
    `MEDICS WISCONSIN — PURCHASE ORDER ${order.orderNumber ? "#" + order.orderNumber : ""}`,
    `Date: ${dateStr}`,
    "",
    `Vendor: ${order.vendor}${order.vendorContact ? " (" + order.vendorContact + ")" : ""}`,
    `Vendor email: ${order.vendorEmail}`,
    "",
    "Ship to:",
    "  Medics Wisconsin",
    "  1337 Cooke Road",
    "  Neenah, WI 54956",
    order.expectedAt ? `Need by: ${new Date(order.expectedAt).toLocaleDateString("en-US")}` : "",
    "",
    "LINES",
    ...order.lines.map((l) =>
      `  ${l.expectedQty} × ${l.item?.name ?? l.name}${l.sku ? " [" + l.sku + "]" : ""}` +
      (l.unitCost != null ? ` @ $${l.unitCost.toFixed(2)} = $${(l.unitCost * l.expectedQty).toFixed(2)}` : ""),
    ),
    "",
    `TOTAL: $${total.toFixed(2)}`,
    "",
    order.vendorNotes ? `NOTES:\n${order.vendorNotes}\n` : "",
    `— Submitted by ${session.user.name ?? session.user.email ?? "Medics Wisconsin"}`,
  ].filter(Boolean).join("\n");

  // Send via Graph (preferred) or SMTP (fallback); transport is selected in notifier.
  const sendResult = await sendEmail({
    to: order.vendorEmail,
    cc: session.user.email ?? undefined,
    replyTo: session.user.email ?? undefined,
    subject,
    html,
    text,
  });
  if (!sendResult.ok) {
    // Email failed — release the claim so the user can fix the issue and retry.
    await prisma.incomingOrder.updateMany({
      where: { id, status: "ORDERED" },
      data: { status: "DRAFT", sentAt: null },
    });
    return NextResponse.json({ error: sendResult.error ?? "Send failed" }, { status: 502 });
  }

  const updated = await prisma.incomingOrder.findUnique({ where: { id } });

  await logActivity({
    userId: session.user.id,
    action: "ORDER_SEND",
    entityType: "INCOMING_ORDER",
    entityId: id,
    metadata: { vendor: order.vendor, vendorEmail: order.vendorEmail, total },
  });

  return NextResponse.json({ ok: true, order: updated });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
