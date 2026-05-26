"use client";

// Barcode + QR scanner.
//   - Native Capacitor: @capacitor-mlkit/barcode-scanning (offline, fast, true autofocus)
//   - Web: html5-qrcode + Chrome BarcodeDetector when available
//
// PC webcams expose almost no focus control via JS. We do what we can:
//   - Continuous-focus constraints + large scan area
//   - Visual feedback: pulsing reticle while looking, green flash on capture
//   - Refresh button to restart the stream
//   - "Enter code" handoff to manual entry after a no-scan timeout

import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { ScanLine, X, RefreshCcw, Lightbulb, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ScanResult = { rawValue: string; format?: string };

const TIPS = [
  "Hold the code 6–8 inches from the webcam, flat, with good light.",
  "Move the package slowly back and forth — webcams hunt for focus.",
  "QR codes scan way more reliably than UPC barcodes on webcams.",
];

export function BarcodeScanner({
  onScan,
  onClose,
  onError,
  onManualEntry,
}: {
  onScan: (result: ScanResult) => void;
  onClose?: () => void;
  onError?: (message: string) => void;
  onManualEntry?: () => void;
}) {
  const elId = React.useId().replace(/:/g, "");
  const containerId = `scanner-${elId}`;
  const scannerRef = React.useRef<Html5Qrcode | null>(null);
  const startedRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [native, setNative] = React.useState(false);
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);
  const [captured, setCaptured] = React.useState(false);
  const [restartKey, setRestartKey] = React.useState(0);
  const [showTips, setShowTips] = React.useState(false);
  const [tipIdx, setTipIdx] = React.useState(0);
  const [slowScan, setSlowScan] = React.useState(false);   // true after 10s without a hit

  // Rotate live tips when the panel is open
  React.useEffect(() => {
    if (!showTips) return;
    const i = setInterval(() => setTipIdx((v) => (v + 1) % TIPS.length), 4000);
    return () => clearInterval(i);
  }, [showTips]);

  // No-scan timer: after 10s of camera-on with no hit, surface the manual nudge
  React.useEffect(() => {
    if (captured) return;
    const t = setTimeout(() => setSlowScan(true), 10_000);
    return () => clearTimeout(t);
  }, [restartKey, captured]);

  React.useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (Capacitor.isNativePlatform()) {
          const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
          setNative(true);
          const granted = await BarcodeScanner.requestPermissions();
          if (granted.camera !== "granted" && granted.camera !== "limited") {
            setError("Camera permission denied");
            onError?.("Camera permission denied");
            return;
          }
          const { barcodes } = await BarcodeScanner.scan();
          if (!cancelled && barcodes?.[0]) {
            onScan({ rawValue: barcodes[0].rawValue, format: barcodes[0].format });
          }
          onClose?.();
        } else {
          const scanner = new Html5Qrcode(containerId, {
            verbose: false,
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.DATA_MATRIX,
            ],
            useBarCodeDetectorIfSupported: true,
          });
          scannerRef.current = scanner;

          await scanner.start(
            { facingMode: "environment" },
            {
              fps: 15,
              // Smaller scan region focuses the library's attention.
              // Too big = the decoder thrashes; too small = users can't fit a UPC.
              // 60–65% of the shorter dimension, capped at 380px, hits the sweet spot.
              qrbox: (vw, vh) => {
                const min = Math.min(vw, vh);
                const size = Math.max(220, Math.min(380, Math.floor(min * 0.62)));
                return { width: size, height: size };
              },
              aspectRatio: 1.7777,
              videoConstraints: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                // @ts-expect-error — focusMode is non-standard but widely accepted
                advanced: [{ focusMode: "continuous" }],
              },
            },
            (decoded, decodedResult) => {
              // Capture + show a green "got it" flash before navigating away.
              setLastSeen(decoded);
              setCaptured(true);
              const format = decodedResult?.result?.format?.formatName;
              setTimeout(() => {
                onScan({ rawValue: decoded, format });
                safeStop();
              }, 400);
            },
            () => {
              /* per-frame "no code" — normal */
            },
          );
          startedRef.current = true;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setError(msg);
          onError?.(msg);
        }
      }
    }
    void start();

    return () => {
      cancelled = true;
      safeStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey]);

  // Synchronous teardown.
  // The previous async version yielded at `await scanner.stop()`, letting React
  // unmount the DOM first — at which point the track-stop fallback couldn't find
  // the <video> anymore and Chrome kept the camera indicator on.
  // Now: kill tracks FIRST (synchronously), then fire-and-forget the library cleanup.
  function safeStop() {
    // 1. Stop all MediaStream tracks immediately, before any DOM teardown
    try {
      const container = document.getElementById(containerId);
      container?.querySelectorAll("video").forEach((v) => {
        const stream = (v as HTMLVideoElement).srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
          (v as HTMLVideoElement).srcObject = null;
        }
      });
    } catch { /* ignore */ }

    // 2. Fire-and-forget library cleanup. We've already released the camera, so
    //    any errors from html5-qrcode here are cosmetic. clear() doesn't always
    //    return a Promise in this build, so guard before chaining.
    const scanner = scannerRef.current;
    if (scanner) {
      const wasStarted = startedRef.current;
      startedRef.current = false;
      scannerRef.current = null;
      const safeClear = () => { try { void scanner.clear(); } catch { /* ignore */ } };
      if (wasStarted) {
        try {
          const stopResult = scanner.stop();
          if (stopResult && typeof (stopResult as Promise<unknown>).then === "function") {
            (stopResult as Promise<unknown>).catch(() => {}).finally(safeClear);
          } else {
            safeClear();
          }
        } catch {
          safeClear();
        }
      } else {
        safeClear();
      }
    }
  }

  function refresh() {
    setCaptured(false);
    setSlowScan(false);
    setLastSeen(null);
    safeStop();
    setRestartKey((k) => k + 1);
  }

  const isScanning = !captured && !error;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
      style={{ height: "100dvh" }}
    >
      {/* HEADER */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" />
          <span className="font-medium">Scan barcode / QR</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={refresh}
            aria-label="Refresh camera"
            className="rounded-full h-12 w-12"
            title="Restart camera (helps when focus is stuck)"
          >
            <RefreshCcw className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => { safeStop(); onClose?.(); }}
            aria-label="Close scanner"
            className="rounded-full h-12 w-12"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* CAMERA */}
      <div className="relative flex-1 overflow-hidden">
        {!native && (
          <div
            id={containerId}
            className="absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          {/* Box is sized to roughly match the library's qrbox (60% of min dimension, capped) */}
          <div className="relative h-[min(62vmin,380px)] w-[min(62vmin,380px)] max-w-[80vw] max-h-[80vw]">
            {/* Corner brackets */}
            {(["top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
                "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
                "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
                "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl"] as const).map((pos) => (
              <span
                key={pos}
                className={cn(
                  "absolute h-10 w-10 transition-colors",
                  pos,
                  captured ? "border-emerald-400 shadow-[0_0_20px_2px_rgba(16,185,129,0.6)]"
                           : isScanning ? "scan-bracket" : "border-white/95",
                )}
              />
            ))}

            {/* Animated laser line — only while actively scanning */}
            {isScanning && (
              <div className="absolute inset-3 overflow-hidden rounded-lg pointer-events-none">
                <div className="scan-line bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_2px_rgba(56,189,248,0.8)]" />
              </div>
            )}

            {/* Capture feedback */}
            {captured && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-full bg-emerald-500/95 px-5 py-2.5 font-semibold text-white shadow-xl text-lg">
                  ✓ Got it — hold steady
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div
        className="shrink-0 flex flex-col items-center gap-2 px-4 py-3 bg-black/80 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        {error ? (
          <div className="rounded-md bg-destructive/90 px-3 py-2 text-sm max-w-xs text-center">
            {error}
          </div>
        ) : slowScan && !captured ? (
          <div className="rounded-md bg-warn/20 border border-warn/50 px-3 py-2 text-sm max-w-md text-center">
            Trouble scanning? <strong>Type the code</strong> instead — easier and more reliable on a webcam.
          </div>
        ) : (
          <div className="text-sm text-white/85 text-center min-h-[1.25rem] transition-opacity">
            {showTips ? TIPS[tipIdx] : "Hold the code in the box. Brackets turn green when captured."}
          </div>
        )}

        {lastSeen && (
          <div className="rounded-md bg-white/10 px-3 py-1 text-xs font-mono break-all max-w-full">
            Saw: {lastSeen}
          </div>
        )}

        <div className="flex gap-2 w-full max-w-md">
          <Button
            variant="ghost"
            className="flex-1 text-white hover:bg-white/10"
            onClick={() => setShowTips((v) => !v)}
            aria-label="Toggle tips"
          >
            <Lightbulb className="h-4 w-4" /> {showTips ? "Hide tips" : "Tips"}
          </Button>
          {onManualEntry && (
            <Button
              variant={slowScan ? "default" : "secondary"}
              className={cn("flex-1", slowScan && "shadow-lg")}
              onClick={() => { safeStop(); onManualEntry(); onClose?.(); }}
            >
              <Keyboard className="h-4 w-4" /> Type code
            </Button>
          )}
          <Button
            size="lg"
            variant="secondary"
            onClick={() => { safeStop(); onClose?.(); }}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
