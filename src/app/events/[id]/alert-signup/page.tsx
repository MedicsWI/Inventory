// /events/[id]/alert-signup — PUBLIC page. The QR poster at the event points here.
// No auth required. Mobile-first single-column layout.

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function AlertSignupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, location: true },
  });
  if (!event) notFound();

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        <header className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Medics Wisconsin"
            className="h-12 w-12 mx-auto mb-2 rounded-md object-contain"
          />
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            {event.location ?? "Event alerts"}
          </div>
        </header>

        <SignupForm eventId={event.id} eventName={event.name} />

        <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          Operated by Medics Wisconsin. Standard message and data rates may apply.
          Reply STOP to any message to opt out. Reply HELP for help.
        </p>
      </div>
    </main>
  );
}
