// /moved — public landing page shown when someone hits a URL whose feature
// has been migrated to the Ops Hub. Reached via middleware redirect.
//
// Phase 7 cutover (05/27/2026). Replaces /events/*, /volunteers/*,
// /alert-groups, /event-templates/*, /account/alerts. Phase 8 deletes the
// underlying pages outright.

import Link from "next/link";
import { ExternalLink, Megaphone } from "lucide-react";

const OPS_HUB_URL = "https://ops.medicswisconsin.com";

export default function MovedPage() {
  return (
    <main className="min-h-screen bg-background grid place-items-center p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-brand-cyan/20 grid place-items-center">
          <Megaphone className="h-7 w-7 text-brand-cyan" />
        </div>
        <h1 className="text-2xl font-bold">This has moved</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Events, volunteers, and alerts now live in the
          {" "}<span className="font-semibold text-foreground">Medics Wisconsin Operations Hub</span>.
          {" "}Inventory keeps its focus on items, locations, stock counts, pick lists, and incoming orders.
        </p>

        <a
          href={OPS_HUB_URL}
          className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-md bg-brand-cyan text-white font-semibold hover:bg-brand-cyan/90 transition-colors"
        >
          Open Operations Hub <ExternalLink className="h-4 w-4" />
        </a>

        <div className="text-xs text-muted-foreground">
          <Link href="/dashboard" className="underline hover:text-foreground">
            Back to Inventory dashboard
          </Link>
        </div>

        <p className="text-[11px] text-muted-foreground/70 leading-relaxed pt-4 border-t border-border/40">
          Bookmarked link? Update it to{" "}
          <span className="font-mono">{OPS_HUB_URL}</span>.
        </p>
      </div>
    </main>
  );
}
