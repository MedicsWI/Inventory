"use client";

// One dialog for both OUT and IN actions on an event sign-out gear cell.
// Fields are all optional — pressing Enter or clicking Save with empty fields
// records just the timestamp (preserves the fast tap-and-go workflow).

import * as React from "react";
import { Loader2, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoPicker } from "@/components/photo-picker";
import { BarcodeScanner } from "@/components/barcode-scanner";

export type GearDialogSubmit = {
  identifier?: string | null;
  initials?: string | null;
  photoUrl?: string | null;
};

export function EventGearDialog({
  open,
  mode,
  category,
  personName,
  context,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "out" | "in";
  category: string;          // "Radio", "Cart", etc.
  personName: string;
  // Optional context to display: existing identifier when signing IN, etc.
  context?: { identifier?: string | null; outAt?: string | null };
  busy?: boolean;
  onClose: () => void;
  onSubmit: (vals: GearDialogSubmit) => void;
}) {
  const [identifier, setIdentifier] = React.useState("");
  const [initials, setInitials] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setIdentifier("");
      setInitials("");
      setPhotoUrl(null);
      setScannerOpen(false);
    }
  }, [open]);

  function handleSubmit() {
    onSubmit({
      identifier: mode === "out" && identifier.trim() ? identifier.trim() : undefined,
      initials: initials.trim() ? initials.trim().toUpperCase() : undefined,
      photoUrl: photoUrl ?? undefined,
    });
  }

  const title = mode === "out"
    ? `Sign out ${category}`
    : `Sign in ${category}`;
  const description = mode === "out"
    ? `Recording ${category.toLowerCase()} sign-out for ${personName}. Skip fields you don't need.`
    : context?.identifier
      ? `Returning ${category.toLowerCase()} ${context.identifier} from ${personName}.`
      : `Returning ${category.toLowerCase()} from ${personName}.`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "out" && (
            <div className="space-y-1">
              <Label htmlFor="identifier">
                {category} ID / number (optional)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={`e.g. ${category} #3`}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setScannerOpen(true)}
                  aria-label={`Scan ${category} QR code`}
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              {scannerOpen && (
                <div className="mt-2 rounded-md border bg-card overflow-hidden">
                  <BarcodeScanner
                    onScan={(r) => {
                      setIdentifier(r.rawValue);
                      setScannerOpen(false);
                    }}
                    onClose={() => setScannerOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="initials">Initials (optional)</Label>
            <Input
              id="initials"
              value={initials}
              onChange={(e) => setInitials(e.target.value)}
              placeholder="BR"
              maxLength={4}
              className="uppercase"
              autoFocus={mode === "in"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
            />
            <p className="text-xs text-muted-foreground">
              Who handed it {mode === "out" ? "out" : "back"}? Captures the same audit signature the paper form has.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Condition photo (optional)</Label>
            <PhotoPicker value={photoUrl} onChange={setPhotoUrl} folder="items" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "out" ? "Sign out" : "Sign in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
